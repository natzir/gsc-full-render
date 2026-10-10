// Mounts the full page into one inspection panel: source → prepare → render → UI. It leaves out
// what Search Console couldn't load for a certain reason (see unloaded.js).
import { readPanel } from './source.js';
import { readRequested } from './requested.js';
import { prepareHtml } from './prepare.js';
import {
  createFrame,
  fitFrame,
  measureScrollbar,
  estimateScrollbar,
  countFailedStylesheets,
  countFailedFonts,
  fontsSettled,
  unlockScroll,
  whenDomReady,
} from './render.js';
import { enableLinkOverlay, highlightLinks, linkOnLoad, shownLinkId } from './links.js';
import { linksToCsv, csvFilename, downloadCsv } from './csv.js';
import { mountPanelUi } from './panel.js';
import { openModal } from './modal.js';
import { FLASH_MS } from './dom.js';
import { TEXT } from './text.js';

// Search Console can show the panel before its HTML: a new view is mounted when the HTML arrives
// (watch.js), so its absence only counts as an error after this long.
const HTML_WAIT_MS = 20_000;

// An image (or iframe) the browser loads only near the viewport: loading="lazy".
const NATIVE_LAZY = /\bloading\s*=\s*["']?\s*lazy\b/i;

// Wait until "Loading full render…" has been painted: parsing a large page blocks the thread.
const nextPaint = () =>
  new Promise(resolve => {
    const onFrame = window.requestAnimationFrame ?? (callback => setTimeout(callback, 16));
    onFrame(() => setTimeout(resolve, 0));
  });

// A frame's layout only exists while it is displayed (not inside a hidden tab or mode).
const isDisplayed = entry => entry?.ready && entry.frame.getClientRects().length > 0;

// This browser's scrollbar width, measured once: until a render has loaded, it is assumed, so
// the render doesn't reflow when its own scrollbar appears.
let scrollbar = null;
const scrollbarGuess = () => (scrollbar ??= estimateScrollbar());

// Highlights a link in the render for a moment; clicking again restarts it.
const flashTimers = new WeakMap();
function flash(el) {
  clearTimeout(flashTimers.get(el));
  el.setAttribute('data-gfr-flash', '');
  flashTimers.set(el, setTimeout(() => el.removeAttribute('data-gfr-flash'), FLASH_MS));
}

export function mountView(panel, policy) {
  const source = readPanel(panel, document);
  let panelEntry = null;
  let prepared = null;
  let modal = null;
  let resizeObserver = null;
  let destroyed = false;

  const fail = error => {
    // Never leave "Loading full render…" on screen with Google's screenshot hidden.
    console.error('[GSC Full Render]', error);
    if (!destroyed) ui.showError(TEXT.failed + error.message);
  };

  const addFrame = (container, measure, html, { onDomReady, onReady, onUnlock } = {}) => {
    const { frame, loaded } = createFrame({ html, width: source.width, policy });
    const entry = {
      frame,
      loaded,
      domReady: false,
      ready: false,
      unlockChecked: false,
      disableOverlay: null,
      fit: () => {
        fitFrame(frame, source.width, measure(), entry.ready ? measureScrollbar(frame) : scrollbarGuess());
        // A scroll lock can only be detected once the frame is displayed and laid out.
        if (entry.ready && !entry.unlockChecked && isDisplayed(entry)) {
          entry.unlockChecked = true;
          if (unlockScroll(frame.contentDocument)) {
            entry.fit(); // the page's scrollbar appears now
            onUnlock?.();
          }
        }
      },
    };
    container.append(frame);
    entry.fit();
    // The page's DOM exists long before every image has loaded: links can be outlined by then.
    if (onDomReady) {
      whenDomReady(frame)
        .then(() => {
          entry.domReady = true;
          onDomReady(entry);
        })
        .catch(fail);
    }
    loaded
      .then(() => {
        entry.ready = true;
        entry.fit(); // now that the page's scrollbar exists, give the page its full width back
        onReady?.(entry);
      })
      .catch(fail);
    return entry;
  };

  // shown: Set of link ids to outline (what the list's filters show), or null for all.
  const setLinks = (entry, on, shown = null) => {
    if (!entry?.domReady) return;
    if (on && !entry.disableOverlay) entry.disableOverlay = enableLinkOverlay(entry.frame.contentDocument);
    if (on) highlightLinks(entry.frame.contentDocument, shown);
    if (!on && entry.disableOverlay) {
      entry.disableOverlay();
      entry.disableOverlay = null;
    }
  };

  // How links showed as the page loaded (measured once: jumping to rows scrolls carousels).
  const downloadLinks = entry => {
    downloadCsv(linksToCsv(prepared.links, entry?.onLoad ?? new Map()), csvFilename(prepared.documentUrl ?? prepared.baseUrl));
  };

  // Opens the full page larger, at real size.
  const openLarger = () => {
    if (!prepared || modal) return;
    let entry = null;
    let linksOn = false;
    let shown = null;
    const current = openModal({
      title: TEXT.modalTitle,
      width: source.width + scrollbarGuess(),
      links: prepared.links,
      onClose: () => {
        resize?.disconnect();
        modal = null;
      },
      onCsv: () => downloadLinks(entry),
      onLinksChange: on => {
        linksOn = on;
        setLinks(entry, on, shown);
      },
      onFilterChange: ids => {
        shown = ids;
        setLinks(entry, linksOn, shown);
      },
      onRowClick: id => {
        const el = entry?.domReady && entry.frame.contentDocument.querySelector(`[data-gfr-id="${id}"]`);
        if (!el || !el.getClientRects().length) return;
        el.scrollIntoView({ block: 'center' });
        flash(el);
      },
    });
    modal = current;
    const render = current.render;
    // Refit when the dialog changes size (window resized, list shown or hidden).
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => entry?.fit()) : null;
    resize?.observe(render);
    entry = addFrame(render, () => ({ width: render.clientWidth, height: render.clientHeight }), prepared.html, {
      onDomReady: parsed => {
        const doc = parsed.frame.contentDocument;
        setLinks(parsed, linksOn, shown);
        // Esc pressed while focus is inside the render never reaches Search Console's document.
        doc.addEventListener('keydown', event => {
          if (event.key === 'Escape') current.close();
        });
        // With links shown, clicking a link in the page brings its row into view in the list.
        doc.addEventListener('click', event => {
          if (!linksOn) return;
          const id = shownLinkId(event.target);
          if (id === null) return;
          event.preventDefault();
          current.showRow(id);
          flash(doc.querySelector(`[data-gfr-id="${id}"]`));
        });
      },
      onReady: ready => {
        // How links show on load, measured first, while the layout is still clean.
        ready.onLoad = linkOnLoad(ready.frame.contentDocument, prepared.links);
        current.markOnLoad(ready.onLoad);
        // Real size: the page's viewport plus its actual scrollbar (0 with overlay scrollbars,
        // 17 px on Windows), instead of a fixed allowance that could scale it by 0.99.
        current.setRenderWidth(source.width + measureScrollbar(ready.frame));
        ready.fit();
      },
    });
  };

  // The full page in the Screenshot tab, with what the note says about it once loaded.
  const mountPanelFrame = () => {
    const { viewport } = ui;
    const report = { failedStylesheets: 0, failedFonts: 0, unlocked: false };
    let reported = false;
    const entry = addFrame(viewport, () => ({ width: viewport.clientWidth, height: viewport.clientHeight }), prepared.html, {
      onUnlock: () => {
        report.unlocked = true;
        if (reported) ui.showLoaded(report);
      },
    });
    (async () => {
      await entry.loaded;
      if (destroyed) return;
      const frameDoc = entry.frame.contentDocument;
      report.failedStylesheets = countFailedStylesheets(frameDoc);
      reported = true;
      ui.showLoaded(report);
      await fontsSettled(frameDoc);
      if (destroyed) return;
      report.failedFonts = countFailedFonts(frameDoc);
      if (report.failedFonts) ui.showLoaded(report);
    })().catch(fail);
    return entry;
  };

  const ui = mountPanelUi(panel.shotPanel, {
    live: source.kind === 'live',
    onOpen: openLarger,
  });

  if (!source.editorFound) {
    ui.showLoading(TEXT.waiting);
    const timer = setTimeout(() => ui.showError(), HTML_WAIT_MS);
    return {
      destroy() {
        clearTimeout(timer);
        ui.destroy();
      },
    };
  }
  if (!source.html) {
    ui.showEmpty();
    return { destroy: () => ui.destroy() };
  }

  ui.showLoading();
  (async () => {
    await nextPaint();
    if (destroyed) return;
    const { count, resources } = source.unloaded;
    // What Googlebot requested tells which loading="lazy" images it never loaded: read only when
    // there are some, since it switches Search Console's filter.
    const requested = NATIVE_LAZY.test(source.html) ? await readRequested(panel.infoPanel) : null;
    if (destroyed) return;
    prepared = prepareHtml(source.html, source.inspectedUrl, policy, resources ?? [], requested);
    source.html = null; // up to a few MB, and the prepared copy is all that's needed from now on
    ui.showPrepared({
      leftOut: prepared.leftOut,
      unloaded: { count, resources: resources && prepared.unloaded },
      lazy: prepared.lazy,
      notRequested: prepared.notRequested,
    });
    panelEntry = mountPanelFrame();
    // The Screenshot tab is often hidden (0×0) when the panel opens; fit when it appears.
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(() => panelEntry.fit());
      resizeObserver.observe(ui.viewport);
    }
  })().catch(fail);

  return {
    destroy() {
      destroyed = true;
      resizeObserver?.disconnect();
      modal?.close();
      ui.destroy();
    },
  };
}
