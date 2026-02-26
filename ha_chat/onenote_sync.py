"""OneNote sync – Microsoft Graph, chunk, embed, ChromaDB."""
import re
import asyncio
import json
import logging
from typing import Callable, Awaitable, List, Optional, Tuple

logger = logging.getLogger(__name__)

GRAPH_SCOPES = "Notes.Read User.Read"
GRAPH_PAGES_URL = "https://graph.microsoft.com/v1.0/me/onenote/pages"
GRAPH_NOTEBOOKS_URL = "https://graph.microsoft.com/v1.0/me/onenote/notebooks"


async def _fetch_all(url: str, access_token: str, session, key: str = "value") -> List[dict]:
    """Paginierte Abfrage bis alle Einträge da sind."""
    headers = {"Authorization": f"Bearer {access_token}"}
    out = []
    while url:
        async with session.get(url, headers=headers) as resp:
            if resp.status != 200:
                break
            data = await resp.json()
        out.extend(data.get(key) or [])
        url = (data.get("@odata.nextLink") or "").strip() or None
    return out


def _html_to_text(html: str) -> str:
    if not html or not isinstance(html, str):
        return ""
    text = re.sub(r"<script[^>]*>[\s\S]*?</script>", "", html, flags=re.I)
    text = re.sub(r"<style[^>]*>[\s\S]*?</style>", "", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def chunk_text(text: str, chunk_size: int = 3600, overlap: int = 480) -> List[Tuple[str, int]]:
    if not text.strip():
        return []
    out = []
    start, idx = 0, 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        slice_text = text[start:end]
        if end < len(text):
            last_space = slice_text.rfind(" ")
            if last_space > chunk_size // 2:
                end = start + last_space + 1
                slice_text = text[start:end]
        if slice_text.strip():
            out.append((slice_text.strip(), idx))
            idx += 1
        start = end - overlap
        if start >= len(text):
            break
    return out


async def refresh_access_token(
    tenant: str, client_id: str, client_secret: str, refresh_token: str, session
) -> Optional[str]:
    url = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
    async with session.post(url, data={
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "scope": GRAPH_SCOPES,
    }) as resp:
        if resp.status != 200:
            return None
        data = await resp.json()
    return data.get("access_token")


async def check_onenote_access(
    tenant: str, client_id: str, client_secret: str, refresh_token: Optional[str], session,
    notebook_id: Optional[str] = None, notebook_name: Optional[str] = None,
    access_token: Optional[str] = None,
) -> Tuple[bool, str, List[dict], Optional[bool], Optional[str]]:
    """
    Prüft nur, ob auf OneNote zugegriffen werden kann und listet Notizbücher.
    Returns: (success, message, notebooks_list, configured_notebook_found, configured_notebook_name)
    """
    logger.info("OneNote-Zugriffstest gestartet (notebook_id=%s, notebook_name=%s)", notebook_id or "-", notebook_name or "-")
    if not client_id:
        return (False, "Microsoft Client-ID fehlt", [], None, None)
    if not access_token:
        if refresh_token and client_secret:
            access_token = await refresh_access_token(tenant, client_id, client_secret, refresh_token, session)
            if not access_token:
                logger.warning("OneNote-Zugriffstest: Refresh-Token ungültig")
                return (False, "Refresh-Token ungültig oder abgelaufen", [], None, None)
        else:
            return (False, "Kein Token. Sync ausführen (MSAL Device Flow) oder Refresh-Token setzen.", [], None, None)
    try:
        notebooks = await _fetch_all(GRAPH_NOTEBOOKS_URL, access_token, session)
    except Exception as e:
        logger.exception("OneNote-Zugriffstest: Fehler beim Abruf der Notizbücher: %s", e)
        return (False, str(e), [], None, None)
    logger.info("OneNote-Zugriffstest: %d Notizbücher abgerufen: %s", len(notebooks), [n.get("displayName") for n in notebooks])
    nb_list = [{"id": n.get("id"), "displayName": n.get("displayName")} for n in notebooks]
    found = None
    found_name = None
    if notebook_id and notebook_id.strip():
        for n in notebooks:
            if (n.get("id") or "") == notebook_id.strip():
                found = True
                found_name = n.get("displayName")
                logger.info("OneNote-Zugriffstest: Konfiguriertes Notizbuch (ID) gefunden: %s", found_name)
                break
        if found is None:
            logger.warning("OneNote-Zugriffstest: Notizbuch mit ID '%s' nicht gefunden", notebook_id.strip())
            found = False
    elif notebook_name and notebook_name.strip():
        name_needle = notebook_name.strip().lower()
        for n in notebooks:
            if (n.get("displayName") or "").strip().lower() == name_needle or name_needle in (n.get("displayName") or "").lower():
                found = True
                found_name = n.get("displayName")
                logger.info("OneNote-Zugriffstest: Konfiguriertes Notizbuch (Name) gefunden: %s (id=%s)", found_name, n.get("id"))
                break
        if found is None:
            logger.warning("OneNote-Zugriffstest: Kein Notizbuch mit Name passend zu '%s' gefunden", notebook_name.strip())
            found = False
    return (True, "Zugriff auf OneNote OK", nb_list, found, found_name)


async def fetch_pages(access_token: str, session, notebook_id: Optional[str] = None, notebook_name: Optional[str] = None) -> List[dict]:
    """
    Holt alle relevanten Seiten.
    Wenn notebook_id oder notebook_name gesetzt: nur aus diesem Notizbuch (über Abschnitte + Section Groups).
    Sonst: alle Seiten wie bisher über /me/onenote/pages.
    """
    headers = {"Authorization": f"Bearer {access_token}"}

    if notebook_id or (notebook_name and notebook_name.strip()):
        # Notizbücher auflisten
        notebooks = await _fetch_all(GRAPH_NOTEBOOKS_URL, access_token, session)
        logger.info("OneNote: %d Notizbücher abgerufen: %s", len(notebooks), [n.get("displayName") for n in notebooks])
        target_id = None
        target_name = None
        if notebook_id and notebook_id.strip():
            for n in notebooks:
                if (n.get("id") or "") == notebook_id.strip():
                    target_id = n.get("id")
                    target_name = n.get("displayName")
                    break
            if not target_id:
                logger.warning("OneNote: Notizbuch mit ID %s nicht gefunden", notebook_id.strip())
                return []
            logger.info("OneNote: Notizbuch per ID gewählt: %s (%s)", target_name, target_id)
        else:
            name_needle = (notebook_name or "").strip().lower()
            for n in notebooks:
                if (n.get("displayName") or "").strip().lower() == name_needle or name_needle in (n.get("displayName") or "").lower():
                    target_id = n.get("id")
                    target_name = n.get("displayName")
                    break
            if not target_id:
                logger.warning("OneNote: Kein Notizbuch mit Name passend zu '%s' gefunden", notebook_name.strip())
                return []
            logger.info("OneNote: Notizbuch per Name gewählt: %s (%s)", target_name, target_id)

        # Alle Abschnitte sammeln: direkt im Notizbuch + in Section Groups (rekursiv)
        all_sections: List[dict] = []

        async def collect_sections_from_section_group(sg_id: str, sg_display_name: str) -> None:
            secs = await _fetch_all(
                f"https://graph.microsoft.com/v1.0/me/onenote/sectionGroups/{sg_id}/sections",
                access_token, session,
            )
            for s in secs:
                s["_sectionGroupName"] = sg_display_name
                all_sections.append(s)
            # Rekursiv: verschachtelte Section Groups
            child_groups = await _fetch_all(
                f"https://graph.microsoft.com/v1.0/me/onenote/sectionGroups/{sg_id}/sectionGroups",
                access_token, session,
            )
            for sg in child_groups:
                await collect_sections_from_section_group(sg.get("id") or "", sg.get("displayName") or "")

        # 1) Direkte Abschnitte des Notizbuchs
        direct_sections = await _fetch_all(
            f"https://graph.microsoft.com/v1.0/me/onenote/notebooks/{target_id}/sections",
            access_token, session,
        )
        for s in direct_sections:
            s["_sectionGroupName"] = ""
            all_sections.append(s)
        logger.info("OneNote: %d direkte Abschnitte im Notizbuch", len(direct_sections))

        # 2) Section Groups des Notizbuchs (darin liegen oft die eigentlichen Abschnitte)
        section_groups = await _fetch_all(
            f"https://graph.microsoft.com/v1.0/me/onenote/notebooks/{target_id}/sectionGroups",
            access_token, session,
        )
        logger.info("OneNote: %d Section Groups im Notizbuch: %s", len(section_groups), [sg.get("displayName") for sg in section_groups])
        for sg in section_groups:
            await collect_sections_from_section_group(sg.get("id") or "", sg.get("displayName") or "")

        logger.info("OneNote: Insgesamt %d Abschnitte (direkt + in Section Groups)", len(all_sections))

        pages = []
        for sec in all_sections:
            sec_id = sec.get("id")
            if not sec_id:
                continue
            section_pages_url = f"https://graph.microsoft.com/v1.0/me/onenote/sections/{sec_id}/pages"
            section_pages = await _fetch_all(section_pages_url, access_token, session)
            for p in section_pages:
                if not p.get("parentSection"):
                    p["parentSection"] = {"displayName": sec.get("displayName") or "", "id": sec_id}
                if not p.get("parentSection", {}).get("parentNotebook"):
                    nb = next((n for n in notebooks if n.get("id") == target_id), {})
                    p.setdefault("parentSection", {})["parentNotebook"] = {"displayName": nb.get("displayName", "")}
                pages.append(p)
        logger.info("OneNote: Insgesamt %d Seiten aus dem Notizbuch abgerufen", len(pages))
        return pages

    # Alle Seiten (bisheriges Verhalten)
    pages = await _fetch_all(GRAPH_PAGES_URL, access_token, session)
    logger.info("OneNote: Alle Notizbücher – %d Seiten abgerufen", len(pages))
    return pages


async def fetch_page_content(page_id: str, access_token: str, session) -> str:
    url = f"https://graph.microsoft.com/v1.0/me/onenote/pages/{page_id}/content"
    async with session.get(url, headers={"Authorization": f"Bearer {access_token}"}) as resp:
        return await resp.text() if resp.status == 200 else ""


async def run_sync(
    tenant: str, client_id: str, client_secret: str, refresh_token: Optional[str],
    get_embedding_fn: Callable[[str], Awaitable[List[float]]],
    chromadb_add_fn: Callable[..., Awaitable[None]],
    session,
    notebook_id: Optional[str] = None,
    notebook_name: Optional[str] = None,
    access_token: Optional[str] = None,
) -> Tuple[int, Optional[str]]:
    logger.info("OneNote-Sync gestartet (notebook_id=%s, notebook_name=%s)", notebook_id or "(alle)", notebook_name or "-")
    if not client_id:
        logger.warning("OneNote-Sync: Microsoft Client-ID fehlt")
        return (0, None)
    if not access_token:
        if refresh_token and client_secret:
            access_token = await refresh_access_token(tenant, client_id, client_secret, refresh_token, session)
            if not access_token:
                logger.warning("OneNote-Sync: Refresh-Token ungültig oder abgelaufen")
                return (0, None)
        else:
            logger.warning("OneNote-Sync: Weder Access Token (MSAL) noch gültiger Refresh-Token – MSAL-Cache prüfen oder Device Flow auslösen")
            return (0, None)
    logger.info("OneNote-Sync: Zugriffstoken erhalten, rufe Seiten ab ...")
    pages = await fetch_pages(access_token, session, notebook_id=notebook_id, notebook_name=notebook_name)
    if not pages:
        logger.info("OneNote-Sync: Keine Seiten gefunden")
        return (0, refresh_token)
    ids, documents, metadatas = [], [], []
    for page in pages:
        page_id = page.get("id") or ""
        title = (page.get("title") or "").replace("\n", " ").strip() or "Untitled"
        section = (page.get("parentSection") or {}).get("displayName") or ""
        notebook = (page.get("parentSection") or {}).get("parentNotebook", {}).get("displayName") or ""
        last_modified = page.get("lastModifiedDateTime") or ""
        links = page.get("links") or {}
        url = links.get("oneNoteWebUrl", {}).get("href") or links.get("oneNoteClientUrl", {}).get("href") or ""
        html = await fetch_page_content(page_id, access_token, session)
        text = _html_to_text(html)
        for chunk_text_val, chunk_idx in chunk_text(text):
            meta = {"pageId": page_id, "chunkIndex": chunk_idx, "title": title, "section": section, "notebook": notebook, "lastModified": last_modified, "url": url}
            ids.append(f"{page_id}_{chunk_idx}")
            documents.append(chunk_text_val)
            metadatas.append(meta)
    if not documents:
        logger.info("OneNote-Sync: Keine Chunks aus Seiten erzeugt")
        return (0, None)
    logger.info("OneNote-Sync: %d Chunks werden embedded und in ChromaDB geschrieben ...", len(documents))
    embeddings = [await get_embedding_fn(d) for d in documents]
    await chromadb_add_fn(ids, documents, metadatas, embeddings)
    logger.info("OneNote-Sync: Fertig – %d Dokumente in ChromaDB", len(documents))
    return (len(documents), None)
