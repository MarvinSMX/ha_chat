import { Injectable } from '@nestjs/common';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getOptions } from '../config/options';
import { getAccessToken, getAccessTokenSilent } from './msal-auth.service';
import { RagService } from '../chat/rag.service';
import { chunkText } from '../util/chunk';
import { htmlToText } from '../util/html-to-text';

const DATA_DIR = process.env.DATA_DIR || '/data';
const ONENOTE_SELECTION_PATH = join(DATA_DIR, 'onenote_selection.json');
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
/** Max. Chunks pro Batch – reduziert Speicherverbrauch (vermeidet Heap OOM bei großen Notizbüchern) */
const SYNC_BATCH_SIZE = 30;

async function graphFetch<T>(url: string, accessToken: string, key: string = 'value'): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = url;
  while (next) {
    const res: Response = await fetch(next, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Graph: ${res.status} ${res.statusText}`);
    const text = await res.text();
    if (!text.trim()) throw new Error('Graph: leere Antwort (Unexpected end of JSON input)');
    let data: { [k: string]: unknown };
    try {
      data = JSON.parse(text) as { [k: string]: unknown };
    } catch {
      throw new Error('Graph: ungültiges JSON (Unexpected end of JSON input?)');
    }
    const list = data[key];
    if (Array.isArray(list)) out.push(...(list as T[]));
    next = (data['@odata.nextLink'] as string)?.trim() || null;
  }
  return out;
}

interface GraphNotebook {
  id?: string;
  displayName?: string;
  sectionsUrl?: string;
  sectionGroupsUrl?: string;
}

interface GraphSection {
  id?: string;
  displayName?: string;
  sectionsUrl?: string;
  sectionGroupsUrl?: string;
  parentNotebook?: { id?: string; displayName?: string };
}

interface GraphPage {
  id?: string;
  title?: string;
  lastModifiedDateTime?: string;
  parentSection?: { id?: string; displayName?: string; parentNotebook?: { displayName?: string } };
  links?: { oneNoteWebUrl?: { href?: string }; oneNoteClientUrl?: { href?: string } };
}

@Injectable()
export class OnenoteService {
  constructor(private readonly rag: RagService) {}

  private loadSelection(): { notebook_id: string; notebook_name: string } {
    if (!existsSync(ONENOTE_SELECTION_PATH)) {
      return { notebook_id: '', notebook_name: '' };
    }
    try {
      const data = JSON.parse(readFileSync(ONENOTE_SELECTION_PATH, 'utf-8'));
      return {
        notebook_id: (data.notebook_id ?? '').trim(),
        notebook_name: (data.notebook_name ?? '').trim(),
      };
    } catch {
      return { notebook_id: '', notebook_name: '' };
    }
  }

  async getStatus(): Promise<{
    success: boolean;
    message: string;
    notebooks: Array<{ id?: string; displayName?: string }>;
    configured_notebook_found: boolean | null;
    configured_notebook_name: string | null;
  }> {
    const opts = getOptions();
    const clientId = (opts.microsoft_client_id ?? '').trim();
    if (!clientId) {
      return {
        success: false,
        message: 'Microsoft Client-ID fehlt',
        notebooks: [],
        configured_notebook_found: null,
        configured_notebook_name: null,
      };
    }

    const accessToken = await getAccessTokenSilent();
    if (!accessToken) {
      return {
        success: false,
        message:
          'Kein Token. Bitte zuerst Sync starten (POST /api/sync_onenote) – dann startet der Device Flow und im Log erscheint der Anmelde-Code.',
        notebooks: [],
        configured_notebook_found: null,
        configured_notebook_name: null,
      };
    }

    try {
      const notebooks = await graphFetch<GraphNotebook>(`${GRAPH_BASE}/me/onenote/notebooks`, accessToken);
      const nbList = notebooks.map((n) => ({ id: n.id, displayName: n.displayName }));

      const sel = this.loadSelection();
      const notebookId = (opts.onenote_notebook_id ?? sel.notebook_id ?? '').trim();
      const notebookName = (opts.onenote_notebook_name ?? sel.notebook_name ?? '').trim();

      let configured_notebook_found: boolean | null = null;
      let configured_notebook_name: string | null = null;

      if (notebookId) {
        const found = notebooks.find((n) => (n.id ?? '') === notebookId);
        configured_notebook_found = !!found;
        configured_notebook_name = found?.displayName ?? null;
      } else if (notebookName) {
        const needle = notebookName.toLowerCase();
        const found = notebooks.find(
          (n) =>
            (n.displayName ?? '').trim().toLowerCase() === needle ||
            (n.displayName ?? '').toLowerCase().includes(needle)
        );
        configured_notebook_found = !!found;
        configured_notebook_name = found?.displayName ?? null;
      }

      return {
        success: true,
        message: 'Zugriff auf OneNote OK',
        notebooks: nbList,
        configured_notebook_found,
        configured_notebook_name,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        success: false,
        message: msg,
        notebooks: [],
        configured_notebook_found: null,
        configured_notebook_name: null,
      };
    }
  }

  saveNotebook(notebookId?: string, notebookName?: string): { ok: boolean; notebook_id?: string; notebook_name?: string } {
    const data = {
      notebook_id: notebookId ?? '',
      notebook_name: notebookName ?? '',
    };
    writeFileSync(ONENOTE_SELECTION_PATH, JSON.stringify(data, null, 2));
    return { ok: true, notebook_id: notebookId, notebook_name: notebookName };
  }

  private async fetchAllPages(accessToken: string, notebookId?: string, notebookName?: string): Promise<GraphPage[]> {
    const pages: GraphPage[] = [];

    const resolveNotebook = async (): Promise<GraphNotebook | null> => {
      const notebooks = await graphFetch<GraphNotebook>(`${GRAPH_BASE}/me/onenote/notebooks`, accessToken);
      if (notebookId?.trim()) {
        const n = notebooks.find((nb) => (nb.id ?? '') === notebookId.trim());
        return n ?? null;
      }
      if (notebookName?.trim()) {
        const needle = notebookName.trim().toLowerCase();
        const n = notebooks.find(
          (nb) =>
            (nb.displayName ?? '').trim().toLowerCase() === needle ||
            (nb.displayName ?? '').toLowerCase().includes(needle)
        );
        return n ?? null;
      }
      return null;
    };

    const collectSectionsFromGroup = async (sg: GraphSection, token: string): Promise<GraphSection[]> => {
      const acc: GraphSection[] = [];
      const sgId = sg.id;
      if (!sgId) return acc;
      const secUrl = (sg.sectionsUrl ?? '').trim() || `${GRAPH_BASE}/me/onenote/sectionGroups/${sgId}/sections`;
      const secs = await graphFetch<GraphSection>(secUrl, token);
      acc.push(...secs);
      const childUrl = (sg.sectionGroupsUrl ?? '').trim() || `${GRAPH_BASE}/me/onenote/sectionGroups/${sgId}/sectionGroups`;
      const childGroups = await graphFetch<GraphSection>(childUrl, token);
      for (const c of childGroups) {
        acc.push(...(await collectSectionsFromGroup(c, token)));
      }
      return acc;
    };

    if (notebookId?.trim() || notebookName?.trim()) {
      const nb = await resolveNotebook();
      if (!nb?.id) return [];

      const allSections: GraphSection[] = [];
      const sectionsUrl = (nb.sectionsUrl ?? '').trim();
      if (sectionsUrl) {
        const direct = await graphFetch<GraphSection>(sectionsUrl, accessToken);
        allSections.push(...direct);
      }
      const sectionGroupsUrl = (nb.sectionGroupsUrl ?? '').trim();
      if (sectionGroupsUrl) {
        const groups = await graphFetch<GraphSection>(sectionGroupsUrl, accessToken);
        for (const sg of groups) {
          allSections.push(...(await collectSectionsFromGroup(sg, accessToken)));
        }
      }
      if (allSections.length === 0) {
        const allSec = await graphFetch<GraphSection>(
          `${GRAPH_BASE}/me/onenote/sections?$expand=parentNotebook`,
          accessToken
        );
        const filtered = allSec.filter((s) => (s.parentNotebook?.id ?? '') === nb.id);
        allSections.push(...filtered);
      }

      for (const sec of allSections) {
        const secId = sec.id;
        if (!secId) continue;
        const sectionPages = await graphFetch<GraphPage>(
          `${GRAPH_BASE}/me/onenote/sections/${secId}/pages`,
          accessToken
        );
        for (const p of sectionPages) {
          if (!p.parentSection) p.parentSection = { displayName: sec.displayName ?? '', parentNotebook: { displayName: nb.displayName } };
          else if (!p.parentSection.parentNotebook) p.parentSection.parentNotebook = { displayName: nb.displayName };
          pages.push(p);
        }
      }
      return pages;
    }

    const allSections = await graphFetch<GraphSection>(
      `${GRAPH_BASE}/me/onenote/sections?$expand=parentNotebook`,
      accessToken
    );
    for (const sec of allSections) {
      const secId = sec.id;
      if (!secId) continue;
      const sectionPages = await graphFetch<GraphPage>(
        `${GRAPH_BASE}/me/onenote/sections/${secId}/pages`,
        accessToken
      );
      const parentNb = sec.parentNotebook?.displayName ?? '';
      for (const p of sectionPages) {
        if (!p.parentSection) p.parentSection = { displayName: sec.displayName ?? '', parentNotebook: { displayName: parentNb } };
        else if (!p.parentSection.parentNotebook && parentNb) p.parentSection.parentNotebook = { displayName: parentNb };
        pages.push(p);
      }
    }
    return pages;
  }

  private async fetchPageContent(pageId: string, accessToken: string): Promise<string> {
    const res = await fetch(`${GRAPH_BASE}/me/onenote/pages/${pageId}/content`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.ok ? await res.text() : '';
  }

  /**
   * Sync section-weise: pro Abschnitt Seiten holen, verarbeiten, in Chroma schreiben.
   * Hält nie alle Seiten im Speicher – reduziert Heap-OOM bei großen Notizbüchern.
   */
  async runSync(): Promise<{ documents_added?: number; error?: string }> {
    const opts = getOptions();
    const clientId = (opts.microsoft_client_id ?? '').trim();
    if (!clientId) {
      return { documents_added: 0, error: 'Microsoft Client-ID fehlt' };
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      return { documents_added: 0, error: 'Kein Token. Sync ausführen startet Device Flow – Code erscheint im Log.' };
    }

    const sel = this.loadSelection();
    const notebookId = (opts.onenote_notebook_id ?? sel.notebook_id ?? '').trim() || undefined;
    const notebookName = (opts.onenote_notebook_name ?? sel.notebook_name ?? '').trim() || undefined;

    try {
      const collectSectionsFromGroup = async (sg: GraphSection, token: string): Promise<GraphSection[]> => {
        const acc: GraphSection[] = [];
        const sgId = sg.id;
        if (!sgId) return acc;
        const secUrl = (sg.sectionsUrl ?? '').trim() || `${GRAPH_BASE}/me/onenote/sectionGroups/${sgId}/sections`;
        const secs = await graphFetch<GraphSection>(secUrl, token);
        acc.push(...secs);
        const childUrl = (sg.sectionGroupsUrl ?? '').trim() || `${GRAPH_BASE}/me/onenote/sectionGroups/${sgId}/sectionGroups`;
        const childGroups = await graphFetch<GraphSection>(childUrl, token);
        for (const c of childGroups) {
          acc.push(...(await collectSectionsFromGroup(c, token)));
        }
        return acc;
      };

      let allSections: GraphSection[] = [];
      let nbDisplayName = '';

      if (notebookId?.trim() || notebookName?.trim()) {
        const notebooks = await graphFetch<GraphNotebook>(`${GRAPH_BASE}/me/onenote/notebooks`, accessToken);
        const nb = notebookId?.trim()
          ? notebooks.find((n) => (n.id ?? '') === notebookId.trim()) ?? null
          : notebooks.find(
              (n) =>
                (n.displayName ?? '').trim().toLowerCase() === (notebookName ?? '').trim().toLowerCase() ||
                (n.displayName ?? '').toLowerCase().includes((notebookName ?? '').trim().toLowerCase())
            ) ?? null;
        if (!nb?.id) return { documents_added: 0 };

        nbDisplayName = nb.displayName ?? '';
        const sectionsUrl = (nb.sectionsUrl ?? '').trim();
        if (sectionsUrl) {
          const direct = await graphFetch<GraphSection>(sectionsUrl, accessToken);
          allSections.push(...direct);
        }
        const sectionGroupsUrl = (nb.sectionGroupsUrl ?? '').trim();
        if (sectionGroupsUrl) {
          const groups = await graphFetch<GraphSection>(sectionGroupsUrl, accessToken);
          for (const sg of groups) {
            allSections.push(...(await collectSectionsFromGroup(sg, accessToken)));
          }
        }
        if (allSections.length === 0) {
          const allSec = await graphFetch<GraphSection>(
            `${GRAPH_BASE}/me/onenote/sections?$expand=parentNotebook`,
            accessToken
          );
          allSections = allSec.filter((s) => (s.parentNotebook?.id ?? '') === nb.id);
        }
      } else {
        allSections = await graphFetch<GraphSection>(
          `${GRAPH_BASE}/me/onenote/sections?$expand=parentNotebook`,
          accessToken
        );
      }

      let totalAdded = 0;
      let batchIds: string[] = [];
      let batchDocs: string[] = [];
      let batchMetas: Record<string, unknown>[] = [];

      const flushBatch = async () => {
        if (batchDocs.length === 0) return;
        const embeddings: number[][] = [];
        for (const doc of batchDocs) {
          embeddings.push(await this.rag.getEmbedding(doc));
        }
        await this.rag.addToChroma(batchIds, batchDocs, batchMetas, embeddings);
        totalAdded += batchDocs.length;
        batchIds = [];
        batchDocs = [];
        batchMetas = [];
      };

      for (const sec of allSections) {
        const secId = sec.id;
        if (!secId) continue;
        const sectionPages = await graphFetch<GraphPage>(
          `${GRAPH_BASE}/me/onenote/sections/${secId}/pages`,
          accessToken
        );
        const sectionDisplayName = sec.displayName ?? '';
        const notebookNameForPage = nbDisplayName || (sec.parentNotebook?.displayName ?? '');

        for (const page of sectionPages) {
          const pageId = page.id ?? '';
          const title = (page.title ?? '').replace(/\n/g, ' ').trim() || 'Untitled';
          const lastModified = page.lastModifiedDateTime ?? '';
          const links = page.links ?? {};
          const url =
            (links as { oneNoteWebUrl?: { href?: string }; oneNoteClientUrl?: { href?: string } }).oneNoteWebUrl?.href ??
            (links as { oneNoteWebUrl?: { href?: string }; oneNoteClientUrl?: { href?: string } }).oneNoteClientUrl?.href ??
            '';

          const html = await this.fetchPageContent(pageId, accessToken);
          const text = htmlToText(html);
          const chunks = chunkText(text);

          for (const { text: chunkTextVal, index: chunkIdx } of chunks) {
            batchIds.push(`${pageId}_${chunkIdx}`);
            batchDocs.push(chunkTextVal);
            batchMetas.push({
              pageId,
              chunkIndex: chunkIdx,
              title,
              section: sectionDisplayName,
              notebook: notebookNameForPage,
              lastModified,
              url,
            });
            if (batchDocs.length >= SYNC_BATCH_SIZE) await flushBatch();
          }
        }
      }

      await flushBatch();
      return { documents_added: totalAdded };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { documents_added: 0, error: msg };
    }
  }
}
