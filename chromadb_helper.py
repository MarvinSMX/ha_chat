"""ChromaDB helpers (sync)."""
import hashlib
from typing import Any, List, Optional


def _get_client(path: str):
    import chromadb
    from chromadb.config import Settings
    return chromadb.PersistentClient(path=path, settings=Settings(anonymized_telemetry=False))


def _ensure_collection(client, collection_name: str):
    return client.get_or_create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"},
    )


COLLECTION_NAME = "ha_chat_docs"


def chromadb_add(
    path: str,
    collection_name: str,
    ids: List[str],
    documents: List[str],
    metadatas: List[dict],
    embeddings: Optional[List[List[float]]] = None,
) -> None:
    client = _get_client(path)
    coll = _ensure_collection(client, collection_name)
    if embeddings is not None:
        coll.upsert(ids=ids, documents=documents, metadatas=metadatas, embeddings=embeddings)
    else:
        coll.upsert(ids=ids, documents=documents, metadatas=metadatas)


def chromadb_query(
    path: str,
    collection_name: str,
    query_embedding: List[float],
    n_results: int = 8,
) -> tuple:
    client = _get_client(path)
    coll = client.get_collection(name=collection_name)
    result = coll.query(
        query_embeddings=[query_embedding],
        n_results=n_results,
        include=["documents", "metadatas", "distances"],
    )
    docs = result["documents"] or [[]]
    metas = result["metadatas"] or [[]]
    dists = result["distances"] or [[]]
    return (docs[0], metas[0], dists[0])


def make_doc_id(metadata: dict) -> str:
    page_id = metadata.get("pageId") or metadata.get("page_id")
    chunk_idx = metadata.get("chunkIndex") or metadata.get("chunk_index")
    if page_id is not None and chunk_idx is not None:
        return f"{page_id}_{chunk_idx}"
    return hashlib.sha256(str(metadata.get("content", "")).encode()).hexdigest()[:32]
