/**
 * HA OneNote RAG Chat – läuft in der Add-on-App (Port 8765).
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
      .loading { opacity: 0.7; pointer-events: none; }
    </style>
    <div class="container">
      <div class="thread" id="thread"></div>
      <div class="input-row">
        <input type="text" id="input" placeholder="Frage stellen..." />
        <button id="send">Senden</button>
      </div>
      <div id="error" class="error" style="display:none;"></div>
    </div>
  `;

  function apiBase() {
    return window.location.origin;
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
    }

    _addMessage(role, content, extra) {
      extra = extra || {};
      this._thread.push({ role: role, content: content, sources: extra.sources, actions: extra.actions });
      this._render();
    }

    _render() {
      var threadEl = this.shadowRoot.getElementById('thread');
      var errEl = this.shadowRoot.getElementById('error');
      threadEl.innerHTML = '';
      var self = this;
      this._thread.forEach(function (m) {
        var div = document.createElement('div');
        div.className = 'msg ' + m.role;
        var html = '<div class="content">' + escapeHtml(m.content) + '</div>';
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
        div.innerHTML = html;
        div.querySelectorAll('.actions button').forEach(function (btn) {
          btn.addEventListener('click', function () { self._runAction(btn.dataset.utterance); });
        });
        threadEl.appendChild(div);
      });
      errEl.style.display = 'none';
    }

    _showError(msg) {
      var errEl = this.shadowRoot.getElementById('error');
      errEl.textContent = msg;
      errEl.style.display = 'block';
    }

    _send() {
      var input = this.shadowRoot.getElementById('input');
      var text = (input.value || '').trim();
      if (!text) return;
      input.value = '';
      this._addMessage('user', text);
      var container = this.shadowRoot.querySelector('.container');
      container.classList.add('loading');
      this._showError('');

      var self = this;
      fetch(apiBase() + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error) {
            self._showError(data.error);
            self._addMessage('assistant', 'Fehler: ' + data.error);
          } else {
            self._addMessage('assistant', data.answer || '', {
              sources: data.sources || [],
              actions: data.actions || []
            });
          }
        })
        .catch(function (e) {
          self._showError('Fehler: ' + (e.message || String(e)));
          self._addMessage('assistant', 'Verbindung zur App fehlgeschlagen. App läuft auf Port 8765.');
        })
        .finally(function () {
          container.classList.remove('loading');
        });
    }

    _runAction(utterance) {
      if (!utterance) return;
      this._addMessage('user', '[Aktion] ' + utterance);
      var container = this.shadowRoot.querySelector('.container');
      container.classList.add('loading');
      this._showError('');

      var self = this;
      fetch(apiBase() + '/api/execute_action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utterance: utterance })
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error) {
            self._showError(data.error);
            self._addMessage('assistant', 'Fehler: ' + data.error);
          } else {
            self._addMessage('assistant', data.response != null ? data.response : (data.response || ''));
          }
        })
        .catch(function (e) {
          self._showError('Fehler: ' + (e.message || String(e)));
          self._addMessage('assistant', 'Aktion fehlgeschlagen. HA URL/Token in den App-Optionen prüfen.');
        })
        .finally(function () {
          container.classList.remove('loading');
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
