
(function () {
  if (window.__prompto_injected__) return;
  window.__prompto_injected__ = true;

  function safeHost(u) {
    try { return new URL(u || window.location.href).hostname; } catch { return ''; }
  }

  chrome.storage.sync.get(['websites'], (result) => {
    const userSites = result.websites || [];
    const urlHost = safeHost();
    const matchesUser = userSites.some((site) => urlHost === site || urlHost.endsWith('.' + site));
    if (!matchesUser) return;

    try {
      chrome.runtime.sendMessage({ type: 'ENABLE_SIDEPANEL' });
    } catch {}

    // Create a floating button
    const btn = document.createElement('button');
    btn.textContent = 'Open Prompto';
    btn.style.cssText = `
      position: fixed; z-index: 2147483647; right: 16px; bottom: 16px;
      padding: 10px 14px; border-radius: 8px; border: none; cursor: pointer;
      font: 500 13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: #4f46e5; color: white; box-shadow: 0 6px 18px rgba(0,0,0,.18);
    `;
    btn.title = 'Open Prompto side panel';

    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL_FROM_USER' });
    });

    document.documentElement.appendChild(btn);
  });
})();
