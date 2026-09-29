// Watches Search Console (a single-page app) for inspection panels and asks for a view to be
// mounted whenever an open panel is new, shows a different page, or lost our view.
import { findInspectionPanels, isPanelOpen, unloadedCount } from './source.js';

// Our own elements come and go without changing a panel, so they need no scan. Except the view
// itself being removed: Search Console re-rendered the panel, and it needs mounting again.
const OURS = '[data-gfr-host], [data-gfr-modal], [data-gfr-toast], [data-gfr-probe], [data-gfr-download]';
const TRANSIENT = '[data-gfr-modal], [data-gfr-toast], [data-gfr-probe], [data-gfr-download]';
const is = selector => node => node.nodeType === 1 && node.matches(selector);
const onlyOurs = record => [...record.addedNodes].every(is(OURS)) && [...record.removedNodes].every(is(TRANSIENT));

function panelState({ htmlPanel, shotPanel, infoPanel }) {
  const editor = htmlPanel.querySelector('.CodeMirror')?.CodeMirror ?? null;
  const lines = typeof editor?.lineCount === 'function' ? editor.lineCount() : -1;
  const generation = typeof editor?.changeGeneration === 'function' ? editor.changeGeneration() : -1;
  const hasScreenshot = !!shotPanel.querySelector('img[src^="data:image"]');
  // More info may be filled after the editor, and what couldn't load changes the full page.
  const unloaded = unloadedCount(infoPanel);
  // swapDoc keeps the editor but replaces its document (and resets the generation).
  const cmDoc = typeof editor?.getDoc === 'function' ? editor.getDoc() : null;
  return { editor, cmDoc, key: `${lines}:${generation}:${hasScreenshot}:${unloaded}` };
}

export function watch(doc, onPanel, delay = 50) {
  const seen = new WeakMap(); // Screenshot tab panel → last { editor, key }

  const scan = () => {
    for (const panel of findInspectionPanels(doc)) {
      // Closed panels of earlier inspections stay in the page: rendering them costs a parse of
      // their HTML and a frame that loads every image.
      if (!isPanelOpen(panel)) continue;
      const state = panelState(panel);
      const last = seen.get(panel.shotPanel);
      const mounted = panel.shotPanel.querySelector(':scope > [data-gfr-host]');
      // A panel whose mount failed is not retried until it changes (no retry loop).
      const same = last && last.editor === state.editor && last.cmDoc === state.cmDoc && last.key === state.key;
      if (same && (mounted || last.failed)) continue;
      seen.set(panel.shotPanel, state);
      try {
        onPanel(panel);
      } catch (error) {
        state.failed = true;
        console.error('[GSC Full Render]', error);
      }
    }
  };

  let timer = null;
  const observer = new MutationObserver(records => {
    if (records.every(onlyOurs)) return;
    if (timer === null) {
      timer = setTimeout(() => {
        timer = null;
        scan();
      }, delay);
    }
  });
  observer.observe(doc.body, { childList: true, subtree: true });
  scan();

  return () => {
    observer.disconnect();
    clearTimeout(timer);
    timer = null;
  };
}
