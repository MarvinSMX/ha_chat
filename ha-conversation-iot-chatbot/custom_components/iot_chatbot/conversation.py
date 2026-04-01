"""Conversation agent, der Anfragen an den externen IoT-Chatbot-Backend-Service forwarded."""
from __future__ import annotations

import aiohttp
import base64
import json
import logging
from typing import Any, Literal

from homeassistant.components import conversation
from homeassistant.const import MATCH_ALL
from homeassistant.core import HomeAssistant
from homeassistant.helpers import intent

from .const import CONF_SYSTEM_PROMPT, CONF_URL

_LOGGER = logging.getLogger(__name__)


class IoTChatbotAgent(conversation.AbstractConversationAgent):
    """Conversation-Agent, der das IoT-Backend via HTTP aufruft (angelehnt an ConversationForwarder)."""

    def __init__(self, hass: HomeAssistant, entry, config_url: str) -> None:
        """Initialisiere den Agenten."""
        self.hass = hass
        self.entry = entry
        self.url = (config_url or "").strip()
        _LOGGER.debug("IoTChatbotAgent URL: %s", self.url)

    @property
    def supported_languages(self) -> list[str] | Literal["*"]:
        """Unterstützte Sprachen (hier: alle)."""
        return MATCH_ALL

    async def _call_post_request(self, url: str, auth: str | None, data: dict[str, Any]) -> str:
        """HTTP-POST zum Backend ausführen und Rohtext zurückgeben."""
        async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(verify_ssl=False)) as session:
            headers: dict[str, str] = {}
            async with session.post(url, json=data, headers=headers) as response:
                text = await response.text()
                _LOGGER.debug("IoTChatbot POST %s → %s", url, text)
                return text

    async def async_process(
        self, user_input: conversation.ConversationInput
    ) -> conversation.ConversationResult:
        """Verarbeite eine Konversationsanfrage von Home Assistant."""
        if not self.url:
            intent_response = intent.IntentResponse(language=user_input.language)
            intent_response.async_set_speech("Der IoT-Chatbot ist nicht konfiguriert (URL fehlt).")
            return conversation.ConversationResult(
                response=intent_response,
                conversation_id=user_input.conversation_id,
                continue_conversation=False,
            )

        text = (user_input.text or "").strip()
        if not text:
            intent_response = intent.IntentResponse(language=user_input.language)
            intent_response.async_set_speech("Ich habe keine Eingabe erhalten.")
            return conversation.ConversationResult(
                response=intent_response,
                conversation_id=user_input.conversation_id,
                continue_conversation=False,
            )

        # Optionaler Systemprompt aus Assist/Conversation (extra_system_prompt)
        # oder aus der Integrationskonfiguration (default Systemprompt).
        extra_prompt = (getattr(user_input, "extra_system_prompt", None) or "").strip()
        default_prompt = (self.entry.data.get(CONF_SYSTEM_PROMPT, "") or "").strip()
        system_prompt = extra_prompt or default_prompt

        # Payload für dein ha-backend
        payload: dict[str, Any] = {
            "message": text,
            "session_id": (user_input.conversation_id or "") or "ha-assist",
            "area_scope": "",
        }
        if system_prompt:
            payload["system_prompt"] = system_prompt

        # Basis-URL aus Config ggf. auf /webhook/chat normalisieren, falls nur Host eingetragen wurde.
        target_url = self.url.rstrip("/")
        if not target_url.endswith("/webhook/chat"):
            target_url = f"{target_url}/webhook/chat"

        try:
            raw = await self._call_post_request(target_url, None, payload)
            data = json.loads(raw)
        except aiohttp.ClientError:
            _LOGGER.warning("IoTChatbot: Unable to connect to endpoint %s", self.url)
            answer = "Sorry, ich kann den IoT-Chatbot gerade nicht erreichen."
            continue_conv = False
        except json.decoder.JSONDecodeError as exc:
            _LOGGER.warning("IoTChatbot: JSON-Fehler %s", exc)
            _LOGGER.debug("IoTChatbot: Raw response: %s", raw)
            answer = "Sorry, ich habe keine gültige Antwort vom IoT-Backend erhalten."
            continue_conv = False
        else:
            if isinstance(data, dict):
                # Falls das Backend explizit einen Fehler liefert, gib diesen direkt aus.
                if data.get("error"):
                    answer = str(data.get("error")).strip()
                else:
                    answer = (
                        str(data.get("answer") or data.get("response") or "").strip()
                        or "Der IoT-Chatbot hat keine Antwort zurückgegeben."
                    )
                continue_conv = bool(data.get("continue_conversation", False))
            else:
                answer = "Der IoT-Chatbot hat eine unerwartete Antwort zurückgegeben."
                continue_conv = False

        intent_response = intent.IntentResponse(language=user_input.language)
        intent_response.async_set_speech(answer)

        return conversation.ConversationResult(
            response=intent_response,
            conversation_id=user_input.conversation_id,
            continue_conversation=continue_conv,
        )