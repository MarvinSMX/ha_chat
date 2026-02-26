/**
 * HA OneNote RAG Chat – läuft in der Add-on-App (Ingress oder Port 8765).
 * Nutzt relative API: /api/chat, /api/execute_action.
 */
(function () {
  const template = document.createElement('template');
  template.innerHTML = `
    <style>
      :host { display: block; height: 100%; box-sizing: border-box; }
      .container { height: 100%; display: flex; flex-direction: column; padding: 16px; box-sizing: border-box; background: #1c1c1c; color: #e0e0e0; }
      .thread { flex: 1; overflow-y: auto; margin-bottom: 16px; }
      .msg { margin: 8px 0; padding: 10px 12px; border-radius: 8px; max-width: 85%; }
      .msg.user { background: #0d47a1; color: #fff; margin-left: auto; }
      .msg.assistant { background: #2d2d2d; border: 1px solid #444; }
      .msg .content { white-space: pre-wrap; word-break: break-word; }
      .sources { margin-top: 8px; font-size: 0.9em; }
      .sources a { color: #82b1ff; margin-right: 12px; }
      .actions { margin-top: 8px; }
      .actions button { margin-right: 8px; margin-top: 4px; padding: 6px 12px; cursor: pointer; background: #333; color: #fff; border: 1px solid #555; border-radius: 4px; }
      .input-row { display: flex; gap: 8px; align-items: flex-end; }
      .input-row input { flex: 1; padding: 10px 12px; background: #2d2d2d; border: 1px solid #444; color: #e0e0e0; border-radius: 4px; }
      .input-row button { padding: 10px 20px; cursor: pointer; background: #0d47a1; color: #fff; border: none; border-radius: 4px; }
      .error { color: #ff8a80; margin: 8px 0; }
      .input-row button:disabled { opacity: 0.6; cursor: not-allowed; }
      .typing-indicator { display: inline-flex; gap: 4px; padding: 2px 0; }
      .typing-indicator span { width: 6px; height: 6px; border-radius: 50%; background: #82b1ff; animation: typing 0.6s ease-in-out infinite both; }
      .typing-indicator span:nth-child(2) { animation-delay: 0.1s; }
      .typing-indicator span:nth-child(3) { animation-delay: 0.2s; }
      @keyframes typing { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; } 40% { transform: scale(1); opacity: 1; } }
      .onenote-card { background: #2d2d2d; border: 1px solid #444; border-radius: 8px; padding: 12px; margin-bottom: 12px; flex-shrink: 0; }
      .onenote-card h3 { margin: 0 0 8px 0; font-size: 1em; }
      .onenote-card button { padding: 6px 12px; margin-right: 8px; margin-bottom: 4px; cursor: pointer; background: #0d47a1; color: #fff; border: none; border-radius: 4px; }
      .onenote-card button.secondary { background: #555; }
      .onenote-list { list-style: none; padding: 0; margin: 8px 0 0 0; max-height: 200px; overflow-y: auto; }
      .onenote-list li { padding: 6px 8px; margin: 4px 0; background: #1c1c1c; border-radius: 4px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
      .onenote-list li label { flex: 1; cursor: pointer; }
      .onenote-current { font-size: 0.9em; color: #82b1ff; margin-top: 8px; }
      .onenote-msg { font-size: 0.85em; margin-top: 6px; color: #aaa; }
    </style>
    <div class="container">
      <div class="onenote-card">
        <h3>OneNote – Notizbuch für Sync</h3>
        <p class="onenote-msg" style="margin:0 0 8px 0; font-size:0.9em; color:#aaa;">Wähle das Notizbuch, das beim Sync in die Wissensbasis übernommen werden soll.</p>
        <button id="loadNotebooks">Notizbücher laden</button>
        <div id="onenoteMsg" class="onenote-msg" style="display:none;"></div>
        <div id="onenoteCurrent" class="onenote-current" style="display:none;"></div>
        <ul id="onenoteList" class="onenote-list" style="display:none;"></ul>
      </div>
      <div class="thread" id="thread"></div>
      <div class="input-row">
        <input type="text" id="input" placeholder="Frage stellen..." />
        <button id="send">Senden</button>
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
    }

    connectedCallback() {
      var sendBtn = this.shadowRoot.getElementById('send');
      var input = this.shadowRoot.getElementById('input');
      sendBtn.addEventListener('click', function () { this._send(); }.bind(this));
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') this._send(); }.bind(this));
      var loadBtn = this.shadowRoot.getElementById('loadNotebooks');
      if (loadBtn) loadBtn.addEventListener('click', function () { this._loadNotebooks(); }.bind(this));
    }

    _addMessage(role, content, extra) {
      extra = extra || {};
      this._thread.push({ role: role, content: content, sources: extra.sources, actions: extra.actions, pending: !!extra.pending });
      this._render();
    }

    _setLastAssistantMessage(content, sources, actions) {
      for (var i = this._thread.length - 1; i >= 0; i--) {
        if (this._thread[i].role === 'assistant') {
          this._thread[i].content = content;
          this._thread[i].sources = sources || [];
          this._thread[i].actions = actions || [];
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
          html = '<div class="content">' + escapeHtml(m.content) + '</div>';
          if (m.sources && m.sources.length) {
            html += '<div class="sources">Quellen: ';
            m.sources.forEach(function (s) {
              html += s.url ? '<a target="_blank" rel="noopener" href="' + escapeHtml(s.url) + '">' + escapeHtml(s.title || 'Link') + '</a>' : escapeHtml(s.title);
            });
            html += '</div>';
          }
          if (m.actions && m.actions.length) {
            html += '<div class="actions">';
            m.actions.forEach(function (a, i) {
              var label = a.label || a.utterance || ('Aktion ' + (i + 1));
              html += '<button type="button" data-utterance="' + escapeHtml((a.utterance || '')) + '">' + escapeHtml(label) + '</button>';
            });
            html += '</div>';
          }
        }
        div.innerHTML = html;
        if (!m.pending && m.actions && m.actions.length) {
          div.querySelectorAll('.actions button').forEach(function (btn) {
            btn.addEventListener('click', function () { self._runAction(btn.dataset.utterance); });
          });
        }
        threadEl.appendChild(div);
      });
      errEl.style.display = 'none';
      threadEl.scrollTop = threadEl.scrollHeight;
    }

    _showError(msg) {
      var errEl = this.shadowRoot.getElementById('error');
      errEl.textContent = msg;
      errEl.style.display = 'block';
    }

    _loadNotebooks() {
      var self = this;
      var msgEl = this.shadowRoot.getElementById('onenoteMsg');
      var listEl = this.shadowRoot.getElementById('onenoteList');
      var currentEl = this.shadowRoot.getElementById('onenoteCurrent');
      msgEl.style.display = 'block';
      msgEl.textContent = 'Lade …';
      listEl.style.display = 'none';
      listEl.innerHTML = '';
      fetch(apiBase() + '/api/onenote_status')
        .then(function (r) { return parseJsonResponse(r); })
        .then(function (data) {
          msgEl.textContent = data.success ? (data.message || '') : (data.message || 'Fehler');
          if (data.notebooks && data.notebooks.length) {
            listEl.style.display = 'block';
            data.notebooks.forEach(function (nb) {
              var li = document.createElement('li');
              var id = nb.id || '';
              var name = nb.displayName || nb.name || id || 'Unbenannt';
              li.innerHTML = '<label>' + escapeHtml(name) + '</label><button type="button" class="secondary" data-id="' + escapeHtml(id) + '" data-name="' + escapeHtml(name) + '">Dieses Notizbuch für Sync verwenden</button>';
              li.querySelector('button').addEventListener('click', function () {
                self._setNotebook(this.dataset.id, this.dataset.name);
              });
              listEl.appendChild(li);
            });
          }
          if (data.configured_notebook_name) {
            currentEl.style.display = 'block';
            currentEl.textContent = 'Aktuell für Sync: ' + data.configured_notebook_name;
          } else if (data.success && data.notebooks && data.notebooks.length === 0) {
            currentEl.style.display = 'block';
            currentEl.textContent = 'Keine Notizbücher gefunden.';
          } else {
            currentEl.style.display = 'none';
          }
        })
        .catch(function (e) {
          msgEl.textContent = 'Fehler: ' + (e.message || String(e));
        });
    }

    _setNotebook(notebookId, notebookName) {
      var self = this;
      var msgEl = this.shadowRoot.getElementById('onenoteMsg');
      var currentEl = this.shadowRoot.getElementById('onenoteCurrent');
      msgEl.style.display = 'block';
      msgEl.textContent = 'Speichere …';
      fetch(apiBase() + '/api/onenote_notebook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notebook_id: notebookId, notebook_name: notebookName })
      })
        .then(function (r) { return parseJsonResponse(r); })
        .then(function (data) {
          if (data.error) {
            msgEl.textContent = 'Fehler: ' + data.error;
          } else {
            msgEl.textContent = 'Gespeichert.';
            currentEl.style.display = 'block';
            currentEl.textContent = 'Aktuell für Sync: ' + (notebookName || notebookId || '');
          }
        })
        .catch(function (e) {
          msgEl.textContent = 'Fehler: ' + (e.message || String(e));
        });
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
            self._setLastAssistantMessage(data.answer || '', data.sources || [], data.actions || []);
          }
        })
        .catch(function (e) {
          clearTimeout(timeoutId);
          self._showError('Fehler: ' + (e.message || String(e)));
          var msg = e.name === 'AbortError'
            ? 'Zeitüberschreitung (RAG kann 1–2 Min. dauern). Bitte erneut versuchen.'
            : 'Verbindung zur App fehlgeschlagen. Add-on-Log prüfen oder Seite neu laden.';
          self._setLastAssistantMessage(msg);
        })
        .finally(function () {
          sendBtn.disabled = false;
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
            self._setLastAssistantMessage(data.response != null ? data.response : (data.response || ''));
          }
        })
        .catch(function (e) {
          self._showError('Fehler: ' + (e.message || String(e)));
          self._setLastAssistantMessage('Aktion fehlgeschlagen. HA URL/Token in den App-Optionen prüfen.');
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

  customElements.define('ha-chat-panel', HaChatPanel);
})();
