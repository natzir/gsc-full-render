// The service worker's logic. It takes the Chrome APIs as `api`, shaped like `chrome`, so tests
// pass a fake; background.js wires chrome's events to these functions.

// The automatic start: every Search Console page, secondary Google accounts included
// (/u/1/search-console/…) and no other tool on the host, in the page's own world, where Search
// Console's CodeMirror editor is.
export const AUTO_SCRIPT = {
  id: 'auto',
  js: ['auto.js'],
  matches: ['https://search.google.com/search-console*', 'https://search.google.com/u/*/search-console*'],
  runAt: 'document_idle',
  world: 'MAIN',
  persistAcrossSessions: true,
};
export const MENU_ID = 'auto-start';
export const MENU_TITLE = 'Turn on automatically in URL Inspection';
export const WELCOME_PAGE = 'welcome.html';

// Chrome can fire several of these at once: an update applied at browser start fires onInstalled
// and onStartup together, and two quick menu clicks overlap. They run one at a time, so two of
// them never both find the script missing and both register it, and the last click wins.
let queue = Promise.resolve();
function serial(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

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

export function installed(details, api) {
  return serial(async () => {
    const firstInstall = details.reason === 'install';
    // First, so nothing failing below keeps it from opening; and if it can't open (the tab strip
    // is being dragged), the rest still has to happen.
    if (firstInstall) await api.tabs.create({ url: WELCOME_PAGE }).catch(() => {});
    const on = await getAutoStart(api.storage.local);
    await createMenu(api.contextMenus, on);
    await syncAutoScript(api.scripting, on);
    if (firstInstall && on) await startInOpenTabs(api);
  });
}

// Registrations persist across restarts (an update clears them); this keeps them in step with
// the setting.
export function startup(api) {
  return serial(async () => {
    await syncAutoScript(api.scripting, await getAutoStart(api.storage.local));
  });
}

export function menuClicked(info, api) {
  if (info.menuItemId !== MENU_ID) return Promise.resolve();
  const on = info.checked === true;
  return serial(async () => {
    await api.storage.local.set({ autoStart: on });
    await syncAutoScript(api.scripting, on);
    if (on) await startInOpenTabs(api);
  });
}

// The icon does what the bookmark does. Pages Chrome protects (chrome://, the Web Store) refuse
// the script, and there is nothing to say there.
export async function iconClicked(tab, api) {
  if (tab?.id === undefined) return;
  await api.scripting.executeScript({ target: { tabId: tab.id }, files: ['toggle.js'], world: 'MAIN' }).catch(() => {});
}
