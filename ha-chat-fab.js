/* HA Chat FAB (HACS Frontend resource)
 * Lovelace Custom Card: place it in a dashboard/view to enable the FAB there.
 *
 * Card type: custom:ha-chat-fab
 * Config:
 *   href: "/hassio/ingress/ha_chat"   (default)
 *   icon: "mdi:chat"                 (default)
 *   zIndex: 9999                     (default)
 */

(() => {
  const CARD_TYPE = 'ha-chat-fab';
  const OVERLAY_CLASS = 'ha-chat-fab-overlay';
  const STYLE_ID = 'ha-chat-fab-styles';

  function ensureStyles() {
    const root = document.head || document.documentElement;
    if (!root || root.getElementById(STYLE_ID)) return;
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
    `;
    root.appendChild(style);
  }

  function navigate(href) {
    try {
      window.history.pushState(null, '', href);
      window.dispatchEvent(new Event('location-changed'));
    } catch (_) {
      window.location.href = href;
    }
  }

  class HaChatFabCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = {};
      this._overlayEl = null;
      this._instanceId = 'fab-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      this.shadowRoot.innerHTML = `<style>:host{display:none}</style>`;
    }

    static getStubConfig() {
      return { href: '/hassio/ingress/ha_chat', icon: 'mdi:chat' };
    }

    setConfig(config) {
      this._config = config || {};
      this._updateOverlay();
    }

    connectedCallback() {
      ensureStyles();
      this._mountOverlay();
      this._updateOverlay();
    }

    disconnectedCallback() {
      this._unmountOverlay();
    }

    _mountOverlay() {
      if (this._overlayEl) return;
      const host = document.createElement('div');
      host.className = OVERLAY_CLASS;
      host.setAttribute('data-instance', this._instanceId);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'HA Chat öffnen');
      btn.title = 'HA Chat';

      const icon = document.createElement('ha-icon');
      btn.appendChild(icon);

      btn.addEventListener('click', () => {
        const href = (this._config && typeof this._config.href === 'string' && this._config.href.trim())
          ? this._config.href.trim()
          : '/hassio/ingress/ha_chat';
        navigate(href);
      });

      host.appendChild(btn);
      document.body.appendChild(host);
      this._overlayEl = host;
    }

    _unmountOverlay() {
      if (this._overlayEl && this._overlayEl.parentNode) {
        this._overlayEl.parentNode.removeChild(this._overlayEl);
      }
      this._overlayEl = null;
    }

    _updateOverlay() {
      if (!this._overlayEl) return;
      const z = (this._config && typeof this._config.zIndex === 'number') ? this._config.zIndex : 9999;
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
    description: 'Floating HA Chat button (bottom right) for this dashboard/view.',
  });
})();

