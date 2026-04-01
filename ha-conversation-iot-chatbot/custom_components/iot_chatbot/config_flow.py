"""Config flow für die IoT-Chatbot-Integration (Forwarder-Stil)."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResult

from .const import CONF_SYSTEM_PROMPT, CONF_URL, DOMAIN


STEP_USER_DATA_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_URL): str,
        vol.Optional(CONF_SYSTEM_PROMPT): str,
    }
)


async def validate_input(hass: HomeAssistant, data: dict[str, Any]) -> None:
    """Optionale Validierung der Eingaben (kann später erweitert werden)."""
    return data


class IoTChatbotConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Konfigurations-Flow für die IoT-Chatbot-Integration."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Erste Seite des Flows."""
        if user_input is None:
            return self.async_show_form(
                step_id="user", data_schema=STEP_USER_DATA_SCHEMA
            )

        errors: dict[str, str] = {}

        try:
            await validate_input(self.hass, user_input)
        except Exception:  # noqa: BLE001
            errors["base"] = "unknown"
        else:
            return self.async_create_entry(
                title="IoT Chatbot Conversation Agent", data=user_input
            )

        return self.async_show_form(
            step_id="user", data_schema=STEP_USER_DATA_SCHEMA, errors=errors
        )

