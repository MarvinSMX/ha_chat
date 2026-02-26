"""
HA Chat (OneNote RAG) – HTTP-Server für die Add-on-App.
Liest Optionen aus /data/options.json, ChromaDB unter /data/chromadb.
"""
import asyncio
import json
import logging
import os
from pathlib import Path

from aiohttp import web, ClientSession

from chromadb_helper import chromadb_add, chromadb_query, make_doc_id, COLLECTION_NAME
import azure_openai
import onenote_sync
import langchain_rag
import msal_auth

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

OPTIONS_PATH = Path("/data/options.json")
REFRESH_TOKEN_PATH = Path("/data/microsoft_refresh_token")
ONENOTE_SELECTION_PATH = Path("/data/onenote_selection.json")
MSAL_CACHE_PATH = "/data/msal_token_cache.json"
CHROMADB_PATH = "/data/chromadb"
OPTIONS = {}


def load_options():
    global OPTIONS
    if OPTIONS_PATH.exists():
        with open(OPTIONS_PATH) as f:
            OPTIONS.update(json.load(f))
    return OPTIONS


def save_options():
    with open(OPTIONS_PATH, "w") as f:
        json.dump(OPTIONS, f, indent=2)


def get_refresh_token():
    if REFRESH_TOKEN_PATH.exists():
        return REFRESH_TOKEN_PATH.read_text().strip() or None
    return OPTIONS.get("microsoft_refresh_token") or None


def set_refresh_token(token: str):
    REFRESH_TOKEN_PATH.write_text(token)


def load_onenote_selection():
    """Liest die gespeicherte Notizbuch-Auswahl (notebook_id, notebook_name). Fallback: None, None."""
    if not ONENOTE_SELECTION_PATH.exists():
        return None, None
    try:
        data = json.loads(ONENOTE_SELECTION_PATH.read_text())
        return (data.get("notebook_id") or "").strip() or None, (data.get("notebook_name") or "").strip() or None
    except Exception:
        return None, None


def save_onenote_selection(notebook_id: str, notebook_name: str):
    ONENOTE_SELECTION_PATH.write_text(json.dumps({"notebook_id": notebook_id or "", "notebook_name": notebook_name or ""}, indent=2))


def get_opts():
    load_options()
    return OPTIONS


def _embedding_config(opts):
    """Endpoint, API-Key und Deployment für Embedding (mit Fallback auf gemeinsame Azure-Felder)."""
    endpoint = (opts.get("azure_embedding_endpoint") or opts.get("azure_endpoint") or "").strip()
    api_key = (opts.get("azure_embedding_api_key") or opts.get("azure_api_key") or "").strip()
    deployment = (opts.get("azure_embedding_deployment") or "text-embedding-ada-002").strip()
    return endpoint, api_key, deployment


def _chat_config(opts):
    """Endpoint, API-Key und Deployment für Chat/LLM (mit Fallback auf gemeinsame Azure-Felder)."""
    endpoint = (opts.get("azure_chat_endpoint") or opts.get("azure_endpoint") or "").strip()
    api_key = (opts.get("azure_chat_api_key") or opts.get("azure_api_key") or "").strip()
    deployment = (opts.get("azure_chat_deployment") or "gpt-4o").strip()
    return endpoint, api_key, deployment


def _add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"


@web.middleware
async def cors_middleware(request, handler):
    if request.method == "OPTIONS":
        return web.Response(headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        })
    resp = await handler(request)
    _add_cors_headers(resp)
    return resp


async def handle_options(request):
    return web.Response(headers={
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    })


