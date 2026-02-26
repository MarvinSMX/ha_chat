import { Injectable } from '@nestjs/common';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getOptions } from '../config/options';

const DATA_DIR = process.env.DATA_DIR || '/data';
const ONENOTE_SELECTION_PATH = join(DATA_DIR, 'onenote_selection.json');

@Injectable()
export class OnenoteService {
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
    // TODO: MSAL + Graph für echte Notizbuch-Liste
    return {
      success: true,
      message: 'Zugriff auf OneNote OK (Stub – MSAL/Graph noch anbinden)',
      notebooks: [],
      configured_notebook_found: null,
      configured_notebook_name: null,
    };
  }

  saveNotebook(notebookId?: string, notebookName?: string): { ok: boolean; notebook_id?: string; notebook_name?: string } {
    const data = {
      notebook_id: notebookId ?? '',
      notebook_name: notebookName ?? '',
    };
    writeFileSync(ONENOTE_SELECTION_PATH, JSON.stringify(data, null, 2));
    return { ok: true, notebook_id: notebookId, notebook_name: notebookName };
  }

  async runSync(): Promise<{ documents_added?: number; error?: string }> {
    // TODO: MSAL Token, Graph Sections/Pages, chunk, embed, Chroma add
    return { documents_added: 0 };
  }
}
