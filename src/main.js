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

export function toggle(win = window) {
  const doc = win.document;

  if (win[STATE_KEY]) {
    win[STATE_KEY].teardown();
    delete win[STATE_KEY];
    showToast(TEXT.off);
    return 'off';
  }

  if (!URL_INSPECTION.test(win.location.href)) {
    showToast(TEXT.notSearchConsole);
    return 'refused';
  }

  let policy;
  try {
    policy = getPolicy(win);
  } catch (error) {
    showToast(TEXT.blocked + error.message);
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
  // On, but with nothing to show yet: say what to open (the view appears as soon as it opens).
  showToast(findInspectionPanels(doc).some(isPanelOpen) ? TEXT.on : TEXT.onNoPanel);
  return 'on';
}
