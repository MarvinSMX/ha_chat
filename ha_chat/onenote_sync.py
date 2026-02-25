"""OneNote sync – Microsoft Graph, chunk, embed, ChromaDB."""
import re
import asyncio
from typing import Callable, Awaitable, List, Optional, Tuple

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


async def get_token_via_device_flow(
    tenant: str, client_id: str, client_secret: str, session
) -> Optional[Tuple[str, str]]:
    base = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0"
    async with session.post(f"{base}/devicecode", data={"client_id": client_id, "scope": GRAPH_SCOPES}) as resp:
        if resp.status != 200:
            return None
        data = await resp.json()
    device_code = data.get("device_code")
    verification_uri = data.get("verification_uri")
    user_code = data.get("user_code")
    print(f"OneNote Anmeldung: Öffne {verification_uri} und gib ein: {user_code}")
    token_url = f"{base}/token"
    for _ in range(60):
        await asyncio.sleep(5)
        async with session.post(token_url, data={
            "client_id": client_id, "client_secret": client_secret,
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code", "device_code": device_code,
        }) as tok_resp:
            tok_data = await tok_resp.json()
        if "access_token" in tok_data:
            return (tok_data["access_token"], tok_data.get("refresh_token", ""))
        if tok_data.get("error") != "authorization_pending":
            break
    return None


async def refresh_access_token(
    tenant: str, client_id: str, client_secret: str, refresh_token: str, session
) -> Optional[str]:
    url = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
    async with session.post(url, data={
        "client_id": client_id, "client_secret": client_secret,
        "grant_type": "refresh_token", "refresh_token": refresh_token, "scope": GRAPH_SCOPES,
    }) as resp:
        if resp.status != 200:
            return None
        data = await resp.json()
    return data.get("access_token")


async def fetch_pages(access_token: str, session, notebook_id: Optional[str] = None, notebook_name: Optional[str] = None) -> List[dict]:
    """
    Holt alle relevanten Seiten.
    Wenn notebook_id oder notebook_name gesetzt: nur aus diesem Notizbuch (über Abschnitte).
    Sonst: alle Seiten wie bisher über /me/onenote/pages.
    """
    headers = {"Authorization": f"Bearer {access_token}"}

    if notebook_id or (notebook_name and notebook_name.strip()):
        # Notizbücher auflisten
        notebooks = await _fetch_all(GRAPH_NOTEBOOKS_URL, access_token, session)
        target_id = None
        if notebook_id and notebook_id.strip():
            target_id = next((n.get("id") for n in notebooks if (n.get("id") or "") == notebook_id.strip()), None)
            if not target_id:
                return []
        else:
            name_needle = (notebook_name or "").strip().lower()
            for n in notebooks:
                if (n.get("displayName") or "").strip().lower() == name_needle or name_needle in (n.get("displayName") or "").lower():
                    target_id = n.get("id")
                    break
            if not target_id:
                return []
        # Abschnitte des Notizbuchs
        sections_url = f"https://graph.microsoft.com/v1.0/me/onenote/notebooks/{target_id}/sections"
        sections = await _fetch_all(sections_url, access_token, session)
        pages = []
        for sec in sections:
            sec_id = sec.get("id")
            if not sec_id:
                continue
            section_pages_url = f"https://graph.microsoft.com/v1.0/me/onenote/sections/{sec_id}/pages"
            section_pages = await _fetch_all(section_pages_url, access_token, session)
            # parentSection/parentNotebook für Metadaten ergänzen, falls nicht im Antwortformat
            for p in section_pages:
                if not p.get("parentSection"):
                    p["parentSection"] = {"displayName": sec.get("displayName") or "", "id": sec_id}
                if not p.get("parentSection", {}).get("parentNotebook"):
                    p.setdefault("parentSection", {})["parentNotebook"] = next(
                        ({"displayName": n.get("displayName")} for n in notebooks if n.get("id") == target_id), {}
                pages.append(p)
        return pages

    # Alle Seiten (bisheriges Verhalten)
    return await _fetch_all(GRAPH_PAGES_URL, access_token, session)


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
) -> Tuple[int, Optional[str]]:
    if not client_id or not client_secret:
        return (0, None)
    if refresh_token:
        access_token = await refresh_access_token(tenant, client_id, client_secret, refresh_token, session)
    else:
        result = await get_token_via_device_flow(tenant, client_id, client_secret, session)
        if not result:
            return (0, None)
        access_token, refresh_token = result
    if not access_token:
        return (0, None)
    pages = await fetch_pages(access_token, session, notebook_id=notebook_id, notebook_name=notebook_name)
    if not pages:
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
        return (0, refresh_token)
    embeddings = [await get_embedding_fn(d) for d in documents]
    await chromadb_add_fn(ids, documents, metadatas, embeddings)
    return (len(documents), refresh_token)
