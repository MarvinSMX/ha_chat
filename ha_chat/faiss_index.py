#!/usr/bin/env python3
import argparse
import json
import os
from typing import Any

import faiss  # type: ignore
import numpy as np


def _load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_json(path: str, data: Any) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)


def cmd_build(input_json: str, index_file: str, meta_file: str) -> None:
    payload = _load_json(input_json)
    vectors = payload.get("vectors", [])
    ids = payload.get("ids", [])
    if not vectors or not ids or len(vectors) != len(ids):
        raise ValueError("vectors/ids missing or length mismatch")
    arr = np.asarray(vectors, dtype="float32")
    if arr.ndim != 2 or arr.shape[0] == 0 or arr.shape[1] == 0:
        raise ValueError("invalid vector shape")
    faiss.normalize_L2(arr)
    dim = arr.shape[1]
    index = faiss.IndexFlatIP(dim)
    index.add(arr)
    os.makedirs(os.path.dirname(index_file), exist_ok=True)
    faiss.write_index(index, index_file)
    _save_json(meta_file, {"ids": ids, "dim": int(dim), "count": int(arr.shape[0])})
    print(json.dumps({"ok": True, "count": int(arr.shape[0]), "dim": int(dim)}))


def cmd_search(query_json: str, index_file: str, meta_file: str, top_k: int) -> None:
    if not os.path.exists(index_file) or not os.path.exists(meta_file):
        print(json.dumps({"ok": True, "hits": []}))
        return
    payload = _load_json(query_json)
    query = payload.get("query_vector", [])
    if not query:
        print(json.dumps({"ok": True, "hits": []}))
        return
    meta = _load_json(meta_file)
    ids = meta.get("ids", [])
    q = np.asarray([query], dtype="float32")
    faiss.normalize_L2(q)
    index = faiss.read_index(index_file)
    k = max(1, min(int(top_k), len(ids)))
    scores, idxs = index.search(q, k)
    hits = []
    for i, score in zip(idxs[0], scores[0]):
        if i < 0 or i >= len(ids):
            continue
        hits.append({"id": ids[i], "score": float(score)})
    print(json.dumps({"ok": True, "hits": hits}))


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_build = sub.add_parser("build")
    p_build.add_argument("--input-json", required=True)
    p_build.add_argument("--index-file", required=True)
    p_build.add_argument("--meta-file", required=True)

    p_search = sub.add_parser("search")
    p_search.add_argument("--query-json", required=True)
    p_search.add_argument("--index-file", required=True)
    p_search.add_argument("--meta-file", required=True)
    p_search.add_argument("--top-k", type=int, required=True)

    args = parser.parse_args()
    if args.cmd == "build":
        cmd_build(args.input_json, args.index_file, args.meta_file)
    elif args.cmd == "search":
        cmd_search(args.query_json, args.index_file, args.meta_file, args.top_k)
    else:
        raise ValueError("unknown command")


if __name__ == "__main__":
    main()

