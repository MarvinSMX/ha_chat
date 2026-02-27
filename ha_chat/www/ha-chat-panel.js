/**
 * HA Chat – Frontend, Inference über N8N-Webhook.
 * Embedding/Sync in N8N. Entity-Steuerung über HA-Proxy.
 */
(function () {

  /* ── Prompt-Vorschläge (Fallback; werden durch /config.json überschrieben) ── */
  var PROMPT_SUGGESTIONS = [
    'Was kann ich dich fragen?',
    'Welche Lichter sind gerade an?',
    'Zeig mir den Status der Heizung',
    'Welche Geräte sind aktiv?',
  ];

  /* ── Template ─────────────────────────────────────────────────────── */
  var template = document.createElement('template');
  template.innerHTML = `
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css">
    <style>
      .mdi { display: inline-block; font: normal normal normal 24px/1 "Material Design Icons"; font-size: inherit; text-rendering: auto; line-height: inherit; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
      .mdi-lightbulb::before        { content: "\F0335"; }
      .mdi-lightbulb-outline::before{ content: "\F0336"; }
      .mdi-flash::before             { content: "\F0239"; }
      .mdi-flash-off::before         { content: "\F023A"; }
      .mdi-toggle-switch::before     { content: "\F0533"; }
      .mdi-toggle-switch-off::before { content: "\F0534"; }
      .mdi-thermostat::before        { content: "\F393"; }
      .mdi-blinds::before            { content: "\F0BFC"; }
      .mdi-blinds-open::before       { content: "\F0BFD"; }
      .mdi-fan::before               { content: "\F0210"; }
      .mdi-lock::before              { content: "\F033E"; }
      .mdi-lock-open::before         { content: "\F033F"; }
      .mdi-cast::before              { content: "\F00B7"; }
      .mdi-cast-off::before          { content: "\F07A3"; }
      .mdi-motion-sensor::before     { content: "\F0E4A"; }
      .mdi-circle-outline::before    { content: "\F0765"; }
      .mdi-help-circle::before       { content: "\F02D6"; }
      .mdi-power::before             { content: "\F0425"; }
      .mdi-power-plug::before        { content: "\F06A5"; }
      .mdi-power-plug-off::before    { content: "\F06A6"; }
      .mdi-door::before              { content: "\F0E59"; }
      .mdi-door-open::before         { content: "\F0E5A"; }
      .mdi-window-closed::before     { content: "\F0559"; }
      .mdi-window-open::before       { content: "\F055A"; }
      .mdi-water-heater::before      { content: "\F09A1"; }
      .mdi-air-conditioner::before   { content: "\F0006"; }
      .mdi-television::before        { content: "\F0502"; }
      .mdi-speaker::before           { content: "\F04C3"; }
      .mdi-cellphone::before         { content: "\F00B2"; }
      .mdi-car::before               { content: "\F00E7"; }
      .mdi-garage::before            { content: "\F069B"; }
      .mdi-garage-open::before       { content: "\F069C"; }
      .mdi-alarm::before             { content: "\F0020"; }
      .mdi-alarm-off::before         { content: "\F0024"; }
      .mdi-smoke-detector::before    { content: "\F0E08"; }
      .mdi-water::before             { content: "\F0550"; }
      .mdi-robot-vacuum::before      { content: "\F0DA1"; }
      .mdi-washing-machine::before   { content: "\F072D"; }

      *, *::before, *::after { box-sizing: border-box; }
      :host { display: block; height: 100%; }
      .container { height: 100%; display: flex; flex-direction: column; align-items: center; padding: 16px; background: #1c1c1c; color: #e0e0e0; font-family: inherit; }
      .chat-inner { width: 100%; flex: 1; display: flex; flex-direction: column; min-height: 0; }

      /* ── Thread: volle Breite, Scrollbar am Rand ── */
      .thread { flex: 1; width: 100%; overflow-y: auto; margin-bottom: 12px; min-height: 0; }
      /* Custom vertical scrollbar */
      .thread::-webkit-scrollbar { width: 5px; }
      .thread::-webkit-scrollbar-track { background: transparent; }
      .thread::-webkit-scrollbar-thumb { background: #383838; border-radius: 3px; }
      .thread::-webkit-scrollbar-thumb:hover { background: #555; }

      /* ── Nachrichten-Spalte: gleiche Breite wie Input ── */
      .msg-col { width: min(100%, 620px); margin: 0 auto; display: flex; flex-direction: column; align-items: flex-start; padding: 4px 0 8px; }
      .msg { margin: 6px 0; padding: 11px 15px; border-radius: 18px; max-width: 92%; width: fit-content; line-height: 1.55; font-size: 0.97rem; }
      .msg.user { background: #009AC7; color: #fff; align-self: flex-end; border-bottom-right-radius: 4px; }
      .msg.assistant { background: #2d2d2d; border: 1px solid #3a3a3a; border-bottom-left-radius: 4px; }
      /* ── Stream-Cursor ── */
      .stream-cursor { display: inline-block; width: 2px; height: 1em; background: #009AC7; margin-left: 2px; vertical-align: text-bottom; animation: cur-blink .6s step-end infinite; }
      @keyframes cur-blink { 0%,100%{opacity:1} 50%{opacity:0} }

      /* ── Markdown ── */
      .content { white-space: pre-wrap; word-break: break-word; }
      .content h3, .content h4, .content h5 { margin: 10px 0 4px; font-size: 1em; color: #fff; }
      .content h3 { font-size: 1.05em; }
      .content ul { margin: 4px 0 4px 18px; padding: 0; }
      .content li { margin: 2px 0; }
      .content strong { color: #e8e8e8; }
      .content em { font-style: italic; color: #ccc; }
      .content code { background: #1a1a1a; color: #9cdcfe; border-radius: 4px; padding: 1px 5px; font-size: 0.88em; font-family: monospace; }
      .content hr { border: none; border-top: 1px solid #3a3a3a; margin: 8px 0; }
      .content p { margin: 0 0 6px; }

      /* ── Einheitlicher Badge-Stil ── */
      .badge { display: inline-block; margin: 0 2px 2px 0; padding: 1px 10px; border-radius: 12px; font-size: 0.83em; font-family: inherit; vertical-align: middle; text-decoration: none; border: none; cursor: pointer; transition: filter .15s; }
      .badge:hover { filter: brightness(1.18); }
      .badge.entity-on      { background: #009AC7; color: #fff; }
      .badge.entity-off     { background: #3a3a3a; color: #888; }
      .badge.entity-unknown { background: #2d2d2d; color: #777; }

      /* Quellen & Links: gleicher Badge, immer cyan */
      .content a.content-link { background: #009AC7; color: #fff; }
      .content a.content-link:hover { filter: brightness(0.9); }

      /* Quellen-Zeile */
      .sources { margin-top: 8px; font-size: 0.84em; display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
      .sources span.sources-label { color: #777; margin-right: 2px; }

      /* Aktions-Buttons (utterance) */
      .actions { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }

      /* ── Typing ── */
      .typing-indicator { display: inline-flex; gap: 4px; padding: 2px 0; }
      .typing-indicator span { width: 6px; height: 6px; border-radius: 50%; background: #009AC7; animation: blink .6s ease-in-out infinite both; }
      .typing-indicator span:nth-child(2) { animation-delay: .1s; }
      .typing-indicator span:nth-child(3) { animation-delay: .2s; }
      @keyframes blink { 0%,80%,100%{transform:scale(.6);opacity:.5} 40%{transform:scale(1);opacity:1} }

      /* ── Input-Bereich ── */
      .input-area { flex-shrink: 0; width: min(100%, 620px); margin: 0 auto; overflow: visible; }
      .prompt-suggestions { display: flex; flex-wrap: nowrap; gap: 6px; margin-bottom: 8px; overflow: hidden; align-items: center; }
      .prompt-suggestion { flex: 0 0 auto; padding: 5px 13px; background: transparent; border: 1px solid #3a3a3a; color: #aaa; border-radius: 16px; cursor: pointer; font-size: 0.83em; font-family: inherit; white-space: nowrap; transition: border-color .15s, color .15s; }
      .prompt-suggestion:hover { border-color: #009AC7; color: #009AC7; }
      .prompt-suggestion-more { flex: 0 0 auto; padding: 5px 10px; background: #2d2d2d; border: 1px solid #3a3a3a; color: #888; border-radius: 16px; font-size: 0.83em; font-family: inherit; cursor: pointer; }
.prompt-suggestion-more:hover { border-color: #555; color: #aaa; }
      .input-wrapper { display: flex; align-items: center; gap: 10px; padding: 7px 7px 7px 18px; background: #2d2d2d; border: 1px solid #3a3a3a; border-radius: 26px; box-shadow: 0 2px 10px rgba(0,0,0,.25); }
      .input-wrapper:focus-within { border-color: #009AC7; box-shadow: 0 0 0 1px #009AC7; }
      .input-wrapper input { flex: 1; min-width: 0; padding: 10px 2px; background: transparent; border: none; color: #e0e0e0; font-size: .97rem; outline: none; }
      .input-wrapper input::placeholder { color: #666; }
      .send-btn { display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; padding: 0; cursor: pointer; background: #009AC7; color: #fff; border: none; border-radius: 50%; flex-shrink: 0; transition: background .2s, transform .1s; }
      .send-btn:hover:not(:disabled) { background: #007da3; }
      .send-btn:active:not(:disabled) { transform: scale(.95); }
      .send-btn:disabled { opacity: .45; cursor: not-allowed; }
      .send-btn svg { width: 19px; height: 19px; }
      .error { color: #ff8a80; margin-top: 8px; font-size: .88em; }
    </style>
    <div class="container">
      <div class="chat-inner">
        <div class="thread" id="thread"><div class="msg-col" id="msg-col"></div></div>
        <div class="input-area">
          <div class="prompt-suggestions" id="prompt-suggestions"></div>
          <div class="input-wrapper">
            <input type="text" id="input" placeholder="Nachricht eingeben …" autocomplete="off" />
            <button type="button" class="send-btn" id="send" title="Senden" aria-label="Senden">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7"/>
              </svg>
            </button>
          </div>
          <div id="error" class="error" style="display:none;"></div>
        </div>
      </div>
    </div>
  `;

  /* ── Hilfsfunktionen ──────────────────────────────────────────────── */
  function escapeHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function escapeAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
      .replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ── Inline-Markdown: fett, kursiv, code, links, entity-buttons ───── */
  function processInline(text) {
    var out = '';
    // [entity:<entity_id>:<label>]
    var re = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]*)\]\(([^)]+)\)|\[entity:([^\]:]+):([^\]]*)\])/g;
    var last = 0, m;
    while ((m = re.exec(text)) !== null) {
      out += escapeHtml(text.slice(last, m.index));
      if      (m[2] !== undefined) out += '<strong>' + escapeHtml(m[2]) + '</strong>';
      else if (m[3] !== undefined) out += '<em>' + escapeHtml(m[3]) + '</em>';
      else if (m[4] !== undefined) out += '<code>' + escapeHtml(m[4]) + '</code>';
      else if (m[5] !== undefined) out += '<a href="' + escapeAttr(m[6]) + '" target="_blank" rel="noopener" class="badge content-link">' + escapeHtml(m[5]) + '</a>';
      else {
        /* entity-button: m[7]=entity_id, m[8]=label */
        var eid   = m[7];
        var label = (m[8] || eid).trim() || eid;
        out += '<button type="button" class="badge entity-unknown"'
             + ' data-entity-id="' + escapeAttr(eid) + '">'
             + escapeHtml(label) + '</button>';
      }
      last = re.lastIndex;
    }
    out += escapeHtml(text.slice(last));
    return out;
  }

  /* ── Block-Markdown ──────────────────────────────────────────────── */
  function renderMarkdown(text) {
    if (!text) return '';
    var lines = text.split('\n');
    var out = '';
    var listBuf = [];

    function flushList() {
      if (!listBuf.length) return;
      out += '<ul>';
      listBuf.forEach(function (li) { out += '<li>' + processInline(li) + '</li>'; });
      out += '</ul>';
      listBuf = [];
    }

    var i = 0;
    while (i < lines.length) {
      var line = lines[i];
      /* Headings */
      var hm = line.match(/^(#{1,4})\s+(.*)/);
      if (hm) {
        flushList();
        var tag = 'h' + (hm[1].length + 2);
        out += '<' + tag + '>' + processInline(hm[2]) + '</' + tag + '>';
        i++; continue;
      }
      /* HR */
      if (/^---+$/.test(line.trim())) {
        flushList();
        out += '<hr>';
        i++; continue;
      }
      /* List item */
      var lm = line.match(/^[\-\*]\s+(.*)/);
      if (lm) {
        listBuf.push(lm[1]);
        i++; continue;
      }
      flushList();
      /* Empty line */
      if (line.trim() === '') {
        if (out.length && !out.endsWith('<br>')) out += '<br>';
        i++; continue;
      }
      out += processInline(line) + '\n';
      i++;
    }
    flushList();
    return out;
  }

  /* ── apiBase ─────────────────────────────────────────────────────── */
  function apiBase() {
    var origin = window.location.origin;
    var p = (window.location.pathname || '/').replace(/\/$/, '');
    return p ? origin + p : origin;
  }

  function parseJsonResponse(r) {
    return r.text().then(function (text) {
      var raw = (text || '').replace(/^\uFEFF/, '').trim();
      var data;
      try {
        if (!raw) throw new Error('Leere Antwort');
        if (raw[0] !== '{' && raw[0] !== '[') throw new Error(raw.length < 120 ? raw : raw.slice(0, 100) + '…');
        data = JSON.parse(raw);
      } catch (e) {
        var msg = r.status ? 'HTTP ' + r.status : 'Kein gültiges JSON';
        if (e.message && e.message !== 'Leere Antwort') msg += ' – ' + e.message;
        throw new Error(msg);
      }
      if (!r.ok) throw new Error((data && (data.error || data.message)) || 'HTTP ' + r.status);
      return data;
    });
  }

  /* ── Custom Element ──────────────────────────────────────────────── */
  class HaChatPanel extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.appendChild(template.content.cloneNode(true));
      this._thread = [];
      this._hass = null;
    }

    set hass(value) {
      this._hass = value;
      /* Entity-States beim ersten Setzen und bei Updates sofort auffrischen */
      this._refreshEntityStates();
    }

    connectedCallback() {

      var self = this;
      var input   = this.shadowRoot.getElementById('input');
      var sendBtn = this.shadowRoot.getElementById('send');
      var threadEl = this.shadowRoot.getElementById('thread');

      /* Prompt-Vorschläge: zuerst Fallback rendern, dann aus /config.json laden */
      this._renderSuggestions(PROMPT_SUGGESTIONS, input);
      fetch(apiBase() + '/config.json')
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (cfg) {
          var list = cfg && Array.isArray(cfg.prompt_suggestions) && cfg.prompt_suggestions.length
            ? cfg.prompt_suggestions : null;
          if (list) self._renderSuggestions(list, input);
        })
        .catch(function () {});

      /* Senden */
      sendBtn.addEventListener('click',  function () { self._send(); });
      input.addEventListener('keydown',  function (e) { if (e.key === 'Enter') self._send(); });

      /* Event-Delegation auf Thread – verhindert doppelte Listener */
      threadEl.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-entity-id]');
        if (btn) { self._openMoreInfo(btn.dataset.entityId); return; }
        var ub = e.target.closest('button[data-utterance]');
        if (ub) { self._runAction(ub.dataset.utterance); }
      });
    }

    _renderSuggestions(list, inputEl) {
      var root = this.shadowRoot;
      var wrap = root.getElementById('prompt-suggestions');
      if (!wrap) return;
      var inp = inputEl || root.getElementById('input');
      var maxVisible = 5;
      var expanded = !!this._suggestionsExpanded;
      var showCount = expanded ? list.length : Math.min(list.length, maxVisible);
      var moreCount = list.length - showCount;
      wrap.innerHTML = '';
      for (var i = 0; i < showCount; i++) {
        var text = list[i];
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'prompt-suggestion';
        btn.textContent = text;
        btn.addEventListener('click', function (t) {
          return function () { inp.value = t; inp.focus(); };
        }(text));
        wrap.appendChild(btn);
      }
      if (moreCount > 0) {
        var badge = document.createElement('span');
        badge.className = 'prompt-suggestion-more';
        badge.textContent = '+' + moreCount;
        badge.title = moreCount + ' weitere Vorschl\u00e4ge';
        badge.addEventListener('click', function (self) {
          return function () {
            self._suggestionsExpanded = true;
            self._renderSuggestions(self._suggestionsList || [], inp);
          };
        }(this));
        wrap.appendChild(badge);
      }
      this._suggestionsList = list;
    }

    /* ── Thread-Verwaltung ─────────────────────────────────────────── */
    _addMessage(role, content, extra) {
      extra = extra || {};
      this._thread.push({
        role: role, content: content,
        sources: extra.sources || [],
        actions: extra.actions || [],
        entity_actions: extra.entity_actions || [],
        pending: !!extra.pending
      });
      this._render();
    }

    _setLastAssistantMessage(content, sources, actions, entity_actions) {
      for (var i = this._thread.length - 1; i >= 0; i--) {
        if (this._thread[i].role === 'assistant') {
          this._thread[i].sources = sources || [];
          this._thread[i].actions = actions || [];
          this._thread[i].entity_actions = entity_actions || [];
          this._thread[i].pending = false;
          this._thread[i].streaming = !!content;
          this._thread[i].content = '';
          this._render();
          if (content) this._streamInto(i, content);
          return;
        }
      }
    }

    /* ── Streaming: Antwort zeichenweise sichtbar machen ───────────── */
    _streamInto(msgIdx, fullText) {
      var self = this;
      var CHUNK = 6;  // Zeichen pro Tick
      var DELAY = 14; // ms

      var idx = 0;

      var threadEl = self.shadowRoot.getElementById('thread');

      function tick() {
        idx = Math.min(idx + CHUNK, fullText.length);
        var partial = fullText.slice(0, idx);
        var done = idx >= fullText.length;

        /* Nur das Content-Element des Ziel-Bubbles aktualisieren */
        var msgCol = self.shadowRoot.getElementById('msg-col');
        if (msgCol) {
          var bubbles = msgCol.querySelectorAll('.msg.assistant');
          var bubble = bubbles[msgIdx] || bubbles[bubbles.length - 1];
          if (bubble) {
            var cEl = bubble.querySelector('.content');
            if (cEl) {
              cEl.innerHTML = renderMarkdown(partial) + (done ? '' : '<span class="stream-cursor"></span>');
            }
          }
        }
        /* Beim Streamen immer nach unten scrollen */
        if (threadEl) threadEl.scrollTop = threadEl.scrollHeight;

        if (!done) {
          setTimeout(tick, DELAY);
        } else {
          /* Fertig: Markdown-Render + Entity-States */
          self._thread[msgIdx].streaming = false;
          self._thread[msgIdx].content = fullText;
          self._render();
        }
      }

      setTimeout(tick, 30);
    }

    /* ── Render ────────────────────────────────────────────────────── */
    _render() {
      var threadEl = this.shadowRoot.getElementById('thread');
      var msgCol   = this.shadowRoot.getElementById('msg-col');
      var suggestEl = this.shadowRoot.getElementById('prompt-suggestions');
      var scrollBottom = threadEl.scrollHeight - threadEl.scrollTop - threadEl.clientHeight < 80;
      msgCol.innerHTML = '';

      /* Suggestions nur bei leerer Unterhaltung */
      if (suggestEl) suggestEl.style.display = this._thread.length === 0 ? '' : 'none';

      this._thread.forEach(function (m) {
        var div = document.createElement('div');
        div.className = 'msg ' + m.role;
        if (m.pending) {
          div.innerHTML = '<div class="content"><span class="typing-indicator"><span></span><span></span><span></span></span></div>';
        } else {
          var bodyHtml = m.streaming
            ? escapeHtml(m.content) + '<span class="stream-cursor"></span>'
            : (m.role === 'assistant' ? renderMarkdown(m.content) : escapeHtml(m.content));
          var html = '<div class="content">' + bodyHtml + '</div>';
          if (m.sources && m.sources.length) {
            html += '<div class="sources"><span class="sources-label">Quellen:</span>' +
              m.sources.map(function (s) {
                return s.url
                  ? '<a target="_blank" rel="noopener" href="' + escapeAttr(s.url) + '" class="badge content-link">' + escapeHtml(s.title || 'Link') + '</a>'
                  : '<span class="badge entity-unknown">' + escapeHtml(s.title || '') + '</span>';
              }).join('') + '</div>';
          }
          var hasActions = (m.entity_actions && m.entity_actions.length) || (m.actions && m.actions.length);
          if (hasActions) {
            html += '<div class="actions">';
            (m.entity_actions || []).forEach(function (a) {
              if (!a.entity_id) return;
              var lbl = escapeHtml(a.label || a.entity_id);
              html += '<button type="button" class="badge entity-unknown" data-entity-id="' + escapeAttr(a.entity_id) + '">' + lbl + '</button>';
            });
            (m.actions || []).forEach(function (a, idx) {
              html += '<button type="button" data-utterance="' + escapeAttr(a.utterance || '') + '">' + escapeHtml(a.label || a.utterance || ('Aktion ' + (idx + 1))) + '</button>';
            });
            html += '</div>';
          }
          div.innerHTML = html;
        }
        msgCol.appendChild(div);
      });

      if (scrollBottom) threadEl.scrollTop = threadEl.scrollHeight;
      this._refreshEntityStates();
    }

    /* ── Entity-States direkt aus hass.states lesen & Buttons einfärben ── */
    _refreshEntityStates() {
      var root  = this.shadowRoot;
      var hass  = this._hass;
      var ids   = [];
      root.querySelectorAll('[data-entity-id]').forEach(function (b) {
        var id = b.dataset.entityId;
        if (id && ids.indexOf(id) < 0) ids.push(id);
      });
      ids.forEach(function (entityId) {
        var stateObj = hass && hass.states && hass.states[entityId];
        if (stateObj) {
          applyStateClass(entityId, stateObj.state);
        } else {
          /* Fallback: addon-Proxy */
          fetch(apiBase() + '/api/ha_entity_state?entity_id=' + encodeURIComponent(entityId))
            .then(function (r) { return r.json().catch(function () { return {}; }); })
            .then(function (data) { if (data.state) applyStateClass(entityId, data.state); });
        }
      });

      function applyStateClass(entityId, stateRaw) {
        var state = (stateRaw || '').toLowerCase();
        var OFF_STATES = ['off', 'closed', 'locked', 'idle', 'not_home', 'paused',
                          'unavailable', 'unknown', 'disabled', 'standby'];
        var cls = (state === '' || OFF_STATES.indexOf(state) >= 0) ? 'entity-off' : 'entity-on';
        /* Selector case-insensitiv über toLowerCase absichern */
        root.querySelectorAll('[data-entity-id]').forEach(function (btn) {
          if (btn.dataset.entityId.toLowerCase() === entityId.toLowerCase()) {
            btn.classList.remove('entity-on', 'entity-off', 'entity-unknown');
            btn.classList.add(cls);
          }
        });
      }
    }

    /* ── HA More-Info Dialog öffnen (Canonical Way) ───────────────── */
    _openMoreInfo(entityId) {
      var ev = new Event('hass-more-info', { bubbles: true, composed: true });
      ev.detail = { entityId: entityId, view: 'info' };
      this.dispatchEvent(ev);
    }


    /* ── Fehler ────────────────────────────────────────────────────── */
    _showError(msg) {
      var el = this.shadowRoot.getElementById('error');
      el.textContent = msg;
      el.style.display = 'block';
    }

    /* ── Chat senden ───────────────────────────────────────────────── */
    _send() {
      var input   = this.shadowRoot.getElementById('input');
      var sendBtn = this.shadowRoot.getElementById('send');
      var text    = (input.value || '').trim();
      if (!text) return;
      input.value = '';
      var self = this;
      this._addMessage('user', text);
      this._addMessage('assistant', '', { pending: true });
      sendBtn.disabled = true;
      var err = this.shadowRoot.getElementById('error');
      err.style.display = 'none';

      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, 120000);
      fetch(apiBase() + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
        signal: controller.signal
      })
        .then(function (r) { clearTimeout(timer); return parseJsonResponse(r); })
        .then(function (d) {
          if (d.error) {
            self._showError(d.error);
            self._setLastAssistantMessage('Fehler: ' + d.error);
          } else {
            self._setLastAssistantMessage(d.answer || '', d.sources || [], d.actions || [], d.entity_actions || []);
          }
        })
        .catch(function (e) {
          clearTimeout(timer);
          self._showError('Fehler: ' + (e.message || e));
          self._setLastAssistantMessage(
            e.name === 'AbortError'
              ? 'Zeitüberschreitung – bitte erneut versuchen.'
              : 'Verbindung fehlgeschlagen. N8N-Webhook in den Add-on-Optionen prüfen.'
          );
        })
        .finally(function () { sendBtn.disabled = false; });
    }

    /* ── Utterance-Aktion ──────────────────────────────────────────── */
    _runAction(utterance) {
      if (!utterance) return;
      this._addMessage('user', utterance);
      this._addMessage('assistant', '', { pending: true });
      var sendBtn = this.shadowRoot.getElementById('send');
      sendBtn.disabled = true;
      var self = this;
      fetch(apiBase() + '/api/execute_action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utterance: utterance })
      })
        .then(function (r) { return parseJsonResponse(r); })
        .then(function (d) {
          if (d.error) {
            self._showError(d.error);
            self._setLastAssistantMessage('Fehler: ' + d.error);
          } else {
            var ans = d.answer != null ? d.answer : (d.response != null ? d.response : '');
            self._setLastAssistantMessage(ans, d.sources || [], d.actions || [], d.entity_actions || []);
          }
        })
        .catch(function (e) {
          self._showError('Fehler: ' + (e.message || e));
          self._setLastAssistantMessage('Aktion fehlgeschlagen. N8N-Webhook prüfen.');
        })
        .finally(function () { sendBtn.disabled = false; });
    }
  }

  customElements.define('ha-chat-panel', HaChatPanel);
})();
