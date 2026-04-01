# ha-conversation-iot-chatbot

Custom Integration für Home Assistant, die deinen bestehenden `iot-chatbot`-Backend-Service als **Conversation / Assist Agent** bereitstellt.

Damit kannst du deinen Agenten in Home Assistant unter *Einstellungen → Assist* als Konversationsagent auswählen und über:

- das Assist-UI,
- Sprachassistent / Satelliten (Wyoming),
- `conversation.process`-Service / API

direkt ansprechen.

## Struktur

```text
ha-conversation-iot-chatbot/
  README.md
  Tasks.md
  custom_components/
    iot_chatbot/
      __init__.py
      manifest.json
      const.py
      conversation.py
```

## Installation (lokal)

1. **Repo bereitstellen**

   Dieses Verzeichnis (`ha-conversation-iot-chatbot`) kannst du entweder:

   - als eigenes Git-Repo verwenden (Repo-in-Repo), oder
   - den Ordner `custom_components/iot_chatbot` in dein Home-Assistant-`custom_components`-Verzeichnis kopieren.

2. **Dateien nach Home Assistant kopieren**

   Ziel auf dem HA-Host (Beispiel):

   ```text
   /config/custom_components/iot_chatbot/
     __init__.py
     manifest.json
     const.py
     conversation.py
   ```

3. **`configuration.yaml` konfigurieren**

   Füge einen Block für die Integration hinzu:

   ```yaml
   iot_chatbot:
     base_url: "https://iot-chatbot.https-k8s-prod-intern.rto.de"  # ohne / am Ende
     api_key: ""                         # optional: Bearer-Token, falls das Backend Auth erwartet
     default_area_scope: ""              # optional: Standard-Area-Scope für Anfragen ohne expliziten Bereich
   ```

   Danach Home Assistant neu starten.

4. **Assist-Agent auswählen**

   - Gehe in Home Assistant zu: *Einstellungen → Assist / Konversation*.
   - Wähle als Agent den neuen Eintrag (z. B. „IoT Chatbot“).

## Verhalten

- Die Integration registriert einen Conversation-Agenten, der:
  - Eingaben von Home Assistant (`conversation.process`, Assist UI, Pipelines) entgegennimmt,
  - einen HTTP-Request an deinen `iot-chatbot`-Service schickt (Standard: `POST {base_url}/webhook/chat`),
  - die Antwort (`answer` / `response`) an Home Assistant zurückgibt.

- `session_id`:
  - Basis: `conversation_id` aus Home Assistant (falls vorhanden),
  - sonst ein Fallback („ha-conversation“).

- `area_scope`:
  - Standard: `default_area_scope` aus `configuration.yaml` (kann leer sein),
  - später erweiterbar, um z. B. pro Gerät / Satellite den Scope abzuleiten.

## Anpassungen

- Wenn dein Backend einen anderen Pfad nutzt (`/webhook/inference` statt `/webhook/chat`), kannst du das in `conversation.py` leicht anpassen.
- Für komplexeres Routing (z. B. Mapping von `device_id` auf `area_scope`) kann `conversation.py` entsprechend erweitert werden – die Basis ist bereits so gebaut, dass diese Informationen zur Verfügung stehen.

