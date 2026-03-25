/* HA Chat FAB (HACS Frontend resource)
 * Lovelace Custom Card: FAB + Popup, Chat per fetch gegen den echten Ingress-Pfad.
 *
 * /hassio/ingress/<name>/api/* liefert von Lovelace oft HTML/405. Der Pfad
 * /api/hassio_ingress/<token>/api/* (von „Expose Add-on Ingress Path“) wird
 * von HA korrekt an das Add-on durchgereicht.
 *
 * Card type: custom:ha-chat-fab
 * Config:
 *   addon_slug: "2954ddb4_ha_chat"
 *   ingress_api_base: optional fest "/api/hassio_ingress/…" (wenn Lookup nicht geht)
 *   icon, zIndex
 */

(() => {
  const OVERLAY_CLASS = 'ha-chat-fab-overlay';
  const STYLE_ID = 'ha-chat-fab-styles';
  const POPUP_CLASS = 'ha-chat-fab-popup';

  const fetchOpts = { credentials: 'same-origin' };

  function escapeHtml(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function escapeAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function parseJsonResponse(r) {
    return r.text().then(function (text) {
      const raw = (text || '').replace(/^\uFEFF/, '').trim();
      let data;
      try {
        if (!raw) throw new Error('Leere Antwort');
        if (raw[0] !== '{' && raw[0] !== '[') throw new Error(raw.length < 120 ? raw : raw.slice(0, 100) + '…');
        data = JSON.parse(raw);
      } catch (e) {
        let msg = r.status ? 'HTTP ' + r.status : 'Kein gültiges JSON';
        if (e.message && e.message !== 'Leere Antwort') msg += ' – ' + e.message;
        throw new Error(msg);
      }
      if (!r.ok) throw new Error((data && (data.error || data.message)) || 'HTTP ' + r.status);
      return data;
    });
  }

  function processInline(text, apiPathPrefix) {
    const prefix = apiPathPrefix || '';
    let out = '';
    const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[img:"([^"]+)"\]|\[([^\]]*)\]\(([^)]+)\))/g;
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      out += escapeHtml(text.slice(last, m.index));
      if (m[2] !== undefined) out += '<strong>' + escapeHtml(m[2]) + '</strong>';
      else if (m[3] !== undefined) out += '<em>' + escapeHtml(m[3]) + '</em>';
      else if (m[4] !== undefined) out += '<code>' + escapeHtml(m[4]) + '</code>';
      else if (m[5] !== undefined) {
        const proxySrc = prefix + '/api/proxy_image?url=' + encodeURIComponent(m[5]);
        out += '<span class="img-wrapper">'
          + '<span class="img-skeleton"></span>'
          + '<img class="chat-img" src="' + escapeAttr(proxySrc) + '" alt="Bild" loading="lazy">'
          + '</span>';
      } else {
        out += '<a href="' + escapeAttr(m[7]) + '" target="_blank" rel="noopener" class="badge content-link">' + escapeHtml(m[6]) + '</a>';
      }
      last = re.lastIndex;
    }
    out += escapeHtml(text.slice(last));
    return out;
  }

  function renderMarkdown(text, apiPathPrefix) {
    if (!text) return '';
    const lines = text.split('\n');
    let out = '';
    const listBuf = [];

    function flushList() {
      if (!listBuf.length) return;
      out += '<ul>';
      listBuf.forEach(function (li) { out += '<li>' + processInline(li, apiPathPrefix) + '</li>'; });
      out += '</ul>';
      listBuf.length = 0;
    }

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const hm = line.match(/^(#{1,4})\s+(.*)/);
      if (hm) {
        flushList();
        const tag = 'h' + (hm[1].length + 2);
        out += '<' + tag + '>' + processInline(hm[2], apiPathPrefix) + '</' + tag + '>';
        i++;
        continue;
      }
      if (/^---+$/.test(line.trim())) {
        flushList();
        out += '<hr>';
        i++;
        continue;
      }
      const lm = line.match(/^[\-\*]\s+(.*)/);
      if (lm) {
        listBuf.push(lm[1]);
        i++;
        continue;
      }
      flushList();
      if (line.trim() === '') {
        if (out.length && !out.endsWith('<br>')) out += '<br>';
        i++;
        continue;
      }
      out += processInline(line, apiPathPrefix) + '\n';
      i++;
    }
    flushList();
    return out;
  }

  function ensureStyles(root) {
    const r = root || document.head || document.documentElement;
    if (!r) return;
    const exists = r.querySelector ? r.querySelector('#' + STYLE_ID) : null;
    if (exists) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${OVERLAY_CLASS}{
        position:fixed;
        display:flex;
        align-items:center;
        justify-content:center;
        bottom:calc(var(--ha-space-4, 16px) + var(--safe-area-inset-bottom, 0px));
        right:calc(var(--ha-space-4, 16px) + var(--safe-area-inset-right, 0px));
      }
      .${OVERLAY_CLASS} button{
        width:56px;height:56px;border-radius:9999px;border:none;cursor:pointer;
        background:var(--ha-color-fill-primary-loud-resting, var(--primary-color, #03a9f4));
        color:var(--ha-color-on-primary-loud, #fff);
        box-shadow:var(--ha-box-shadow-m, 0 4px 12px rgba(0,0,0,.35));
        display:flex;align-items:center;justify-content:center;
        -webkit-tap-highlight-color:transparent;
      }
      .${OVERLAY_CLASS} button:hover{filter:brightness(0.95)}
      .${OVERLAY_CLASS} ha-icon{color:inherit}
      .${OVERLAY_CLASS} svg{width:22px;height:22px;display:block}

      .${POPUP_CLASS}{
        position:fixed;
        right:calc(var(--ha-space-4, 16px) + var(--safe-area-inset-right, 0px));
        bottom:calc(var(--ha-space-4, 16px) + var(--safe-area-inset-bottom, 0px));
        width:min(380px, calc(100vw - 24px));
        height:min(540px, calc(100vh - 120px));
        background:var(--card-background-color, rgba(25,25,25,0.98));
        color:var(--primary-text-color, #e1e1e1);
        border:1px solid var(--divider-color, rgba(255,255,255,0.12));
        border-radius:18px;
        border-bottom-right-radius:4px;
        box-shadow:var(--ha-box-shadow-l, 0 10px 30px rgba(0,0,0,.45));
        overflow:hidden;
        display:none;
        flex-direction:column;
        z-index:100000;
        font-family:inherit;
      }
      .${POPUP_CLASS}[data-open="true"]{display:flex;}
      .${POPUP_CLASS} .head{
        height:48px;
        flex-shrink:0;
        display:flex;
        align-items:center;
        justify-content:space-between;
        padding:0 8px 0 12px;
        background:var(--sidebar-menu-button-background-color, rgba(0,0,0,0.08));
      }
      .${POPUP_CLASS} .title{font-weight:600;font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .${POPUP_CLASS} .head .btn{
        width:40px;height:40px;border:none;border-radius:9999px;background:transparent;
        color:var(--secondary-text-color, #9b9b9b);cursor:pointer;display:flex;align-items:center;justify-content:center;
      }
      .${POPUP_CLASS} .head .btn:hover{background:rgba(255,255,255,0.08);color:var(--primary-text-color,#fff);}
      .${POPUP_CLASS} .body{flex:1;min-height:0;display:flex;flex-direction:column;}
      .${POPUP_CLASS} .thread{flex:1;overflow-y:auto;min-height:0;padding:8px 10px;}
      .${POPUP_CLASS} .msg-col{display:flex;flex-direction:column;align-items:flex-start;gap:6px;max-width:620px;margin:0 auto;}
      .${POPUP_CLASS} .msg{margin:2px 0;padding:9px 12px;border-radius:14px;max-width:92%;width:fit-content;line-height:1.5;font-size:0.9rem;}
      .${POPUP_CLASS} .msg.user{background:#009AC7;color:#fff;align-self:flex-end;border-bottom-right-radius:4px;}
      .${POPUP_CLASS} .msg.assistant{background:#2d2d2d;border:1px solid #3a3a3a;border-bottom-left-radius:4px;}
      .${POPUP_CLASS} .content{white-space:pre-wrap;word-break:break-word;}
      .${POPUP_CLASS} .content h3,.${POPUP_CLASS} .content h4,.${POPUP_CLASS} .content h5{margin:8px 0 4px;font-size:1em;}
      .${POPUP_CLASS} .content ul{margin:4px 0 4px 16px;padding:0;}
      .${POPUP_CLASS} .content code{background:#1a1a1a;color:#9cdcfe;border-radius:4px;padding:1px 4px;font-size:0.85em;}
      .${POPUP_CLASS} .content a.content-link{color:#fff;background:#009AC7;text-decoration:none;padding:1px 8px;border-radius:10px;font-size:0.82em;}
      .${POPUP_CLASS} .sources{margin-top:6px;font-size:0.8em;display:flex;flex-wrap:wrap;gap:4px;}
      .${POPUP_CLASS} .actions{margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;}
      .${POPUP_CLASS} .actions button{padding:4px 10px;border-radius:8px;border:1px solid #3a3a3a;background:#2d2d2d;color:#ccc;font-size:0.8rem;cursor:pointer;}
      .${POPUP_CLASS} .actions button:hover{border-color:#009AC7;color:#009AC7;}
      .${POPUP_CLASS} .typing-indicator{display:inline-flex;gap:3px;}
      .${POPUP_CLASS} .typing-indicator span{width:5px;height:5px;border-radius:50%;background:#009AC7;animation:fab-blink .6s ease-in-out infinite both;}
      .${POPUP_CLASS} .typing-indicator span:nth-child(2){animation-delay:.1s;}
      .${POPUP_CLASS} .typing-indicator span:nth-child(3){animation-delay:.2s;}
      @keyframes fab-blink{0%,80%,100%{transform:scale(.6);opacity:.5}40%{transform:scale(1);opacity:1}}
      .${POPUP_CLASS} .img-wrapper{position:relative;display:inline-block;max-width:100%;margin:4px 0;border-radius:8px;overflow:hidden;}
      .${POPUP_CLASS} .img-skeleton{width:240px;height:140px;max-width:100%;border-radius:8px;background:linear-gradient(90deg,#1e2a30 25%,#263540 50%,#1e2a30 75%);background-size:200% 100%;animation:fab-skel 1.4s ease-in-out infinite;}
      @keyframes fab-skel{0%{background-position:200% 0}100%{background-position:-200% 0}}
      .${POPUP_CLASS} .chat-img{display:block;max-width:100%;max-height:220px;border-radius:8px;object-fit:contain;opacity:0;transition:opacity .25s;}
      .${POPUP_CLASS} .img-wrapper.loaded .img-skeleton{display:none;}
      .${POPUP_CLASS} .img-wrapper.loaded .chat-img{opacity:1;}
      .${POPUP_CLASS} .composer{flex-shrink:0;padding:8px 10px 10px;}
      .${POPUP_CLASS} .input-wrap{display:flex;gap:8px;align-items:center;padding:6px 10px;background:#2d2d2d;border:1px solid #3a3a3a;border-radius:20px;}
      .${POPUP_CLASS} .input-wrap input{flex:1;min-width:0;border:none;background:transparent;color:inherit;font-size:0.9rem;outline:none;}
      .${POPUP_CLASS} .send-btn{width:38px;height:38px;border-radius:50%;border:none;background:#009AC7;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;}
      .${POPUP_CLASS} .send-btn:disabled{opacity:.45;cursor:not-allowed;}
      .${POPUP_CLASS} .fab-error{color:#ff8a80;font-size:0.82rem;padding:0 10px 6px;display:none;}
      .${POPUP_CLASS} .fab-status{font-size:0.75rem;color:#888;padding:4px 10px;display:none;}
      .${POPUP_CLASS} .empty-hint{text-align:center;color:#666;font-size:0.85rem;padding:24px 12px;}
    `;
    r.appendChild(style);
  }

  function getOverlayRoot() {
    const ha = document.querySelector('home-assistant');
    if (ha && ha.shadowRoot) return ha.shadowRoot;
    return document.body;
  }

  function cleanupLegacyOverlays() {
    const root = getOverlayRoot();
    if (!root || !root.querySelectorAll) return;
    const legacy = root.querySelectorAll(`.${OVERLAY_CLASS}:not([data-owner="ha-chat-fab"]), .${POPUP_CLASS}:not([data-owner="ha-chat-fab"])`);
    legacy.forEach((el) => {
      try { el.remove(); } catch (_) {}
    });
  }

  function createIconEl(iconName) {
    const wrap = document.createElement('span');
    wrap.style.display = 'inline-flex';
    wrap.style.alignItems = 'center';
    wrap.style.justifyContent = 'center';

    const haIcon = document.createElement('ha-icon');
    haIcon.setAttribute('icon', iconName || 'mdi:chat');
    wrap.appendChild(haIcon);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('d', 'M20,2H4A2,2 0 0,0 2,4V22L6,18H20A2,2 0 0,0 22,16V4A2,2 0 0,0 20,2M20,16H5.17L4,17.17V4H20V16Z');
    svg.appendChild(path);
    svg.style.display = 'none';
    wrap.appendChild(svg);

    setTimeout(() => {
      const upgraded = !!(customElements.get('ha-icon') && haIcon.shadowRoot);
      if (!upgraded) {
        haIcon.style.display = 'none';
        svg.style.display = 'block';
      }
    }, 0);

    return wrap;
  }

  class HaChatFabCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = {};
      this._overlayEl = null;
      this._popupEl = null;
      this._open = false;
      this._instanceId = 'fab-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      this._apiPathPrefix = null;
      this._resolvePromise = null;
      this._sessionId = 'sess-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
      this._chatId = null;
      this._thread = [];
      this._boundThreadClick = null;
      this._boundOutsidePointer = (e) => {
        if (!this._open || !this._popupEl) return;
        const t = e.target;
        const insidePopup = this._popupEl.contains(t);
        const insideFab = this._overlayEl && this._overlayEl.contains(t);
        if (!insidePopup && !insideFab) this._setOpen(false);
      };
      this.shadowRoot.innerHTML = `<style>:host{display:block;width:0;height:0;overflow:hidden;}</style>`;
    }

    static getStubConfig() {
      return {
        addon_slug: '2954ddb4_ha_chat',
        icon: 'mdi:chat',
      };
    }

    getCardSize() {
      return 0;
    }

    _addonSlug() {
      const c = this._config || {};
      const s = (typeof c.addon_slug === 'string' && c.addon_slug.trim())
        ? c.addon_slug.trim()
        : (typeof c.slug === 'string' && c.slug.trim() ? c.slug.trim() : '');
      return s || '2954ddb4_ha_chat';
    }

    _manualIngressBase() {
      const c = this._config || {};
      const k = ['ingress_api_base', 'api_base', 'ingress_path'];
      for (let i = 0; i < k.length; i++) {
        const v = c[k[i]];
        if (typeof v === 'string' && v.trim()) return v.trim().replace(/\/$/, '');
      }
      return '';
    }

    setConfig(config) {
      this._config = config || {};
      this._apiPathPrefix = null;
      this._resolvePromise = null;
      if (this._popupEl) {
        this._unmountPopup();
        if (this._open) this._mountPopup();
      }
      this._updateOverlay();
    }

    connectedCallback() {
      ensureStyles(document.head || document.documentElement);
      ensureStyles(getOverlayRoot());
      cleanupLegacyOverlays();
      this._mountOverlay();
      this._updateOverlay();
    }

    disconnectedCallback() {
      document.removeEventListener('mousedown', this._boundOutsidePointer, true);
      document.removeEventListener('touchstart', this._boundOutsidePointer, true);
      this._unmountOverlay();
      this._unmountPopup();
    }

    _apiUrl(path) {
      const p = path.startsWith('/') ? path : '/' + path;
      return this._apiPathPrefix + p;
    }

    _fetchIngressPath() {
      const slug = this._addonSlug();
      const url = '/api/hassio_addon_ingress_path/' + encodeURIComponent(slug);
      return fetch(url, fetchOpts).then((r) => {
        if (!r.ok) {
          return r.text().then((t) => {
            throw new Error('Ingress-Pfad (HTTP ' + r.status + '): Integration aktiv? ' + (t && t.length < 80 ? t : ''));
          });
        }
        return r.text();
      }).then((text) => {
        let t = (text || '').trim().replace(/^\uFEFF/, '');
        if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
          try { t = JSON.parse(t); } catch (_) { t = t.slice(1, -1); }
        }
        t = String(t).trim().replace(/\/$/, '');
        if (!t || t[0] !== '/' || t.startsWith('<')) {
          throw new Error('Ungültiger Ingress-Pfad von hassio_addon_ingress_path');
        }
        return t;
      });
    }

    _ensureApiBase() {
      const manual = this._manualIngressBase();
      if (manual) {
        this._apiPathPrefix = manual;
        return Promise.resolve(manual);
      }
      if (this._apiPathPrefix) return Promise.resolve(this._apiPathPrefix);
      if (this._resolvePromise) return this._resolvePromise;
      const self = this;
      this._resolvePromise = this._fetchIngressPath()
        .then((prefix) => {
          self._apiPathPrefix = prefix;
          return prefix;
        })
        .finally(() => {
          self._resolvePromise = null;
        });
      return this._resolvePromise;
    }

    _showStatus(msg, isError) {
      if (!this._popupEl) return;
      const el = this._popupEl.querySelector('.fab-status');
      const err = this._popupEl.querySelector('.fab-error');
      if (!el) return;
      el.style.display = msg ? 'block' : 'none';
      el.textContent = msg || '';
      el.style.color = isError ? '#ff8a80' : '#888';
      if (err && isError) err.style.display = 'none';
    }

    _showError(msg) {
      if (!this._popupEl) return;
      const el = this._popupEl.querySelector('.fab-error');
      if (!el) return;
      el.style.display = msg ? 'block' : 'none';
      el.textContent = msg || '';
      this._showStatus('', false);
    }

    _mountOverlay() {
      if (this._overlayEl) return;
      const root = getOverlayRoot();
      const host = document.createElement('div');
      host.className = OVERLAY_CLASS;
      host.setAttribute('data-instance', this._instanceId);
      host.setAttribute('data-owner', 'ha-chat-fab');
      host.style.display = 'flex';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'HA Chat öffnen');
      btn.title = 'HA Chat';

      const iconName = (this._config && typeof this._config.icon === 'string' && this._config.icon.trim())
        ? this._config.icon.trim()
        : 'mdi:chat';
      btn.appendChild(createIconEl(iconName));

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._togglePopup();
      }, true);

      host.appendChild(btn);
      root.appendChild(host);
      this._overlayEl = host;
    }

    _mountPopup() {
      if (this._popupEl) return;
      const root = getOverlayRoot();
      const pop = document.createElement('div');
      pop.className = POPUP_CLASS;
      pop.setAttribute('data-instance', this._instanceId);
      pop.setAttribute('data-owner', 'ha-chat-fab');
      pop.setAttribute('data-open', 'false');

      pop.innerHTML = `
        <div class="head">
          <div class="title">HA Chat</div>
          <button class="btn" type="button" aria-label="Schließen" title="Schließen">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"></path></svg>
          </button>
        </div>
        <div class="fab-status"></div>
        <div class="body">
          <div class="thread" id="fab-thread"><div class="msg-col" id="fab-msg-col"></div></div>
          <div class="fab-error"></div>
          <div class="composer">
            <div class="input-wrap">
              <input type="text" id="fab-input" placeholder="Nachricht …" autocomplete="off" />
              <button type="button" class="send-btn" id="fab-send" title="Senden" aria-label="Senden">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 19V5M5 12l7-7 7 7"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      `;

      pop.querySelector('.head .btn').addEventListener('click', () => this._setOpen(false));
      pop.querySelector('#fab-send').addEventListener('click', () => this._send());
      pop.querySelector('#fab-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this._send();
        }
      });

      this._boundThreadClick = (e) => {
        const ub = e.target.closest('button[data-utterance]');
        if (ub) this._runAction(ub.dataset.utterance);
        const img = e.target.closest('img.chat-img');
        if (img && img.parentElement && img.parentElement.classList.contains('img-wrapper')) {
          img.parentElement.classList.add('loaded');
        }
      };
      pop.querySelector('#fab-thread').addEventListener('click', this._boundThreadClick);

      root.appendChild(pop);
      this._popupEl = pop;
    }

    _unmountPopup() {
      if (this._popupEl && this._popupEl.parentNode) {
        if (this._boundThreadClick) {
          const th = this._popupEl.querySelector('#fab-thread');
          if (th) th.removeEventListener('click', this._boundThreadClick);
        }
        this._popupEl.parentNode.removeChild(this._popupEl);
      }
      this._popupEl = null;
      this._boundThreadClick = null;
    }

    _togglePopup() {
      this._setOpen(!this._open);
    }

    _setOpen(open) {
      this._open = !!open;
      this._mountPopup();
      if (!this._popupEl) return;
      this._popupEl.setAttribute('data-open', this._open ? 'true' : 'false');
      if (this._overlayEl) this._overlayEl.style.display = this._open ? 'none' : 'flex';

      if (this._open) {
        document.addEventListener('mousedown', this._boundOutsidePointer, true);
        document.addEventListener('touchstart', this._boundOutsidePointer, true);
        const self = this;
        this._showStatus('Verbinde …', false);
        this._ensureApiBase()
          .then(() => {
            self._showStatus('', false);
            self._showError('');
            self._chatId = null;
            self._thread = [];
            return self._createNewChat(true);
          })
          .catch((e) => {
            self._showStatus((e && e.message) || String(e), true);
            self._renderThread();
          });
      } else {
        document.removeEventListener('mousedown', this._boundOutsidePointer, true);
        document.removeEventListener('touchstart', this._boundOutsidePointer, true);
      }
    }

    _createNewChat(focusInput) {
      const self = this;
      return fetch(this._apiUrl('/api/chats'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        ...fetchOpts,
      })
        .then((r) => parseJsonResponse(r))
        .then((d) => {
          if (!d.chat || !d.chat.id) {
            self._showError('Neuer Chat: ungültige Server-Antwort');
            return;
          }
          self._chatId = d.chat.id;
          self._thread = [];
        })
        .then(() => {
          self._renderThread();
          if (focusInput) {
            const inp = self._popupEl && self._popupEl.querySelector('#fab-input');
            if (inp) inp.focus();
          }
        })
        .catch((e) => {
          self._showError('Neuer Chat: ' + (e.message || e));
        });
    }

    _renderThread() {
      const col = this._popupEl && this._popupEl.querySelector('#fab-msg-col');
      const threadEl = this._popupEl && this._popupEl.querySelector('#fab-thread');
      if (!col) return;
      const prefix = this._apiPathPrefix || '';
      col.innerHTML = '';

      if (!this._apiPathPrefix) {
        col.innerHTML = '<div class="empty-hint">Ingress-Pfad wird geladen oder fehlt (Integration / ingress_api_base).</div>';
        return;
      }

      if (this._thread.length === 0) {
        col.innerHTML = '<div class="empty-hint">Neuer Chat – Nachricht eingeben.</div>';
        if (threadEl) threadEl.scrollTop = 0;
        return;
      }

      this._thread.forEach((m) => {
        const div = document.createElement('div');
        div.className = 'msg ' + m.role;
        if (m.pending) {
          div.innerHTML = '<div class="content"><span class="typing-indicator"><span></span><span></span><span></span></span></div>';
        } else {
          let bodyHtml;
          if (m.role === 'assistant') bodyHtml = renderMarkdown(m.content, prefix);
          else bodyHtml = escapeHtml(m.content);
          let html = '<div class="content">' + bodyHtml + '</div>';
          if (m.sources && m.sources.length) {
            html += '<div class="sources">' + m.sources.map((s) => (s.url
              ? '<a target="_blank" rel="noopener" href="' + escapeAttr(s.url) + '" class="badge content-link">' + escapeHtml(s.title || 'Link') + '</a>'
              : '<span class="badge content-link" style="opacity:.7">' + escapeHtml(s.title || '') + '</span>'
            )).join('') + '</div>';
          }
          if (m.actions && m.actions.length) {
            html += '<div class="actions">';
            m.actions.forEach((a, idx) => {
              html += '<button type="button" data-utterance="' + escapeAttr(a.utterance || '') + '">' + escapeHtml(a.label || a.utterance || ('Aktion ' + (idx + 1))) + '</button>';
            });
            html += '</div>';
          }
          div.innerHTML = html;
        }
        col.appendChild(div);
      });
      col.querySelectorAll('img.chat-img').forEach((img) => {
        img.addEventListener('load', function () {
          const w = this.closest('.img-wrapper');
          if (w) w.classList.add('loaded');
        });
        if (img.complete && img.naturalWidth) {
          const w = img.closest('.img-wrapper');
          if (w) w.classList.add('loaded');
        }
      });
      if (threadEl) threadEl.scrollTop = threadEl.scrollHeight;
    }

    _send() {
      const input = this._popupEl && this._popupEl.querySelector('#fab-input');
      const sendBtn = this._popupEl && this._popupEl.querySelector('#fab-send');
      if (!input || !sendBtn || !this._apiPathPrefix) return;
      const text = (input.value || '').trim();
      if (!text) return;
      input.value = '';
      this._thread.push({ role: 'user', content: text, sources: [], actions: [], pending: false });
      this._thread.push({ role: 'assistant', content: '', sources: [], actions: [], pending: true });
      this._renderThread();
      sendBtn.disabled = true;
      this._showError('');
      const self = this;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120000);
      fetch(this._apiUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, session_id: self._sessionId, chat_id: self._chatId }),
        signal: controller.signal,
        ...fetchOpts,
      })
        .then((r) => { clearTimeout(timer); return parseJsonResponse(r); })
        .then((d) => {
          if (d.error) {
            self._showError(d.error);
            self._popPendingAssistant('Fehler: ' + d.error);
          } else {
            self._popPendingAssistant(d.answer || '', d.sources || [], d.actions || []);
            if (d.chat_id && d.chat_id !== self._chatId) self._chatId = d.chat_id;
          }
        })
        .catch((e) => {
          clearTimeout(timer);
          self._showError(e.message || String(e));
          self._popPendingAssistant(
            e.name === 'AbortError' ? 'Zeitüberschreitung.' : 'Anfrage fehlgeschlagen.'
          );
        })
        .finally(() => { sendBtn.disabled = false; });
    }

    _popPendingAssistant(content, sources, actions) {
      for (let i = this._thread.length - 1; i >= 0; i--) {
        if (this._thread[i].role === 'assistant' && this._thread[i].pending) {
          this._thread[i].pending = false;
          this._thread[i].content = content || '';
          this._thread[i].sources = sources || [];
          this._thread[i].actions = actions || [];
          break;
        }
      }
      this._renderThread();
    }

    _runAction(utterance) {
      if (!utterance || !this._apiPathPrefix) return;
      this._thread.push({ role: 'user', content: utterance, sources: [], actions: [], pending: false });
      this._thread.push({ role: 'assistant', content: '', sources: [], actions: [], pending: true });
      this._renderThread();
      const sendBtn = this._popupEl && this._popupEl.querySelector('#fab-send');
      if (sendBtn) sendBtn.disabled = true;
      const self = this;
      fetch(this._apiUrl('/api/execute_action'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utterance: utterance, session_id: self._sessionId, chat_id: self._chatId }),
        ...fetchOpts,
      })
        .then((r) => parseJsonResponse(r))
        .then((d) => {
          if (d.error) {
            self._showError(d.error);
            self._popPendingAssistant('Fehler: ' + d.error);
          } else {
            const ans = d.answer != null ? d.answer : (d.response != null ? d.response : '');
            self._popPendingAssistant(ans, d.sources || [], d.actions || []);
            if (d.chat_id && d.chat_id !== self._chatId) self._chatId = d.chat_id;
          }
        })
        .catch((e) => {
          self._showError(e.message || String(e));
          self._popPendingAssistant('Aktion fehlgeschlagen.');
        })
        .finally(() => { if (sendBtn) sendBtn.disabled = false; });
    }

    _unmountOverlay() {
      if (this._overlayEl && this._overlayEl.parentNode) {
        this._overlayEl.parentNode.removeChild(this._overlayEl);
      }
      this._overlayEl = null;
    }

    _updateOverlay() {
      if (!this._overlayEl) return;
      const z = (this._config && typeof this._config.zIndex === 'number') ? this._config.zIndex : 100000;
      this._overlayEl.style.zIndex = String(z);

      const iconName = (this._config && typeof this._config.icon === 'string' && this._config.icon.trim())
        ? this._config.icon.trim()
        : 'mdi:chat';
      const haIcon = this._overlayEl.querySelector('ha-icon');
      if (haIcon) haIcon.setAttribute('icon', iconName);
    }
  }

  customElements.define('ha-chat-fab', HaChatFabCard);

  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'ha-chat-fab',
    name: 'HA Chat FAB',
    description: 'Floating chat; API via /api/hassio_ingress/… (Expose Add-on Ingress Path).',
  });
})();
