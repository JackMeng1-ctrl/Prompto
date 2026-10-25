// Background service worker.
// Enables the Prompto side panel on the sites listed in the options page and
// opens it when the user clicks the "Open Prompto" button injected by
// src/content/autoOpen.js.

const SIDEPANEL_PATH = 'src/sidepanel/index.html';

function safeHost(url) {
  try { return new URL(url || '').hostname; } catch { return ''; }
}

function hostMatches(host, sites = []) {
  return Boolean(host) && sites.some((site) => host === site || host.endsWith('.' + site));
}

function enableIfUserSite(tabId, url) {
  const host = safeHost(url);
  chrome.storage.sync.get(['websites'], (result) => {
    if (!hostMatches(host, result?.websites || [])) return;
    chrome.sidePanel
      .setOptions({ tabId, path: SIDEPANEL_PATH, enabled: true })
      .catch(() => {});
  });
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  const tabId = sender?.tab?.id;
  if (!tabId) return;

  if (msg?.type === 'ENABLE_SIDEPANEL') {
    enableIfUserSite(tabId, sender.tab.url);
  }

  if (msg?.type === 'OPEN_SIDEPANEL_FROM_USER') {
    // sidePanel.open() only works while the user's click still counts as a
    // user gesture, so call it right away instead of inside the async
    // storage callback. The content script only shows the button on sites
    // the user configured, so the host check already happened there.
    chrome.sidePanel.open({ tabId }).catch((e) => {
      console.warn('sidePanel.open failed:', e);
    });
  }
});

// Also watch tab updates so the side panel is enabled for user-added sites.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab?.url) return;
  enableIfUserSite(tabId, tab.url);
});
