/**
 * HA Chat – nur Frontend, Inference über N8N-Webhook (Proxy unter /api/chat, /api/execute_action).
 * Embedding/Sync etc. liegen in N8N.
 */
(function () {
  const template = document.createElement('template');
  template.innerHTML = `
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css" />
    <style>
      :host { display: block; height: 100%; box-sizing: border-box; }
      .container { height: 100%; display: flex; flex-direction: column; align-items: center; padding: 16px; box-sizing: border-box; background: #1c1c1c; color: #e0e0e0; }
      .chat-inner { width: 100%; max-width: 620px; flex: 1; display: flex; flex-direction: column; min-height: 0; }
      .thread { flex: 1; overflow-y: auto; margin-bottom: 16px; min-height: 0; }
      .input-row { width: 100%; max-width: 620px; margin: 0 auto; }
      .thread { width: 100%; max-width: 620px; margin-left: auto; margin-right: auto; }
      .msg { margin: 10px 0; padding: 12px 16px; border-radius: 18px; max-width: 85%; line-height: 1.5; }
      .msg.user { background: #009AC7; color: #fff; margin-left: auto; border-bottom-right-radius: 4px; }
      .msg.assistant { background: #2d2d2d; border: 1px solid #3a3a3a; border-bottom-left-radius: 4px; }
      .msg .content { white-space: pre-wrap; word-break: break-word; }
      .msg .content a.content-link { display: inline-block; color: #fff; background: #009AC7; padding: 2px 10px; border-radius: 12px; text-decoration: none; font-size: 0.85em; margin: 0 2px 2px 0; vertical-align: baseline; }
      .msg .content a.content-link:hover { background: #007da3; color: #fff; }
      .sources { margin-top: 10px; font-size: 0.85em; opacity: 0.9; }
      .sources a { color: #009AC7; margin-right: 12px; text-decoration: none; }
      .sources a:hover { text-decoration: underline; }
      .actions { margin-top: 10px; }
      .actions button { margin-right: 8px; margin-top: 6px; padding: 8px 14px; cursor: pointer; background: transparent; color: #009AC7; border: 1px solid #009AC7; border-radius: 20px; font-size: 0.9em; }
      .actions button:hover { background: rgba(0, 154, 199, 0.15); }
      .msg .content button.entity-btn { display: inline-flex; align-items: center; margin: 0 2px 2px 0; padding: 2px 10px; border-radius: 12px; font-size: 0.85em; border: none; cursor: pointer; background: #555; color: #fff; vertical-align: baseline; font-family: inherit; }
      .msg .content button.entity-btn:hover { filter: brightness(1.1); }
      .msg .content button.entity-btn.entity-btn-on { background: #009AC7; }
      .msg .content button.entity-btn.entity-btn-on:hover { background: #007da3; }
      .msg .content button.entity-btn.entity-btn-off { background: #555; color: #ccc; }
      .msg .content button.entity-btn .mdi { margin-right: 5px; font-size: 1.1em; opacity: 0.95; }
      .actions button.entity-btn { display: inline-flex; align-items: center; }
      .actions button.entity-btn .mdi { margin-right: 5px; font-size: 1em; }
      .actions button.entity-btn.entity-btn-on { background: #009AC7; color: #fff; border-color: #009AC7; }
      .actions button.entity-btn.entity-btn-off { background: transparent; color: #888; border-color: #555; }
      .msg .content button.entity-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      .prompt-suggestions { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 10px 0; }
      .prompt-suggestion { padding: 6px 12px; border: 1px solid #3f3f3f; border-radius: 999px; background: #242424; color: #cfcfcf; font-size: 0.85rem; cursor: pointer; transition: background 0.2s, border-color 0.2s; }
      .prompt-suggestion:hover { background: #2f2f2f; border-color: #009AC7; color: #fff; }
      .input-wrapper { display: flex; align-items: center; gap: 12px; padding: 8px 8px 8px 20px; background: #2d2d2d; border: 1px solid #3a3a3a; border-radius: 24px; box-shadow: 0 2px 12px rgba(0,0,0,0.2); }
      .input-wrapper:focus-within { border-color: #009AC7; box-shadow: 0 0 0 1px #009AC7; }
      .input-row input { flex: 1; min-width: 0; padding: 12px 4px 12px 0; background: transparent; border: none; color: #e0e0e0; font-size: 1rem; outline: none; }
      .input-row input::placeholder { color: #888; }
      .send-btn { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; padding: 0; cursor: pointer; background: #009AC7; color: #fff; border: none; border-radius: 50%; flex-shrink: 0; transition: background 0.2s, transform 0.1s; }
      .send-btn:hover:not(:disabled) { background: #007da3; }
      .send-btn:active:not(:disabled) { transform: scale(0.96); }
      .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .send-btn svg { width: 20px; height: 20px; }
      .error { color: #ff8a80; margin: 10px 0 0 0; font-size: 0.9em; }
      .typing-indicator { display: inline-flex; gap: 4px; padding: 2px 0; }
      .typing-indicator span { width: 6px; height: 6px; border-radius: 50%; background: #009AC7; animation: typing 0.6s ease-in-out infinite both; }
      .typing-indicator span:nth-child(2) { animation-delay: 0.1s; }
      .typing-indicator span:nth-child(3) { animation-delay: 0.2s; }
      @keyframes typing { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; } 40% { transform: scale(1); opacity: 1; } }
    </style>
      <div class="container">
      <div class="thread" id="thread"></div>
      <div class="input-row">
        <div class="prompt-suggestions" id="prompt-suggestions"></div>
        <div class="input-wrapper">
          <input type="text" id="input" placeholder="Nachricht eingeben..." autocomplete="off" />
          <button type="button" class="send-btn" id="send" title="Senden" aria-label="Senden">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
          </button>
        </div>
      </div>
      <div id="error" class="error" style="display:none;"></div>
    </div>
  `;

  function apiBase() {
    var origin = window.location.origin;
    var path = (window.location.pathname || '/').replace(/\/$/, '');
    return path ? (origin + path) : origin;
  }

  function parseJsonResponse(r) {
    return r.text().then(function (text) {
      if (!text || typeof text !== 'string') {
        throw new Error(r.status ? 'HTTP ' + r.status : 'Leere Antwort');
      }
      var raw = text.replace(/^\uFEFF/, '').trim();
      var data = null;
      try {
        if (raw.length === 0) {
          throw new Error('Leere Antwort');
        }
        if (raw[0] !== '{' && raw[0] !== '[') {
          throw new Error(raw.length < 100 ? raw : raw.slice(0, 80) + '…');
        }
        data = JSON.parse(raw);
      } catch (e) {
        var msg = r.status ? 'HTTP ' + r.status : 'Antwort ist kein gültiges JSON';
        if (e instanceof SyntaxError && raw.length < 200) {
          msg += ': ' + raw;
        } else if (raw.indexOf('<') === 0 || raw.indexOf('<!') === 0) {
          msg += ' – Fehlerseite (Add-on/Ingress prüfen)';
        } else if (e.message && e.message !== 'Leere Antwort') {
          msg += ' – ' + e.message;
        }
        throw new Error(msg);
      }
      if (!r.ok) {
        var err = (data && data.error) || (data && data.message) || (r.status ? 'HTTP ' + r.status : 'Fehler');
        throw new Error(err);
      }
      return data;
    });
  }

  class HaChatPanel extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.appendChild(template.content.cloneNode(true));
      this._thread = [];
      this._promptSuggestions = [
        'Licht im Wohnzimmer einschalten',
        'Wie ist der Status der Heizung?',
        'Welche Geräte sind aktuell aktiv?',
        'Starte die Abendroutine'
      ];
    }

    connectedCallback() {
      var sendBtn = this.shadowRoot.getElementById('send');
      var input = this.shadowRoot.getElementById('input');
      var suggestionWrap = this.shadowRoot.getElementById('prompt-suggestions');
      this._renderPromptSuggestions();
      sendBtn.addEventListener('click', function () { this._send(); }.bind(this));
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') this._send(); }.bind(this));
      suggestionWrap.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-prompt]');
        if (!btn) return;
        input.value = btn.getAttribute('data-prompt') || '';
        input.focus();
      });
    }

    _renderPromptSuggestions() {
      var suggestionWrap = this.shadowRoot.getElementById('prompt-suggestions');
      if (!suggestionWrap) return;
      suggestionWrap.innerHTML = '';
      this._promptSuggestions.forEach(function (text) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'prompt-suggestion';
        btn.setAttribute('data-prompt', text);
        btn.textContent = text;
        suggestionWrap.appendChild(btn);
      });
    }

    _addMessage(role, content, extra) {
      extra = extra || {};
      this._thread.push({
        role: role,
        content: content,
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
          this._thread[i].content = content;
          this._thread[i].sources = sources || [];
          this._thread[i].actions = actions || [];
          this._thread[i].entity_actions = entity_actions || [];
          this._thread[i].pending = false;
          this._render();
          return;
        }
      }
    }

    _render() {
      var threadEl = this.shadowRoot.getElementById('thread');
      var errEl = this.shadowRoot.getElementById('error');
      threadEl.innerHTML = '';
      var self = this;
      this._thread.forEach(function (m) {
        var div = document.createElement('div');
        div.className = 'msg ' + m.role;
        var html = '';
        if (m.pending) {
          html = '<div class="content typing"><span class="typing-indicator"><span></span><span></span><span></span></span></div>';
        } else {
          html = '<div class="content">' + formatMessageContent(m.content) + '</div>';
          if (m.sources && m.sources.length) {
            html += '<div class="sources">Quellen: ';
            m.sources.forEach(function (s) {
              html += s.url ? '<a target="_blank" rel="noopener" href="' + escapeHtml(s.url) + '">' + escapeHtml(s.title || 'Link') + '</a>' : escapeHtml(s.title);
            });
            html += '</div>';
          }
          if ((m.entity_actions && m.entity_actions.length) || (m.actions && m.actions.length)) {
            html += '<div class="actions">';
            (m.entity_actions || []).forEach(function (a) {
              var lid = a.entity_id || ''; var act = (a.action || 'toggle').toLowerCase();
              if (!lid) return;
              html += '<button type="button" class="entity-btn" data-entity-id="' + escapeAttr(lid) + '" data-action="' + escapeAttr(act) + '">' + escapeHtml(a.label || lid) + '</button>';
            });
            (m.actions || []).forEach(function (a, i) {
              var label = a.label || a.utterance || ('Aktion ' + (i + 1));
              html += '<button type="button" data-utterance="' + escapeHtml((a.utterance || '')) + '">' + escapeHtml(label) + '</button>';
            });
            html += '</div>';
          }
        }
        div.innerHTML = html;
        if (!m.pending) {
          div.querySelectorAll('.actions button.entity-btn').forEach(function (btn) {
            btn.addEventListener('click', function () { self._callHaEntity(btn.dataset.entityId, 'toggle', btn); });
          });
          div.querySelectorAll('.actions button[data-utterance]').forEach(function (btn) {
            btn.addEventListener('click', function () { self._runAction(btn.dataset.utterance); });
          });
          div.querySelectorAll('.content button.entity-btn').forEach(function (btn) {
            btn.addEventListener('click', function () { self._callHaEntity(btn.dataset.entityId, 'toggle', btn); });
          });
        }
        threadEl.appendChild(div);
      });
      errEl.style.display = 'none';
      threadEl.scrollTop = threadEl.scrollHeight;
      self._refreshEntityStates();
    }

    _refreshEntityStates() {
      var root = this.shadowRoot;
      var buttons = root.querySelectorAll('.entity-btn[data-entity-id]');
      var ids = [];
      for (var i = 0; i < buttons.length; i++) {
        var id = buttons[i].dataset.entityId;
        if (id && ids.indexOf(id) === -1) ids.push(id);
      }
      var self = this;
      ids.forEach(function (entityId) {
        fetch(apiBase() + '/api/ha_entity_state?entity_id=' + encodeURIComponent(entityId))
          .then(function (r) { return r.json().catch(function () { return {}; }); })
          .then(function (data) {
            var state = (data.state || '').toLowerCase();
            var isOn = state === 'on' || state === 'open' || state === 'unlocked' || state === 'playing' || state === 'home';
            var icon = (data.icon || 'mdi:circle-outline').replace('mdi:', 'mdi-');
            var mdiClass = 'mdi ' + icon;
            var btns = root.querySelectorAll('.entity-btn[data-entity-id="' + escapeAttr(entityId) + '"]');
            for (var j = 0; j < btns.length; j++) {
              var btn = btns[j];
              btn.classList.remove('entity-btn-on', 'entity-btn-off');
              btn.classList.add(isOn ? 'entity-btn-on' : 'entity-btn-off');
              var existingIcon = btn.querySelector('.mdi');
              if (existingIcon) existingIcon.remove();
              var span = document.createElement('span');
              span.className = mdiClass;
              span.setAttribute('aria-hidden', 'true');
              btn.insertBefore(span, btn.firstChild);
            }
          });
      });
    }

    _showError(msg) {
      var errEl = this.shadowRoot.getElementById('error');
      errEl.textContent = msg;
      errEl.style.display = 'block';
    }

    _send() {
      var input = this.shadowRoot.getElementById('input');
      var sendBtn = this.shadowRoot.getElementById('send');
      var text = (input.value || '').trim();
      if (!text) return;
      input.value = '';
      this._addMessage('user', text);
      this._addMessage('assistant', '', { pending: true });
      sendBtn.disabled = true;
      this._showError('');

      var self = this;
      var timeoutMs = 120000;
      var controller = new AbortController();
      var timeoutId = setTimeout(function () { controller.abort(); }, timeoutMs);
      fetch(apiBase() + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
        signal: controller.signal
      })
        .then(function (r) { clearTimeout(timeoutId); return parseJsonResponse(r); })
        .then(function (data) {
          if (data.error) {
            self._showError(data.error);
            self._setLastAssistantMessage('Fehler: ' + data.error);
          } else {
            self._setLastAssistantMessage(data.answer || '', data.sources || [], data.actions || [], data.entity_actions || []);
          }
        })
        .catch(function (e) {
          clearTimeout(timeoutId);
          self._showError('Fehler: ' + (e.message || String(e)));
          var msg = e.name === 'AbortError'
            ? 'Zeitüberschreitung. Bitte erneut versuchen.'
            : 'Verbindung fehlgeschlagen. N8N-Webhook-URL in den Add-on-Optionen prüfen.';
          self._setLastAssistantMessage(msg);
        })
        .finally(function () {
          sendBtn.disabled = false;
        });
    }

    _callHaEntity(entityId, action, clickedBtn) {
      if (clickedBtn) clickedBtn.disabled = true;
      var self = this;
      fetch(apiBase() + '/api/ha_call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_id: entityId, action: 'toggle' })
      })
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (data) {
          if (data.error) self._showError(data.error);
          if (clickedBtn) clickedBtn.disabled = false;
          self._refreshEntityStates();
        })
        .catch(function (e) {
          self._showError('HA-Aufruf fehlgeschlagen: ' + (e.message || String(e)));
          if (clickedBtn) clickedBtn.disabled = false;
        });
    }

    _runAction(utterance) {
      if (!utterance) return;
      this._addMessage('user', '[Aktion] ' + utterance);
      this._addMessage('assistant', '', { pending: true });
      var sendBtn = this.shadowRoot.getElementById('send');
      sendBtn.disabled = true;
      this._showError('');

      var self = this;
      fetch(apiBase() + '/api/execute_action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utterance: utterance })
      })
        .then(function (r) { return parseJsonResponse(r); })
        .then(function (data) {
          if (data.error) {
            self._showError(data.error);
            self._setLastAssistantMessage('Fehler: ' + data.error);
          } else {
            self._setLastAssistantMessage(data.answer != null ? data.answer : (data.response != null ? data.response : ''), data.sources || [], data.actions || [], data.entity_actions || []);
          }
        })
        .catch(function (e) {
          self._showError('Fehler: ' + (e.message || String(e)));
          self._setLastAssistantMessage('Aktion fehlgeschlagen. N8N-Webhook prüfen.');
        })
        .finally(function () {
          sendBtn.disabled = false;
        });
    }
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  /** Href-Attribut escapen (Anführungszeichen etc.). */
  function escapeAttr(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Nachrichtentext: Entity-Buttons [entity:entity_id:action:label] und Markdown-Links [Text](URL) rendern.
   */
  function formatMessageContent(text) {
    if (text == null || text === '') return '';
    var out = '';
    var reEntity = /\[entity:([^\]:]+):(turn_on|turn_off|toggle):([^\]]*)\]/g;
    var reLink = /\[([^\]]*)\]\(([^)]+)\)/g;
    var pos = 0;
    var s = text;
    while (pos < s.length) {
      reEntity.lastIndex = pos;
      reLink.lastIndex = pos;
      var me = reEntity.exec(s);
      var ml = reLink.exec(s);
      var next, repl;
      if (me && (!ml || me.index <= ml.index)) {
        next = me.index;
        repl = '<button type="button" class="entity-btn content-link" data-entity-id="' + escapeAttr(me[1]) + '" data-action="' + escapeAttr(me[2]) + '">' + escapeHtml(me[3] || me[1]) + '</button>';
        out += escapeHtml(s.slice(pos, next)) + repl;
        pos = reEntity.lastIndex;
      } else if (ml) {
        next = ml.index;
        repl = '<a href="' + escapeAttr(ml[2]) + '" target="_blank" rel="noopener" class="content-link">' + escapeHtml(ml[1]) + '</a>';
        out += escapeHtml(s.slice(pos, next)) + repl;
        pos = reLink.lastIndex;
      } else {
        out += escapeHtml(s.slice(pos));
        break;
      }
    }
    return out;
  }

  customElements.define('ha-chat-panel', HaChatPanel);
})();
