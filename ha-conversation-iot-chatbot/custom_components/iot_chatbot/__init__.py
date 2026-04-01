"""IoT Chatbot Conversation Integration (Forwarder-Stil)."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.components import conversation as ha_conversation
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType
from homeassistant.helpers import config_validation as cv

from .const import CONF_URL, DOMAIN
from .conversation import IoTChatbotAgent

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """YAML-Setup wird nicht genutzt (nur Config-Flow)."""
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up IoT Chatbot Conversation Agent from a config entry."""
    _LOGGER.info("IoT Chatbot entry.data: %s", entry.data)

    url = entry.data.get(CONF_URL, "") or ""

    if not url:
        _LOGGER.error("IoT Chatbot: URL ist leer – bitte in der Integration konfigurieren.")

    ha_conversation.async_set_agent(hass, entry, IoTChatbotAgent(hass, entry, url))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    ha_conversation.async_unset_agent(hass, entry)
    return True

