"""
LangChain-basierter RAG: ChromaDB-Retriever + Azure OpenAI.
Sync-Funktion für run_in_executor (LangChain ist synchron).
"""
from typing import List, Tuple

from chromadb_helper import COLLECTION_NAME


def run_rag_sync(
    chromadb_path: str,
    emb_endpoint: str,
    emb_api_key: str,
    emb_deployment: str,
    chat_endpoint: str,
    chat_api_key: str,
    chat_deployment: str,
    question: str,
    k: int = 8,
) -> Tuple[str, List[dict]]:
    """
    Führt RAG mit LangChain aus: Retriever (Chroma) + Chat (Azure).
    Returns: (answer, sources) mit sources = [{"title", "url", "score"}, ...]
    """
    from langchain_chroma import Chroma
    from langchain_openai import AzureOpenAIEmbeddings, AzureChatOpenAI
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_core.output_parsers import StrOutputParser
    from langchain_core.documents import Document

    embeddings = AzureOpenAIEmbeddings(
        azure_endpoint=emb_endpoint.rstrip("/"),
        api_key=emb_api_key,
        api_version="2024-02-01",
        azure_deployment=emb_deployment,
    )
    vectorstore = Chroma(
        collection_name=COLLECTION_NAME,
        embedding_function=embeddings,
        persist_directory=chromadb_path,
    )
    retriever = vectorstore.as_retriever(search_kwargs={"k": k})

    llm = AzureChatOpenAI(
        azure_endpoint=chat_endpoint.rstrip("/"),
        api_key=chat_api_key,
        api_version="2024-02-01",
        azure_deployment=chat_deployment,
        temperature=1.0,
    )

    system = (
        "Du bist ein hilfreicher Assistent mit Zugriff auf die Wissensbasis des Nutzers. "
        "Der Kontext stammt aus seinen synchronisierten Dokumenten (z. B. OneNote). "
        "Antworte knapp auf Deutsch. Beziehe dich auf den Kontext und nenne Quellen (z. B. [1], [2]). "
        "Wenn du nach deinem Zugriff gefragt wirst: Erkläre, dass du die Inhalte aus der Wissensbasis (OneNote-Sync) nutzt. "
        "Erfinde nichts; wenn der Kontext nichts Relevantes enthält, sag das."
    )
    prompt = ChatPromptTemplate.from_messages([
        ("system", system),
        ("human", "Kontext:\n\n{context}\n\n---\n\nFrage: {question}"),
    ])

    def format_docs(docs: List[Document]) -> str:
        if not docs:
            return "(Keine passenden Dokumente gefunden.)"
        return "\n\n".join(f"[{i+1}] {d.page_content}" for i, d in enumerate(docs))

    docs = retriever.invoke(question)
    context_str = format_docs(docs)
    chain = prompt | llm | StrOutputParser()
    answer = chain.invoke({"context": context_str, "question": question})

    sources = []
    for i, d in enumerate(docs):
        meta = d.metadata or {}
        title = meta.get("title") or meta.get("section") or f"Quelle {i+1}"
        url = meta.get("url") or ""
        sources.append({"title": title, "url": url, "score": 1.0})

    return answer, sources
