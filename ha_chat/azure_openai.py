"""Azure OpenAI – Embedding und Chat (ohne HA, mit asyncio)."""
import asyncio
from typing import List


def _sync_embedding(endpoint: str, api_key: str, deployment: str, text: str) -> List[float]:
    import openai
    client = openai.AzureOpenAI(
        azure_endpoint=endpoint.rstrip("/"),
        api_key=api_key,
        api_version="2024-02-01",
    )
    r = client.embeddings.create(model=deployment, input=text)
    return r.data[0].embedding


def _sync_chat(
    endpoint: str, api_key: str, deployment: str,
    system_prompt: str, user_message: str, temperature: float = 1.0,
) -> str:
    import openai
    client = openai.AzureOpenAI(
        azure_endpoint=endpoint.rstrip("/"),
        api_key=api_key,
        api_version="2024-02-01",
    )
    kwargs = {
        "model": deployment,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
    }
    # Viele Azure-Modelle erlauben nur temperature=1 (Default)
    if temperature != 1.0:
        kwargs["temperature"] = temperature
    r = client.chat.completions.create(**kwargs)
    return (r.choices[0].message.content or "").strip()


async def get_embedding(endpoint: str, api_key: str, deployment: str, text: str) -> List[float]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None,
        lambda: _sync_embedding(endpoint, api_key, deployment, text),
    )


async def chat_completion(
    endpoint: str, api_key: str, deployment: str,
    system_prompt: str, user_message: str, temperature: float = 1.0,
) -> str:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None,
        lambda: _sync_chat(endpoint, api_key, deployment, system_prompt, user_message, temperature),
    )
