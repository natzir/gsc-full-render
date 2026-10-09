// The service worker's logic. It takes the Chrome APIs as `api`, shaped like `chrome`, so tests
// pass a fake; background.js wires chrome's events to these functions.

// The automatic start: every Search Console page, secondary Google accounts included
// (/u/1/search-console/…), in the page's own world, where Search Console's CodeMirror editor is.
export const AUTO_SCRIPT = {
  id: 'auto',
  js: ['auto.js'],
  matches: ['https://search.google.com/search-console*', 'https://search.google.com/u/*'],
  runAt: 'document_idle',
  world: 'MAIN',
  persistAcrossSessions: true,
};
export const MENU_ID = 'auto-start';
export const MENU_TITLE = 'Turn on automatically in URL Inspection';
export const WELCOME_PAGE = 'welcome.html';

// On by default: a missing value means on.
async function getAutoStart(storage) {
  const { autoStart } = await storage.get('autoStart');
  return autoStart !== false;
}

// Registers the automatic start when the setting is on, removes it when it's off. Chrome rejects
// a second registration with the same id, so one already there is left alone.
async function syncAutoScript(scripting, on) {
  const registered = await scripting.getRegisteredContentScripts({ ids: [AUTO_SCRIPT.id] });
  if (on && !registered.length) await scripting.registerContentScripts([AUTO_SCRIPT]);
  if (!on && registered.length) await scripting.unregisterContentScripts({ ids: [AUTO_SCRIPT.id] });
}

// The checkbox in the icon's right-click menu. A menu can outlive an update, so the old one goes first.
async function createMenu(contextMenus, checked) {
  await contextMenus.removeAll();
  contextMenus.create({ id: MENU_ID, type: 'checkbox', title: MENU_TITLE, contexts: ['action'], checked });
}

// Search Console tabs that were open before (the install, or the box being checked) start now,
// without a reload. A tab that refuses doesn't stop the others; where it already runs, auto.js
// does nothing.
async function startInOpenTabs(api) {
  const tabs = await api.tabs.query({ url: AUTO_SCRIPT.matches });
  await Promise.allSettled(
    tabs.map(tab => api.scripting.executeScript({ target: { tabId: tab.id }, files: AUTO_SCRIPT.js, world: 'MAIN' })),
  );
}

export async function installed(details, api) {
  const firstInstall = details.reason === 'install';
  // First, so nothing failing below keeps it from opening.
  if (firstInstall) await api.tabs.create({ url: WELCOME_PAGE });
  const on = await getAutoStart(api.storage.local);
  await createMenu(api.contextMenus, on);
  await syncAutoScript(api.scripting, on);
  if (firstInstall && on) await startInOpenTabs(api);
}

// Registrations persist across restarts; this keeps them in step with the setting.
export async function startup(api) {
  await syncAutoScript(api.scripting, await getAutoStart(api.storage.local));
}

export async function menuClicked(info, api) {
  if (info.menuItemId !== MENU_ID) return;
  const on = info.checked === true;
  await api.storage.local.set({ autoStart: on });
  await syncAutoScript(api.scripting, on);
  if (on) await startInOpenTabs(api);
}

// The icon does what the bookmark does. Pages Chrome protects (chrome://, the Web Store) refuse
// the script, and there is nothing to say there.
export async function iconClicked(tab, api) {
  if (tab?.id === undefined) return;
  await api.scripting.executeScript({ target: { tabId: tab.id }, files: ['toggle.js'], world: 'MAIN' }).catch(() => {});
}
