## Tasks – ha-conversation-iot-chatbot

### Ziel

Custom Integration für Home Assistant, die deinen bestehenden `iot-chatbot`-Backend-Service als **Conversation / Assist Agent** verfügbar macht. So kann dein Agent direkt in der Assist-Konfiguration als Konversationsagent ausgewählt und von Pipelines (Voice, Text, Wyoming) verwendet werden.

### Erledigt

- [x] Basis-Repo im bestehenden Projekt angelegt: `ha-conversation-iot-chatbot/` (Repo-in-Repo möglich)
- [x] Struktur für Home-Assistant-Custom-Integration erstellt:
  - `custom_components/iot_chatbot/__init__.py`
  - `custom_components/iot_chatbot/manifest.json`
  - `custom_components/iot_chatbot/const.py`
  - `custom_components/iot_chatbot/conversation.py`
- [x] Einfacher Conversation-Agent implementiert, der:
  - Text von Home Assistant (`conversation.process` / Assist) entgegennimmt
  - eine HTTP-Request an das `iot-chatbot`-Backend sendet
  - die Antwort als `ConversationResult` an Home Assistant zurückgibt
- [x] `Tasks.md` und `README.md` für das neue Repo erstellt

### Offen / Nächste Schritte

- [ ] Exakte Backend-URL und ggf. API-Key in `configuration.yaml` dokumentiert setzen (siehe README)
- [ ] In Home Assistant prüfen, dass der Agent unter *Einstellungen → Assist / Konversation* als auswählbarer Agent erscheint
- [ ] Optional: Fehlertexte / Lokalisierung verbessern (Deutsch/Englisch, klarere Meldungen bei Backend-Timeouts)
- [ ] Optional: `conversation_id`, `device_id` und `language` gezielt auf `session_id` / `area_scope` im Backend mappen (z. B. pro Tablet / Satellite eigener Scope)
- [ ] Optional: Config-Flow (`config_flow.py`) ergänzen, um die Integration komfortabel über die UI zu konfigurieren statt nur via `configuration.yaml`
- [ ] Optional: Unit-Tests und CI-Workflow für das Sub-Repo ergänzen

