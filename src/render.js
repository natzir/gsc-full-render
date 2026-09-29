// The sandboxed iframe that shows the render, and the Trusted Types policy it needs.
import { UNLOADED_URL } from './unloaded.js';

const POLICY_KEY = '__gscFullRenderPolicy';

// For browsers without Trusted Types, and for tests.
export const PASS_THROUGH = { createHTML: html => html };

// Search Console enforces Trusted Types; the policy is kept on window so toggling the
// bookmarklet off and on reuses it instead of creating a new named policy each time.
export function getPolicy(win = window) {
  if (!win.trustedTypes) return PASS_THROUGH;
  win[POLICY_KEY] ??= win.trustedTypes.createPolicy(`gsc-full-render-${Date.now().toString(36)}`, {
    createHTML: html => html,
  });
  return win[POLICY_KEY];
}

export function createFrame({ html, width, policy }) {
  const frame = document.createElement('iframe');
  // No allow-scripts: nothing in the page can run. No allow-popups: with our
  // <base target="_blank">, link clicks are blocked instead of navigating the render.
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.setAttribute('title', 'Full render');
  // Absolutely positioned: a page wider than the panel must not widen Search Console's panel.
  frame.style.cssText = `position:absolute;top:0;left:0;display:block;border:0;background:#fff;width:${width}px;transform-origin:0 0`;
  const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
  frame.srcdoc = policy.createHTML(html);
  return { frame, loaded };
}

// The iframe keeps the page's viewport width and scrolls internally; its height is the
// visible box height (unscaled), so 100vh elements stay viewport-sized.
// The frame is widened by its own scrollbar so the page still gets its full viewport width
// (412 px on smartphone); page and scrollbar together are scaled to fill box.width.
export function fitFrame(frame, width, box, scrollbar = 0) {
  if (!box.width || !box.height) return null;
  const scale = Math.min(1, box.width / (width + scrollbar));
  frame.style.width = `${width + scrollbar}px`;
  frame.style.transform = `scale(${scale})`;
  frame.style.height = `${Math.floor(box.height / scale)}px`;
  return scale;
}

// This browser's scrollbar width (0 with overlay scrollbars), measured before the render has
// loaded, so the frame gets its final width from the start instead of jumping after load.
export function estimateScrollbar(doc = document) {
  const probe = doc.createElement('div');
  probe.setAttribute('data-gfr-probe', '');
  probe.style.cssText = 'position:absolute;top:-9999px;width:100px;height:100px;overflow:scroll';
  doc.body.append(probe);
  const width = probe.offsetWidth - probe.clientWidth;
  probe.remove();
  return Math.max(0, width);
}

export function measureScrollbar(frame) {
  const win = frame.contentWindow;
  const root = frame.contentDocument?.documentElement;
  if (!win || !root) return 0;
  return Math.max(0, win.innerWidth - root.clientWidth);
}

// Some rendered pages keep a scroll lock (body{overflow:hidden} from an open cookie banner or
// menu, which Googlebot never closes). The render scrolls inside the frame, so a lock would
// leave only the first screen: detect it and override it. Needs the frame to be displayed.
export function unlockScroll(doc) {
  const root = doc.scrollingElement ?? doc.documentElement;
  if (root.scrollHeight <= root.clientHeight + 1) return false;
  const before = root.scrollTop;
  root.scrollTop = before + 1;
  const scrolls = root.scrollTop !== before;
  root.scrollTop = before;
  if (scrolls) return false;
  const style = doc.createElement('style');
  style.id = 'gfr-unlock';
  style.textContent = 'html,body{overflow-y:auto!important;height:auto!important;position:static!important}';
  doc.head.append(style);
  return true;
}

// Resolves once the frame's own document (not the initial about:blank) has been parsed, which is
// usually well before `load`, which waits for every image and stylesheet. Stops if the frame
// is removed.
export function whenDomReady(frame, interval = 50) {
  return new Promise(resolve => {
    const check = () => {
      if (!frame.isConnected) return;
      const doc = frame.contentDocument;
      if (doc && doc.URL === 'about:srcdoc' && doc.readyState !== 'loading') resolve(doc);
      else setTimeout(check, interval);
    };
    check();
  });
}

const familyKey = (family = '') => family.replace(/["']/g, '').trim().toLowerCase();
const FONT_FACE = /@font-face\s*\{([^}]*)\}/gi;
const FONT_FAMILY = /font-family\s*:\s*([^;]+)/i;

// Families of the @font-face rules the full page left out on purpose (see unloaded.js), in the
// page's own <style> blocks: the only stylesheets it rewrites.
function leftOutFamilies(doc) {
  const families = new Set();
  for (const style of doc.querySelectorAll?.('style') ?? []) {
    for (const [, block] of style.textContent.matchAll(FONT_FACE)) {
      const family = FONT_FAMILY.exec(block)?.[1];
      if (family && block.includes(`url("${UNLOADED_URL}")`)) families.add(familyKey(family));
    }
  }
  return families;
}

// The render's origin is search.google.com, so self-hosted fonts served without CORS headers
// fail to load and the text falls back to another font. Fonts left out on purpose don't count.
export function countFailedFonts(doc) {
  if (!doc.fonts) return 0;
  const leftOut = leftOutFamilies(doc);
  return [...doc.fonts].filter(font => font.status === 'error' && !leftOut.has(familyKey(font.family))).length;
}

// Resolves when the page's fonts have settled, or after `timeout` ms at the latest.
export function fontsSettled(doc, timeout = 3000) {
  return Promise.race([doc.fonts?.ready ?? Promise.resolve(), new Promise(resolve => setTimeout(resolve, timeout))]);
}

// A stylesheet that could not be fetched has no sheet; one that came back with an error status
// (a 404) keeps an empty sheet, which only the resource timing's status reveals (0 when a
// cross-origin server does not share it).
export function countFailedStylesheets(doc) {
  const status = new Map();
  for (const entry of doc.defaultView?.performance?.getEntriesByType?.('resource') ?? []) status.set(entry.name, entry.responseStatus);
  // Links without an href (themes a script loads on demand, e.g. github.com's data-href) never load.
  const links = [...doc.querySelectorAll('link[rel~="stylesheet"][href]')].filter(link => link.getAttribute('href').trim());
  return links.filter(link => !link.sheet || status.get(link.href) >= 400).length;
}
