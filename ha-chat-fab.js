/* HA Chat FAB (HACS Frontend resource)
 * Lovelace Custom Card: FAB + Popup mit eingebetteter Chat-App (iframe).
 *
 * Warum iframe: HA leitet fetch() von der Dashboard-Seite zu
 * /hassio/ingress/<slug>/api/* nicht zuverlässig an das Add-on durch
 * (HTML-Shell, POST → 405). Die App im iframe nutzt dieselben URLs wie
 * beim normalen Öffnen – Auth und API funktionieren dort.
 *
 * Card type: custom:ha-chat-fab
 * Config:
 *   href: "/app/2954ddb4_ha_chat" oder "/hassio/ingress/ha_chat"
 *   icon: "mdi:chat"
 *   zIndex: 100000
 */

(() => {
  const OVERLAY_CLASS = 'ha-chat-fab-overlay';
  const STYLE_ID = 'ha-chat-fab-styles';
  const POPUP_CLASS = 'ha-chat-fab-popup';

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
      }
      .${POPUP_CLASS}[data-open="true"]{display:flex;}
      .${POPUP_CLASS} .head{
        height:56px;
        flex-shrink:0;
        display:flex;
        align-items:center;
        justify-content:space-between;
        padding:0 10px 0 12px;
        border-bottom:1px solid var(--divider-color, rgba(255,255,255,0.12));
        background:var(--sidebar-menu-button-background-color, rgba(0,0,0,0.08));
      }
      .${POPUP_CLASS} .title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .${POPUP_CLASS} .head .btn{
        width:40px;height:40px;border:none;border-radius:9999px;background:transparent;
        color:var(--secondary-text-color, #9b9b9b);cursor:pointer;display:flex;align-items:center;justify-content:center;
      }
      .${POPUP_CLASS} .head .btn:hover{background:rgba(255,255,255,0.08);color:var(--primary-text-color,#fff);}
      .${POPUP_CLASS} .body{flex:1;min-height:0;display:flex;flex-direction:column;}
      .${POPUP_CLASS} iframe{
        flex:1;
        width:100%;
        min-height:0;
        border:0;
        background:var(--primary-background-color, #1c1c1c);
      }
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
      this._iframeLoaded = false;
      this._instanceId = 'fab-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      this.shadowRoot.innerHTML = `<style>:host{display:block;width:0;height:0;overflow:hidden;}</style>`;
    }

    static getStubConfig() {
      return {
        href: '/app/2954ddb4_ha_chat',
        icon: 'mdi:chat',
      };
    }

    getCardSize() {
      return 0;
    }

    _panelUrl() {
      const h = (this._config && typeof this._config.href === 'string' && this._config.href.trim())
        ? this._config.href.trim().replace(/\/$/, '')
        : '';
      return h || '/app/2954ddb4_ha_chat';
    }

    setConfig(config) {
      this._config = config || {};
      this._iframeLoaded = false;
      if (this._popupEl) {
        const iframe = this._popupEl.querySelector('iframe');
        if (iframe) iframe.removeAttribute('src');
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
      this._unmountOverlay();
      this._unmountPopup();
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
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"></path></svg>
          </button>
        </div>
        <div class="body">
          <iframe title="HA Chat" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
        </div>
      `;

      pop.querySelector('.btn').addEventListener('click', () => this._setOpen(false));

      root.appendChild(pop);
      this._popupEl = pop;
    }

    _unmountPopup() {
      if (this._popupEl && this._popupEl.parentNode) this._popupEl.parentNode.removeChild(this._popupEl);
      this._popupEl = null;
      this._iframeLoaded = false;
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
        const iframe = this._popupEl.querySelector('iframe');
        if (iframe && !this._iframeLoaded) {
          iframe.src = this._panelUrl();
          this._iframeLoaded = true;
        }
      }
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
    description: 'Floating chat button; opens embedded HA Chat app (iframe).',
  });
})();
