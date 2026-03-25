/* HA Chat FAB (HACS Frontend resource)
 * Injects a floating chat button on Lovelace dashboards (bottom right).
 *
 * Default target: /hassio/ingress/ha_chat
 * Optional override:
 *   window.haChatFabConfig = { href: "/hassio/ingress/ha_chat", icon: "mdi:chat", bottom: 20, right: 20 }
 */
(function () {
  var CFG_KEY = 'haChatFabConfig';
  var EL_ID = 'ha-chat-fab';

  function cfg() {
    var c = (window && window[CFG_KEY]) || {};
    return {
      href: typeof c.href === 'string' && c.href.trim() ? c.href.trim() : '/hassio/ingress/ha_chat',
      icon: typeof c.icon === 'string' && c.icon.trim() ? c.icon.trim() : 'mdi:chat',
      bottom: typeof c.bottom === 'number' ? c.bottom : 20,
      right: typeof c.right === 'number' ? c.right : 20,
      zIndex: typeof c.zIndex === 'number' ? c.zIndex : 9999,
    };
  }

  function isDashboardPath() {
    var p = window.location && window.location.pathname ? window.location.pathname : '';
    // heuristics: lovelace dashboards typically live at /lovelace... or /dashboard-...
    return p.startsWith('/lovelace') || p.startsWith('/dashboard');
  }

  function ensureStyles(root) {
    if (!root || root.getElementById(EL_ID + '-styles')) return;
    var style = document.createElement('style');
    style.id = EL_ID + '-styles';
    style.textContent = [
      '#' + EL_ID + '{position:fixed;display:flex;align-items:center;justify-content:center;}',
      '#' + EL_ID + ' button{',
      '  width:56px;height:56px;border-radius:9999px;border:none;cursor:pointer;',
      '  background:var(--ha-color-fill-primary-loud-resting, var(--primary-color, #03a9f4));',
      '  color:var(--ha-color-on-primary-loud, #fff);',
      '  box-shadow:var(--ha-box-shadow-m, 0 4px 12px rgba(0,0,0,.35));',
      '  display:flex;align-items:center;justify-content:center;',
      '  -webkit-tap-highlight-color:transparent;',
      '}',
      '#' + EL_ID + ' button:hover{filter:brightness(0.95)}',
      '#' + EL_ID + ' ha-icon{color:inherit}',
    ].join('\n');
    root.appendChild(style);
  }

  function getHomeAssistantRoot() {
    return document.querySelector('home-assistant') || document.body;
  }

  function createFab() {
    var host = document.createElement('div');
    host.id = EL_ID;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'HA Chat öffnen');
    btn.title = 'HA Chat';

    var icon = document.createElement('ha-icon');
    icon.setAttribute('icon', cfg().icon);
    btn.appendChild(icon);

    btn.addEventListener('click', function () {
      var target = cfg().href;
      try {
        window.history.pushState(null, '', target);
        window.dispatchEvent(new Event('location-changed'));
      } catch (_) {
        window.location.href = target;
      }
    });

    host.appendChild(btn);
    return host;
  }

  function mount() {
    var c = cfg();
    var root = getHomeAssistantRoot();
    if (!root) return;

    ensureStyles(document.head || document.documentElement);

    var existing = document.getElementById(EL_ID);
    if (!existing) {
      existing = createFab();
      document.body.appendChild(existing);
    }

    existing.style.bottom = c.bottom + 'px';
    existing.style.right = c.right + 'px';
    existing.style.zIndex = String(c.zIndex);
    existing.style.display = isDashboardPath() ? 'flex' : 'none';
  }

  // Mount on load and on navigation changes.
  mount();
  window.addEventListener('location-changed', mount);
  window.addEventListener('popstate', mount);
  window.addEventListener('hashchange', mount);
})();

