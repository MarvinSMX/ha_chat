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
    <style>

      *, *::before, *::after { box-sizing: border-box; }
      :host { display: block; height: 100%; }
      .container { height: 100%; display: flex; flex-direction: row; padding: 0; background: var(--primary-background-color, #1c1c1c); color: var(--primary-text-color, #e0e0e0); font-family: inherit; gap: 0; position: relative; }
      .main { min-width: 0; flex: 1; display: flex; flex-direction: column; }
      .top-bar { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 16px 16px 10px; min-height: 32px; flex-shrink: 0; }
      .top-bar-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
      .top-bar-right { display: flex; align-items: center; gap: 10px; }
      .chat-inner { width: 100%; flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 0 16px 16px; }

      /* ── Thread: volle Breite, Scrollbar am Rand ── */
      .thread { flex: 1; width: 100%; overflow-y: auto; margin-bottom: 12px; min-height: 0; }
      /* Custom vertical scrollbar */
      .thread::-webkit-scrollbar { width: 5px; }
      .thread::-webkit-scrollbar-track { background: transparent; }
      .thread::-webkit-scrollbar-thumb { background: #383838; border-radius: 3px; }
      .thread::-webkit-scrollbar-thumb:hover { background: #555; }

      /* ── Nachrichten-Spalte: gleiche Breite wie Input ── */
      .msg-col { width: min(100%, 620px); margin: 0 auto; display: flex; flex-direction: column; align-items: flex-start; padding: 4px 0 8px; min-height: 100%; }
      .empty-state { width: 100%; flex: 1; min-height: 100%; margin: 0 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; }
      .empty-state img { width: 220px; height: 220px; opacity: 0.62; filter: grayscale(1) brightness(0.33) contrast(0.9); }
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

      /* ── Badge-Stil (nur Links/Quellen) ── */
      .badge { display: inline-block; margin: 0 2px 2px 0; padding: 1px 10px; border-radius: 12px; font-size: 0.83em; font-family: inherit; vertical-align: middle; text-decoration: none; border: none; cursor: pointer; transition: filter .15s; }

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
      .prompt-suggestions { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; align-items: center; justify-content: center; width: 100%; }
      .empty-state .prompt-suggestions { margin-top: 10px; margin-bottom: 0; max-width: min(100%, 560px); }
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
      .img-wrapper { position: relative; display: inline-block; max-width: 100%; margin: 6px 0; border-radius: 10px; overflow: hidden; }
      .img-skeleton { width: 320px; height: 200px; max-width: 100%; border-radius: 10px; background: linear-gradient(90deg,#1e2a30 25%,#263540 50%,#1e2a30 75%); background-size: 200% 100%; animation: skel-slide 1.4s ease-in-out infinite; }
      @keyframes skel-slide { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      .content img.chat-img { display: block; max-width: 100%; max-height: 360px; border-radius: 10px; cursor: zoom-in; object-fit: contain; opacity: 0; transition: opacity .3s; }
      .img-wrapper.loaded .img-skeleton { display: none; }
      .img-wrapper.loaded img.chat-img { opacity: 1; }
      .img-lightbox { position: fixed; inset: 0; background: rgba(0,0,0,.82); z-index: 200; display: flex; align-items: center; justify-content: center; cursor: zoom-out; }
      .img-lightbox img { max-width: 92vw; max-height: 88vh; border-radius: 12px; box-shadow: 0 8px 40px rgba(0,0,0,.7); }
      .graph-status { display: flex; align-items: center; gap: 6px; font-size: 0.8em; color: #aaa; white-space: nowrap; }
      .graph-status a { color: #009AC7; text-decoration: none; font-weight: 600; }
      .graph-status a:hover { text-decoration: underline; }
      .graph-login-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
      .graph-login-dot.ok  { background: #4caf50; }
      .graph-login-dot.err { background: #ff8a80; }
      .graph-login-dot.spin { background: #f0b429; animation: spin-dot 1s linear infinite; }
      @keyframes spin-dot { 0%{opacity:1}50%{opacity:.3}100%{opacity:1} }
      .graph-user-code { font-family: monospace; font-size: 1.05em; letter-spacing: 2px; color: #fff; background: #0d1f26; padding: 1px 7px; border-radius: 5px; user-select: all; cursor: copy; }
      .graph-login-btn { background: #009AC7; color: #fff; border: none; border-radius: 8px; padding: 2px 10px; font-size: 0.85em; cursor: pointer; font-family: inherit; }
      .sync-btn { display: flex; align-items: center; gap: 5px; background: #2d2d2d; border: 1px solid #3a3a3a; color: #aaa; border-radius: 8px; padding: 4px 11px; font-size: 0.8em; font-family: inherit; cursor: pointer; transition: border-color .15s, color .15s; white-space: nowrap; }
      .sync-btn:hover:not(:disabled) { border-color: #009AC7; color: #009AC7; }
      .sync-btn:disabled { opacity: .45; cursor: not-allowed; }
      .sync-btn svg { width: 13px; height: 13px; flex-shrink: 0; }
      @keyframes sync-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      .sync-btn.syncing svg { animation: sync-spin .8s linear infinite; }

      .sidebar { width: var(--ha-chat-sidebar-width, 256px); max-width: 45vw; background: var(--sidebar-background-color, #141414); color: var(--sidebar-text-color, var(--primary-text-color, #e1e1e1)); display: flex; flex-direction: column; min-height: 0; border-left: 1px solid var(--divider-color, rgba(255,255,255,0.12)); }
      .sidebar-head { min-height: 56px; padding: 8px; border-bottom: 1px solid var(--divider-color, rgba(255,255,255,0.12)); display: flex; align-items: center; gap: 8px; box-sizing: border-box; }
      .sidebar-head-left { min-width: 0; flex: 1; display: flex; align-items: center; gap: 8px; }
      .sidebar-head-right { display: flex; align-items: center; gap: 6px; }
      .sidebar-user { min-width: 0; font-size: 0.86rem; color: var(--sidebar-text-color, var(--primary-text-color, #e1e1e1)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .sidebar-toggle { width: 40px; height: 40px; border: none; background: transparent; color: var(--sidebar-icon-color, var(--secondary-text-color, #9b9b9b)); border-radius: 9999px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
      .sidebar-toggle:hover { background: rgba(255,255,255,0.06); }
      .sidebar-toggle svg { width: 22px; height: 22px; }
      .chat-list { flex: 1; min-height: 0; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 4px; }
      .sidebar[aria-expanded="false"] .chat-list { padding: 6px; }
      .new-chat-item { width: 100%; text-align: left; border: none; border-radius: var(--ha-border-radius-md, 8px); background: var(--ha-color-fill-primary-quiet-resting, rgba(0, 154, 199, 0.10)); color: var(--ha-color-text-link, #7bd4fb); padding: 10px 10px; cursor: pointer; font-family: inherit; }
      .new-chat-item:hover { background: var(--ha-color-fill-primary-quiet-hover, rgba(0, 154, 199, 0.16)); }
      .sidebar[aria-expanded="false"] .new-chat-item { padding: 10px 0; text-align: center; }
      .sidebar[aria-expanded="false"] .new-chat-item span { display: none; }
      .chat-row { position: relative; }
      .chat-item { width: 100%; text-align: left; border: none; border-radius: var(--ha-border-radius-md, 8px); background: transparent; color: var(--sidebar-text-color, var(--primary-text-color, #e1e1e1)); padding: 10px 44px 10px 10px; cursor: pointer; font-family: inherit; position: relative; display: block; }
      .chat-item:hover { background: rgba(255,255,255,0.06); }
      .chat-item.active { background: rgba(var(--rgb-primary-color, 0,154,199), 0.18); }
      .chat-delete-btn { position: absolute; top: 50%; right: 8px; transform: translateY(-50%); width: 30px; height: 30px; border: none; border-radius: 8px; background: transparent; color: var(--secondary-text-color, #9b9b9b); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
      .chat-delete-btn:hover { background: rgba(255,255,255,0.08); color: #ff8a80; }
      .chat-delete-btn svg { width: 16px; height: 16px; }
      .chat-delete-btn { opacity: 0; pointer-events: none; transition: opacity .12s ease; }
      .chat-row:hover .chat-delete-btn { opacity: 1; pointer-events: auto; }
      .sidebar[aria-expanded="false"] .chat-row { justify-content: center; }
      .sidebar[aria-expanded="false"] .chat-item-title,
      .sidebar[aria-expanded="false"] .chat-delete-btn { display: none; }
      .chat-item-title { font-size: 0.88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

      .sidebar-expand-btn { position: absolute; top: 12px; right: 12px; width: 40px; height: 40px; border: 1px solid var(--divider-color, rgba(255,255,255,0.12)); background: var(--card-background-color, rgba(20,20,20,0.6)); color: var(--primary-text-color, #e1e1e1); border-radius: 9999px; cursor: pointer; display: none; align-items: center; justify-content: center; backdrop-filter: blur(6px); }
      .sidebar-expand-btn:hover { background: rgba(255,255,255,0.08); }
      .sidebar-expand-btn svg { width: 22px; height: 22px; }
    </style>
    <div class="img-lightbox" id="img-lightbox" style="display:none"><img id="img-lightbox-img" src="" alt=""></div>
    <div class="container">
      <button id="sidebar-expand-btn" type="button" class="sidebar-expand-btn" aria-label="Seitenleiste öffnen" title="Seitenleiste öffnen">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path fill="currentColor" d="M3,8.39L4.41,7L9.42,12L4.41,17L3,15.61L6.56,12L3,8.39M8,6H21V8H8V6M11,13V11H21V13H11M8,18V16H21V18H8Z"></path>
        </svg>
      </button>
      <div class="main">
        <div class="top-bar">
          <div class="top-bar-left">
            <div id="graph-status" style="display:none" class="graph-status"></div>
            <button id="sync-btn" class="sync-btn" style="display:none" title="Doku-Sync starten">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>
              </svg>
              Sync
            </button>
          </div>
          <div class="top-bar-right"></div>
        </div>
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
      <aside class="sidebar">
        <div class="sidebar-head">
          <div class="sidebar-head-left">
            <div id="sidebar-user" class="sidebar-user"></div>
          </div>
          <div class="sidebar-head-right">
            <button id="sidebar-toggle" type="button" class="sidebar-toggle" aria-label="Seitenleiste umschalten" title="Seitenleiste umschalten">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path fill="currentColor" d="M21,15.61L19.59,17L14.58,12L19.59,7L21,8.39L17.44,12L21,15.61M3,6H16V8H3V6M3,13V11H13V13H3M3,18V16H16V18H3Z"></path>
              </svg>
            </button>
          </div>
        </div>
        <div id="chat-list" class="chat-list"></div>
      </aside>
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

  /* ── Inline-Markdown: fett, kursiv, code, [img:"url"], links ─────── */
  function processInline(text) {
    var out = '';
    // [img:"url"] vor normalem Link-Pattern prüfen
    var re = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[img:"([^"]+)"\]|\[([^\]]*)\]\(([^)]+)\))/g;
    var last = 0, m;
    while ((m = re.exec(text)) !== null) {
      out += escapeHtml(text.slice(last, m.index));
      if      (m[2] !== undefined) out += '<strong>' + escapeHtml(m[2]) + '</strong>';
      else if (m[3] !== undefined) out += '<em>' + escapeHtml(m[3]) + '</em>';
      else if (m[4] !== undefined) out += '<code>' + escapeHtml(m[4]) + '</code>';
      else if (m[5] !== undefined) {
        var proxySrc = apiBase() + '/api/proxy_image?url=' + encodeURIComponent(m[5]);
        out += '<span class="img-wrapper">'
          + '<span class="img-skeleton"></span>'
          + '<img class="chat-img" src="' + escapeAttr(proxySrc) + '" alt="Bild" loading="lazy">'
          + '</span>';
      }
      else out += '<a href="' + escapeAttr(m[7]) + '" target="_blank" rel="noopener" class="badge content-link">' + escapeHtml(m[6]) + '</a>';
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
      this._sessionId = 'sess-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
      this._chatId = null;
      this._chats = [];
      this._sidebarExpanded = false;
    }

    connectedCallback() {

      var self = this;
      var input   = this.shadowRoot.getElementById('input');
      var sendBtn = this.shadowRoot.getElementById('send');
      var threadEl = this.shadowRoot.getElementById('thread');
      var sidebarToggle = this.shadowRoot.getElementById('sidebar-toggle');
      var sidebarExpandBtn = this.shadowRoot.getElementById('sidebar-expand-btn');
      var syncBtn = this.shadowRoot.getElementById('sync-btn');

      /* Prompt-Vorschläge + Sync-Button: aus /config.json laden */
      this._renderSuggestions(PROMPT_SUGGESTIONS, input);
      fetch(apiBase() + '/config.json')
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (cfg) {
          var list = cfg && Array.isArray(cfg.prompt_suggestions) && cfg.prompt_suggestions.length
            ? cfg.prompt_suggestions : null;
          if (list) self._renderSuggestions(list, input);
          /* Sync-Button anzeigen falls konfiguriert */
          var syncBtn = self.shadowRoot.getElementById('sync-btn');
          if (syncBtn && cfg && cfg.sync_enabled) syncBtn.style.display = 'flex';
        })
        .catch(function () {});

      /* Sync-Button (nur Sidebar) */
      if (syncBtn) syncBtn.addEventListener('click', function () { self._triggerSync(); });

      /* MS Graph Login-Status prüfen */
      this._checkGraphStatus();
      this._loadMe();

      /* Senden */
      sendBtn.addEventListener('click',  function () { self._send(); });
      input.addEventListener('keydown',  function (e) { if (e.key === 'Enter') self._send(); });
      if (sidebarToggle) sidebarToggle.addEventListener('click', function () {
        self._sidebarExpanded = false;
        self._applySidebarState();
      });
      if (sidebarExpandBtn) sidebarExpandBtn.addEventListener('click', function () {
        self._sidebarExpanded = true;
        self._applySidebarState();
      });

      /* Skeleton ausblenden sobald Bild geladen */
      threadEl.addEventListener('load', function (e) {
        if (e.target && e.target.classList && e.target.classList.contains('chat-img')) {
          var wrapper = e.target.closest('.img-wrapper');
          if (wrapper) wrapper.classList.add('loaded');
        }
      }, true);
      /* Skeleton auch bei Fehler entfernen */
      threadEl.addEventListener('error', function (e) {
        if (e.target && e.target.classList && e.target.classList.contains('chat-img')) {
          var wrapper = e.target.closest('.img-wrapper');
          if (wrapper) { wrapper.classList.add('loaded'); e.target.style.opacity = '0.3'; }
        }
      }, true);

      /* Lightbox */
      var lightbox    = this.shadowRoot.getElementById('img-lightbox');
      var lightboxImg = this.shadowRoot.getElementById('img-lightbox-img');
      threadEl.addEventListener('click', function (e) {
        var img = e.target.closest('img.chat-img');
        if (img) {
          lightboxImg.src = img.src;
          lightboxImg.alt = img.alt;
          lightbox.style.display = 'flex';
          return;
        }
        var ub = e.target.closest('button[data-utterance]');
        if (ub) { self._runAction(ub.dataset.utterance); }
      });
      lightbox.addEventListener('click', function () {
        lightbox.style.display = 'none';
        lightboxImg.src = '';
      });

      this._loadChats();
      this._applySidebarState();
    }

    _applySidebarState() {
      var aside = this.shadowRoot.querySelector('.sidebar');
      if (!aside) return;
      aside.style.display = this._sidebarExpanded ? 'flex' : 'none';

      var expandBtn = this.shadowRoot.getElementById('sidebar-expand-btn');
      if (expandBtn) expandBtn.style.display = this._sidebarExpanded ? 'none' : 'inline-flex';

      var graph = this.shadowRoot.getElementById('graph-status-sidebar');
      if (graph) graph.style.display = this._sidebarExpanded ? '' : 'none';
      var sync = this.shadowRoot.getElementById('sync-btn-sidebar');
      if (sync) sync.style.display = this._sidebarExpanded ? 'flex' : 'none';
    }

    _shortDate(ts) {
      if (!ts) return '';
      try {
        return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
      } catch (_) {
        return '';
      }
    }

    _loadMe() {
      var self = this;
      fetch(apiBase() + '/api/me')
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (d) {
          var me = d && d.me ? d.me : {};
          var label = (me && (me.display_name || me.name || me.id)) ? String(me.display_name || me.name || me.id) : '';
          if (!label || label === 'public') label = 'Gast';
          var el = self.shadowRoot.getElementById('sidebar-user');
          if (el) el.textContent = label;
        })
        .catch(function () {});
    }

    _renderChatList() {
      var listEl = this.shadowRoot.getElementById('chat-list');
      if (!listEl) return;
      listEl.innerHTML = '';
      var self = this;

      var newBtn = document.createElement('button');
      newBtn.type = 'button';
      newBtn.className = 'new-chat-item';
      newBtn.innerHTML = '<strong>+</strong> <span>Neuer Chat</span>';
      newBtn.addEventListener('click', function () { self._createNewChat(true); });
      listEl.appendChild(newBtn);

      this._chats.forEach(function (chat) {
        var row = document.createElement('div');
        row.className = 'chat-row';

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chat-item' + (chat.id === self._chatId ? ' active' : '');
        btn.innerHTML = '<div class="chat-item-title">' + escapeHtml(chat.title || 'Neuer Chat') + '</div>';
        btn.addEventListener('click', function () { self._selectChat(chat.id); });

        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'chat-delete-btn';
        del.title = 'Chat löschen';
        del.setAttribute('aria-label', 'Chat löschen');
        del.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M9,3V4H4V6H5V19A2,2 0 0,0 7,21H17A2,2 0 0,0 19,19V6H20V4H15V3H9M7,6H17V19H7V6M9,8V17H11V8H9M13,8V17H15V8H13Z"></path></svg>';
        del.addEventListener('click', function (e) {
          e.stopPropagation();
          self._deleteChat(chat.id);
        });

        row.appendChild(btn);
        row.appendChild(del);
        listEl.appendChild(row);
      });
    }

    _deleteChat(chatId) {
      var self = this;
      if (!chatId) return;
      fetch(apiBase() + '/api/chats/' + encodeURIComponent(chatId), { method: 'DELETE' })
        .then(function (r) { return parseJsonResponse(r); })
        .then(function () {
          if (self._chatId === chatId) {
            self._chatId = null;
            self._thread = [];
          }
          self._loadChats();
        })
        .catch(function (e) {
          self._showError('Chat konnte nicht gelöscht werden: ' + (e.message || e));
        });
    }

    _loadChats() {
      var self = this;
      fetch(apiBase() + '/api/chats')
        .then(function (r) { return parseJsonResponse(r); })
        .then(function (d) {
          self._chats = Array.isArray(d.chats) ? d.chats : [];
          self._renderChatList();
          if (!self._chatId) {
            if (self._chats.length) self._selectChat(self._chats[0].id);
            else self._createNewChat(false);
          }
        })
        .catch(function () {
          self._createNewChat(false);
        });
    }

    _createNewChat(focusInput) {
      var self = this;
      fetch(apiBase() + '/api/chats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
        .then(function (r) { return parseJsonResponse(r); })
        .then(function (d) {
          if (!d.chat || !d.chat.id) return;
          self._chatId = d.chat.id;
          self._thread = [];
          self._loadChats();
          self._render();
          if (focusInput) {
            var input = self.shadowRoot.getElementById('input');
            if (input) input.focus();
          }
        })
        .catch(function () {});
    }

    _selectChat(chatId) {
      var self = this;
      if (!chatId) return;
      fetch(apiBase() + '/api/chats/' + encodeURIComponent(chatId))
        .then(function (r) { return parseJsonResponse(r); })
        .then(function (d) {
          var chat = d.chat || {};
          self._chatId = chat.id || chatId;
          self._thread = Array.isArray(chat.messages) ? chat.messages.map(function (m) {
            return {
              role: m.role,
              content: m.content || '',
              sources: Array.isArray(m.sources) ? m.sources : [],
              actions: Array.isArray(m.actions) ? m.actions : [],
              pending: false,
            };
          }) : [];
          self._renderChatList();
          self._render();
        })
        .catch(function (e) {
          self._showError('Chat konnte nicht geladen werden: ' + (e.message || e));
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
        pending: !!extra.pending
      });
      this._render();
    }

    _setLastAssistantMessage(content, sources, actions) {
      for (var i = this._thread.length - 1; i >= 0; i--) {
        if (this._thread[i].role === 'assistant') {
          this._thread[i].sources  = sources || [];
          this._thread[i].actions  = actions || [];
          this._thread[i].pending  = false;
          this._thread[i].streaming = !!content;
          this._thread[i].content  = '';
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
      var inputArea = this.shadowRoot.querySelector('.input-area');
      var inputWrap = this.shadowRoot.querySelector('.input-wrapper');
      var scrollBottom = threadEl.scrollHeight - threadEl.scrollTop - threadEl.clientHeight < 80;
      msgCol.innerHTML = '';

      /* Suggestions nur bei leerer Unterhaltung */
      if (suggestEl) suggestEl.style.display = this._thread.length === 0 ? '' : 'none';

      if (this._thread.length === 0) {
        var empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = '<img src="' + escapeAttr(apiBase() + '/logo.svg') + '" alt="Home Assistant Logo">';
        if (suggestEl) empty.appendChild(suggestEl);
        msgCol.appendChild(empty);
      } else if (suggestEl && inputArea && suggestEl.parentNode !== inputArea) {
        if (inputWrap) inputArea.insertBefore(suggestEl, inputWrap);
        else inputArea.appendChild(suggestEl);
      }

      this._thread.forEach(function (m) {
        var div = document.createElement('div');
        div.className = 'msg ' + m.role;
        if (m.pending) {
          div.innerHTML = '<div class="content"><span class="typing-indicator"><span></span><span></span><span></span></span></div>';
        } else {
          var bodyHtml;
          if (m.streaming) {
            bodyHtml = renderMarkdown(m.content) + '<span class="stream-cursor"></span>';
          } else if (m.role === 'assistant') {
            bodyHtml = renderMarkdown(m.content);
          } else {
            bodyHtml = escapeHtml(m.content);
          }
          var html = '<div class="content">' + bodyHtml + '</div>';
          if (m.sources && m.sources.length) {
            html += '<div class="sources"><span class="sources-label">Quellen:</span>' +
              m.sources.map(function (s) {
                return s.url
                  ? '<a target="_blank" rel="noopener" href="' + escapeAttr(s.url) + '" class="badge content-link">' + escapeHtml(s.title || 'Link') + '</a>'
                  : '<span class="badge content-link" style="opacity:.7;cursor:default">' + escapeHtml(s.title || '') + '</span>';
              }).join('') + '</div>';
          }
          if (m.actions && m.actions.length) {
            html += '<div class="actions">';
            m.actions.forEach(function (a, idx) {
              html += '<button type="button" data-utterance="' + escapeAttr(a.utterance || '') + '">' + escapeHtml(a.label || a.utterance || ('Aktion ' + (idx + 1))) + '</button>';
            });
            html += '</div>';
          }
          div.innerHTML = html;
        }
        msgCol.appendChild(div);
      });

      if (scrollBottom) threadEl.scrollTop = threadEl.scrollHeight;
    }

    /* ── MS Graph Status (Header, Device Code Flow) ─────────────────── */
    _checkGraphStatus() {
      var self = this;
      var bar = this.shadowRoot.getElementById('graph-status');
      if (!bar) return;
      fetch(apiBase() + '/api/graph_status')
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (s) {
          if (!s.configured) {
            bar.style.display = 'none';
            return;
          }
          bar.style.display = 'flex';
          if (s.authenticated) {
            bar.innerHTML = '<span class="graph-login-dot ok"></span>Graph';
          } else {
            bar.innerHTML = '<span class="graph-login-dot err"></span>'
              + '<button class="graph-login-btn">Graph anmelden</button>';
            var b = bar.querySelector('.graph-login-btn');
            if (b) b.addEventListener('click', function () { self._startDeviceLogin(); });
          }
        })
        .catch(function () {
          bar.style.display = 'none';
        });
    }

    _startDeviceLogin() {
      var self = this;
      var bar = this.shadowRoot.getElementById('graph-status');
      bar.innerHTML = '<span class="graph-login-dot spin"></span>Warte…';

      fetch(apiBase() + '/api/graph_device_start', { method: 'POST' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.error) {
            bar.innerHTML = '<span class="graph-login-dot err"></span>Fehler: ' + d.error;
            return;
          }
          bar.innerHTML =
            '<span class="graph-login-dot spin"></span>'
            + '<a href="' + d.verification_uri + '" target="_blank">' + d.verification_uri + '</a>'
            + '&nbsp;Code:&nbsp;<span class="graph-user-code" title="Klicken zum Kopieren">' + d.user_code + '</span>';

          var codeEl = bar.querySelector('.graph-user-code');
          if (codeEl) codeEl.addEventListener('click', function () {
            navigator.clipboard && navigator.clipboard.writeText(d.user_code).catch(function(){});
          });

          var deadline = Date.now() + (d.expires_in || 900) * 1000;
          var interval = (d.interval || 5) * 1000;
          var poll = setInterval(function () {
            if (Date.now() > deadline) { clearInterval(poll); self._checkGraphStatus(); return; }
            fetch(apiBase() + '/api/graph_device_poll', { method: 'POST' })
              .then(function (r) { return r.json(); })
              .then(function (p) {
                if (p.status === 'ok' || p.status === 'error' || p.status === 'expired') {
                  clearInterval(poll);
                  self._checkGraphStatus();
                }
              })
              .catch(function () {});
          }, interval);
        })
        .catch(function () {
          bar.innerHTML = '<span class="graph-login-dot err"></span>Fehler';
        });
    }

    /* ── Manueller Doku-Sync ─────────────────────────────────────────── */
    _triggerSync() {
      var btn = this.shadowRoot.getElementById('sync-btn');
      if (!btn || btn.disabled) return;
      btn.disabled = true;
      btn.classList.add('syncing');
      fetch(apiBase() + '/api/sync', { method: 'POST' })
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (d) {
          btn.classList.remove('syncing');
          btn.disabled = false;
          btn.title = d.ok ? 'Sync erfolgreich ✓' : ('Sync Fehler: ' + (d.error || d.status));
          setTimeout(function () { btn.title = 'Doku-Sync starten'; }, 4000);
        })
        .catch(function (e) {
          btn.classList.remove('syncing');
          btn.disabled = false;
          btn.title = 'Sync Fehler: ' + e.message;
          setTimeout(function () { btn.title = 'Doku-Sync starten'; }, 4000);
        });
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
        body: JSON.stringify({ message: text, session_id: self._sessionId, chat_id: self._chatId }),
        signal: controller.signal
      })
        .then(function (r) { clearTimeout(timer); return parseJsonResponse(r); })
        .then(function (d) {
          if (d.error) {
            self._showError(d.error);
            self._setLastAssistantMessage('Fehler: ' + d.error);
          } else {
            self._setLastAssistantMessage(d.answer || '', d.sources || [], d.actions || []);
            if (d.chat_id && d.chat_id !== self._chatId) self._chatId = d.chat_id;
            self._loadChats();
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
        body: JSON.stringify({ utterance: utterance, session_id: self._sessionId, chat_id: self._chatId })
      })
        .then(function (r) { return parseJsonResponse(r); })
        .then(function (d) {
          if (d.error) {
            self._showError(d.error);
            self._setLastAssistantMessage('Fehler: ' + d.error);
          } else {
            var ans = d.answer != null ? d.answer : (d.response != null ? d.response : '');
            self._setLastAssistantMessage(ans, d.sources || [], d.actions || []);
            if (d.chat_id && d.chat_id !== self._chatId) self._chatId = d.chat_id;
            self._loadChats();
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