async def handle_chat(request):
    try:
        logger.info("Chat-Anfrage erhalten")
        body = await request.json()
        message = (body.get("message") or "").strip()
        if not message:
            return web.json_response({"error": "message fehlt"}, status=400)
        opts = get_opts()
        emb_endpoint, emb_api_key, emb_deploy = _embedding_config(opts)
        chat_endpoint, chat_api_key, chat_deploy = _chat_config(opts)
        if not all([emb_endpoint, emb_api_key, emb_deploy]):
            return web.json_response({"error": "Azure OpenAI (Embedding) nicht konfiguriert"}, status=400)
        if not all([chat_endpoint, chat_api_key, chat_deploy]):
            return web.json_response({"error": "Azure OpenAI (Chat/LLM) nicht konfiguriert"}, status=400)

        loop = asyncio.get_event_loop()
        answer, sources = await loop.run_in_executor(
            None,
            lambda: langchain_rag.run_rag_sync(
                CHROMADB_PATH,
                emb_endpoint, emb_api_key, emb_deploy,
                chat_endpoint, chat_api_key, chat_deploy,
                message,
                k=8,
            ),
        )
        logger.info("Chat-Anfrage beantwortet")
        return web.json_response({"answer": answer, "sources": sources, "actions": []})
    except Exception as e:
        logger.exception("Chat error: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_sync_onenote(request):
    try:
        opts = get_opts()
        client_id = (opts.get("microsoft_client_id") or "").strip()
        client_secret = (opts.get("microsoft_client_secret") or "").strip()
        tenant = (opts.get("microsoft_tenant_id") or "common").strip()
        refresh_token = get_refresh_token() or (opts.get("microsoft_refresh_token") or "").strip() or None
        notebook_id, notebook_name = load_onenote_selection()
        if notebook_id is None and notebook_name is None:
            notebook_id = (opts.get("onenote_notebook_id") or "").strip() or None
            notebook_name = (opts.get("onenote_notebook_name") or "").strip() or None
        logger.info("OneNote-Sync per API aufgerufen (Notizbuch-ID: %s, Name: %s)", notebook_id or "alle", notebook_name or "-")
        if not client_id:
            return web.json_response({"error": "Microsoft Client-ID fehlt"}, status=400)
        emb_endpoint, emb_api_key, emb_deploy = _embedding_config(opts)
        if not all([emb_endpoint, emb_api_key, emb_deploy]):
            return web.json_response({"error": "Azure OpenAI (Embedding) fehlt"}, status=400)

        loop = asyncio.get_event_loop()
        access_token, _ = await loop.run_in_executor(
            None,
            lambda: msal_auth.get_access_token_msal(tenant, client_id, MSAL_CACHE_PATH),
        )
        if not access_token:
            return web.json_response({"error": "OneNote-Anmeldung fehlgeschlagen (MSAL). Log prüfen, ggf. Device Flow erneut ausführen."}, status=401)

        async def get_emb(text):
            return await azure_openai.get_embedding(emb_endpoint, emb_api_key, emb_deploy, text)

        async def add_fn(ids, docs, metas, embs):
            await loop.run_in_executor(
                None,
                lambda: chromadb_add(CHROMADB_PATH, COLLECTION_NAME, ids, docs, metas, embs),
            )

        async with ClientSession() as session:
            count, _ = await onenote_sync.run_sync(
                tenant, client_id, client_secret, refresh_token, get_emb, add_fn, session,
                notebook_id=notebook_id, notebook_name=notebook_name,
                access_token=access_token,
            )
        logger.info("OneNote-Sync abgeschlossen: %d Dokumente in ChromaDB", count)
        return web.json_response({"documents_added": count})
    except Exception as e:
        logger.exception("Sync error: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_onenote_status(request):
    """Prüft, ob auf OneNote und ggf. das konfigurierte Notizbuch zugegriffen werden kann. GET /api/onenote_status"""
    try:
        opts = get_opts()
        client_id = (opts.get("microsoft_client_id") or "").strip()
        client_secret = (opts.get("microsoft_client_secret") or "").strip()
        tenant = (opts.get("microsoft_tenant_id") or "common").strip()
        refresh_token = get_refresh_token() or (opts.get("microsoft_refresh_token") or "").strip() or None
        notebook_id, notebook_name = load_onenote_selection()
        if notebook_id is None and notebook_name is None:
            notebook_id = (opts.get("onenote_notebook_id") or "").strip() or None
            notebook_name = (opts.get("onenote_notebook_name") or "").strip() or None

        access_token = None
        if client_id:
            loop = asyncio.get_event_loop()
            access_token, _ = await loop.run_in_executor(
                None,
                lambda: msal_auth.get_access_token_msal(tenant, client_id, MSAL_CACHE_PATH),
            )
        async with ClientSession() as session:
            ok, message, notebooks, configured_found, configured_name = await onenote_sync.check_onenote_access(
                tenant, client_id, client_secret, refresh_token, session,
                notebook_id=notebook_id, notebook_name=notebook_name,
                access_token=access_token,
            )
        return web.json_response({
            "success": ok,
            "message": message,
            "notebooks": notebooks,
            "configured_notebook_found": configured_found,
            "configured_notebook_name": configured_name,
        })
    except Exception as e:
        logger.exception("OneNote-Status error: %s", e)
        return web.json_response({"success": False, "message": str(e), "notebooks": [], "configured_notebook_found": None, "configured_notebook_name": None}, status=500)


async def handle_onenote_notebook(request):
    """Speichert die gewählte Notizbuch-Auswahl. POST /api/onenote_notebook Body: { notebook_id, notebook_name }"""
    try:
        body = await request.json() or {}
        notebook_id = (body.get("notebook_id") or "").strip() or None
        notebook_name = (body.get("notebook_name") or "").strip() or None
        save_onenote_selection(notebook_id or "", notebook_name or "")
        logger.info("OneNote-Auswahl gespeichert: id=%s name=%s", notebook_id or "-", notebook_name or "-")
        return web.json_response({"ok": True, "notebook_id": notebook_id, "notebook_name": notebook_name})
    except Exception as e:
        logger.exception("OneNote notebook save error: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_execute_action(request):
    try:
        body = await request.json()
        utterance = (body.get("utterance") or "").strip()
        if not utterance:
            return web.json_response({"error": "utterance fehlt"}, status=400)
        opts = get_opts()
        ha_url = (opts.get("ha_url") or "").strip()
        ha_token = (opts.get("ha_token") or "").strip()
        if not ha_url or not ha_token:
            return web.json_response({"error": "HA URL/Token in App-Optionen eintragen"}, status=400)
        async with ClientSession() as session:
            async with session.post(
                f"{ha_url.rstrip('/')}/api/conversation",
                json={"text": utterance},
                headers={"Authorization": f"Bearer {ha_token}", "Content-Type": "application/json"},
            ) as resp:
                data = await resp.json() if resp.status == 200 else {}
        reply = (data.get("response") or data.get("reply") or {}).get("response") or data.get("response") or str(data)
        return web.json_response({"response": reply})
    except Exception as e:
        logger.exception("Execute error: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_add_documents(request):
    try:
        body = await request.json()
        documents = body.get("documents") or []
        if not documents:
            return web.json_response({"ok": True})
        opts = get_opts()
        emb_endpoint, emb_api_key, emb_deploy = _embedding_config(opts)
        ids, docs, metas, embeddings = [], [], [], []
        for item in documents:
            content = item.get("content") or ""
            meta = item.get("metadata") or {}
            emb = item.get("embedding")
            ids.append(make_doc_id(meta))
            docs.append(content)
            metas.append(meta)
            embeddings.append(emb)
        if not all(embeddings) and emb_endpoint and emb_api_key and emb_deploy:
            for i, (content, emb) in enumerate(zip(docs, embeddings)):
                if emb is None:
                    embeddings[i] = await azure_openai.get_embedding(emb_endpoint, emb_api_key, emb_deploy, content)
        elif not all(embeddings):
            return web.json_response({"error": "embedding fehlt oder Azure konfigurieren"}, status=400)
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: chromadb_add(CHROMADB_PATH, COLLECTION_NAME, ids, docs, metas, embeddings),
        )
        return web.json_response({"ok": True, "count": len(ids)})
    except Exception as e:
        logger.exception("Add documents error: %s", e)
        return web.json_response({"error": str(e)}, status=500)


async def _run_startup_sync(app):
    """Startet beim App-Start den OneNote-Sync im Hintergrund, damit der Server sofort erreichbar ist (kein Bad Gateway)."""

    async def do_sync():
        try:
            opts = get_opts()
            client_id = (opts.get("microsoft_client_id") or "").strip()
            if not client_id:
                logger.info("OneNote-Sync beim Start übersprungen: Microsoft Client-ID nicht gesetzt.")
                return
            emb_endpoint, emb_api_key, emb_deploy = _embedding_config(opts)
            if not all([emb_endpoint, emb_api_key, emb_deploy]):
                logger.info("OneNote-Sync beim Start übersprungen: Azure OpenAI (Embedding) nicht konfiguriert.")
                return
            tenant = (opts.get("microsoft_tenant_id") or "common").strip()
            refresh_token = get_refresh_token() or (opts.get("microsoft_refresh_token") or "").strip() or None
            notebook_id, notebook_name = load_onenote_selection()
            if notebook_id is None and notebook_name is None:
                notebook_id = (opts.get("onenote_notebook_id") or "").strip() or None
                notebook_name = (opts.get("onenote_notebook_name") or "").strip() or None

            loop = asyncio.get_event_loop()
            access_token, _ = await loop.run_in_executor(
                None,
                lambda: msal_auth.get_access_token_msal(tenant, client_id, MSAL_CACHE_PATH),
            )
            if not access_token:
                logger.warning("OneNote-Sync beim Start: Kein Token (MSAL). Log prüfen, ggf. Device Flow im Log abwarten.")
                return

            async def get_emb(text):
                return await azure_openai.get_embedding(emb_endpoint, emb_api_key, emb_deploy, text)

            async def add_fn(ids, docs, metas, embs):
                await loop.run_in_executor(None, lambda: chromadb_add(CHROMADB_PATH, COLLECTION_NAME, ids, docs, metas, embs))

            async with ClientSession() as session:
                count, _ = await onenote_sync.run_sync(
                    tenant, client_id, "", refresh_token, get_emb, add_fn, session,
                    notebook_id=notebook_id, notebook_name=notebook_name,
                    access_token=access_token,
                )
            logger.info("OneNote-Sync beim Start abgeschlossen: %d Dokumente in ChromaDB", count)
        except BaseException as e:
            logger.exception("OneNote-Sync beim Start fehlgeschlagen (Container läuft weiter): %s", e)

    task = asyncio.create_task(do_sync())
    app["_startup_sync_task"] = task


def create_app():
    app = web.Application(middlewares=[cors_middleware])
    app.on_startup.append(_run_startup_sync)
    app.router.add_route("OPTIONS", "/api/chat", handle_options)
    app.router.add_route("OPTIONS", "/api/sync_onenote", handle_options)
    app.router.add_route("OPTIONS", "/api/execute_action", handle_options)
    app.router.add_route("OPTIONS", "/api/add_documents", handle_options)
    app.router.add_route("OPTIONS", "/api/onenote_status", handle_options)
    app.router.add_route("OPTIONS", "/api/onenote_notebook", handle_options)
    app.router.add_post("/api/chat", handle_chat)
    app.router.add_post("/api/sync_onenote", handle_sync_onenote)
    app.router.add_get("/api/onenote_status", handle_onenote_status)
    app.router.add_post("/api/onenote_notebook", handle_onenote_notebook)
    app.router.add_post("/api/execute_action", handle_execute_action)
    app.router.add_post("/api/add_documents", handle_add_documents)
    www = Path(__file__).parent / "www"
    if www.exists():
        app.router.add_get("/", lambda r: web.FileResponse(www / "index.html"))
        app.router.add_static("/", www, name="www")
    return app


def main():
    load_options()
    app = create_app()
    # Ingress erwartet Port 8099; direkter Zugriff über config ports (z. B. 8765 -> 8099)
    port = int(os.environ.get("SUPERVISOR_INGRESS_PORT", "8099"))
    web.run_app(app, host="0.0.0.0", port=port)


if __name__ == "__main__":
    main()
