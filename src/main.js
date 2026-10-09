// On/off toggle. State lives on window so a second click finds it.
import { getPolicy } from './render.js';
import { watch } from './watch.js';
import { findInspectionPanels, isPanelOpen } from './source.js';
import { mountView } from './view.js';
import { showToast } from './toast.js';
import { TEXT } from './text.js';

const STATE_KEY = '__gscFullRender';
// URL Inspection only (where the tested/crawled page panel lives), also for secondary Google
// accounts: https://search.google.com/u/1/search-console/inspect?…
const URL_INSPECTION = /^https:\/\/search\.google\.com\/(?:u\/\d+\/)?search-console\/inspect(?:[/?#]|$)/;

// text: the bookmarklet's words (TEXT) or the extension icon's (EXTENSION_TEXT).
export function toggle(win = window, text = TEXT) {
  const doc = win.document;

  if (win[STATE_KEY]) {
    win[STATE_KEY].teardown();
    delete win[STATE_KEY];
    showToast(text.off);
    return 'off';
  }

  if (!URL_INSPECTION.test(win.location.href)) {
    showToast(text.notSearchConsole);
    return 'refused';
  }

  const result = start(win, text);
  // On, but with nothing to show yet: say what to open (the view appears as soon as it opens).
  if (result === 'on') showToast(findInspectionPanels(doc).some(isPanelOpen) ? text.on : text.onNoPanel);
  return result;
}

// The extension's automatic start, on every Search Console page: it is a single-page app that
// reaches URL Inspection without a page load, and the watcher only mounts on inspection panels.
// Quiet, since a toast on each Search Console load would be noise; errors still show.
export function autoStart(win = window, text = TEXT) {
  if (win[STATE_KEY]) return 'running';
  return start(win, text);
}

function start(win, text) {
  const doc = win.document;

  let policy;
  try {
    policy = getPolicy(win);
  } catch (error) {
    showToast(text.blocked + error.message);
    return 'blocked';
  }

  const views = new Map(); // Screenshot tab panel → { panel, view }
  const mount = panel => {
    // Views of panels that were removed or closed: their frames would otherwise pile up.
    for (const [shotPanel, mounted] of views) {
      if (!shotPanel.isConnected || !isPanelOpen(mounted.panel)) {
        mounted.view.destroy();
        views.delete(shotPanel);
      }
    }
    views.get(panel.shotPanel)?.view.destroy();
    views.set(panel.shotPanel, { panel, view: mountView(panel, policy) });
  };
  const stopWatching = watch(doc, mount);

  win[STATE_KEY] = {
    teardown() {
      stopWatching();
      // One view failing to tear down must not leave the others (or the state) behind.
      views.forEach(({ view }) => {
        try {
          view.destroy();
        } catch (error) {
          console.error('[GSC Full Render]', error);
        }
      });
      views.clear();
      doc.querySelectorAll('[data-gfr-toast]').forEach(el => el.remove());
    },
  };
  return 'on';
}
