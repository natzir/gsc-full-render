// The full page leaves out what Search Console couldn't load (More info › Page resources) when the
// reason is certain: blocked by robots.txt, or an HTTP error. Each such resource is left unloaded
// wherever the page's HTML refers to it. "Other error" gives no reason and is often a limit of the
// test: it is loaded.
import { resolveUrl as resolve, httpUrl, srcsetUrls, mapCssUrls } from './urls.js';

// Fails to load as an image, a stylesheet or a font, without any request: what Google got.
export const UNLOADED_URL = 'data:,';

// Their outcome is already in the rendered HTML: it is the DOM Googlebot built without them.
const NO_VISUAL_TYPES = /^(script|xhr|fetch|eventsource|websocket)$/i;
// Search Console translates the type, and leaves it empty for some scripts (a web worker): a .js
// URL tells in any language.
const SCRIPT_PATH = /\.m?js$/i;
// Amber, like the "⚠ N not loaded" note: red dashed outlines mean not-crawlable links.
const MARK_CSS = '[data-gfr-unloaded]{outline:2px dashed #b06000!important;outline-offset:-2px}';

const CERTAIN_REASON = /robots\.txt|\b[45]\d\d\b|not found|server error|forbidden|unauthori[sz]ed|access denied/i;

function noVisual({ type, url }) {
  return NO_VISUAL_TYPES.test(type) || SCRIPT_PATH.test(resolve(url, null)?.replace(/[?#].*$/, '') ?? '');
}

// Outlines what was left unloaded, with Search Console's reason as its tooltip. Not the whole
// page when it was the background of body or html.
function mark(el, title) {
  if (el === el.ownerDocument.body || el === el.ownerDocument.documentElement) return;
  el.setAttribute('data-gfr-unloaded', '');
  el.setAttribute('title', title);
}

// resources: [{ reason, type, url }] from readUnloaded. Runs on the HTML as written: its URLs are
// resolved against baseUrl, and against googlebotUrl, the page Googlebot fetched (the canonical
// that baseUrl comes from can differ). Returns one effect per resource: 'shown' (left unloaded
// here too), 'no-visual' (a script or request: already reflected in the HTML), 'not-found' (the
// HTML doesn't refer to it, e.g. an image set by an external stylesheet) or 'loaded' (no certain
// reason: loaded here).
export function leaveUnloaded(doc, resources, baseUrl, googlebotUrl = baseUrl) {
  const effects = resources.map(resource => {
    if (noVisual(resource)) return 'no-visual';
    return CERTAIN_REASON.test(resource.reason) ? 'not-found' : 'loaded';
  });
  const failed = new Map(); // resolved URL → indices (Search Console can list a URL twice)
  resources.forEach((resource, index) => {
    const href = effects[index] === 'not-found' && resolve(resource.url, googlebotUrl);
    if (href) failed.set(href, [...(failed.get(href) ?? []), index]);
  });
  const bases = [...new Set([baseUrl, googlebotUrl])];
  // Marks each failed URL among values; returns the first matching resource, if any.
  const match = values => {
    let found = null;
    for (const value of values) {
      if (!value) continue;
      for (const index of new Set(bases.flatMap(base => failed.get(resolve(value, base)) ?? []))) {
        effects[index] = 'shown';
        found ??= resources[index];
      }
    }
    return found;
  };
  const markFailed = (el, resource) => mark(el, `Search Console couldn't load this: ${resource.reason}`);
  // <noscript> never shows: Googlebot runs scripts.
  const all = selector => [...doc.querySelectorAll(selector)].filter(el => !el.closest('noscript'));
  // Replaces each failed url() in CSS text; returns the new text and the first resource matched.
  const replaceCss = css => {
    let resource = null;
    const text = mapCssUrls(css, value => {
      const found = match([value]);
      resource ??= found;
      return found ? UNLOADED_URL : null;
    });
    return { text, resource };
  };

  if (failed.size) {
    for (const link of all('link[rel~="stylesheet" i][href]')) {
      if (match([link.getAttribute('href')])) link.remove();
    }
    for (const img of all('img, input[type="image" i]')) {
      const sources = img.parentElement?.localName === 'picture' ? [...img.parentElement.querySelectorAll('source')] : [];
      const candidates = [img, ...sources].flatMap(el => [el.getAttribute('src'), ...srcsetUrls(el.getAttribute('srcset') || '')]);
      const resource = match(candidates);
      if (!resource) continue;
      sources.forEach(source => source.remove());
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
      img.setAttribute('src', UNLOADED_URL);
      markFailed(img, resource);
    }
    for (const video of all('video[poster]')) {
      const resource = match([video.getAttribute('poster')]);
      if (!resource) continue;
      video.setAttribute('poster', UNLOADED_URL);
      markFailed(video, resource);
    }
    for (const el of all('[style]')) {
      const { text, resource } = replaceCss(el.getAttribute('style'));
      if (!resource) continue;
      el.setAttribute('style', text);
      markFailed(el, resource);
    }
    for (const style of all('style')) {
      const { text, resource } = replaceCss(style.textContent);
      if (resource) style.textContent = text;
    }
  }
  if (effects.includes('shown')) addMarkStyle(doc);
  return effects;
}

function addMarkStyle(doc) {
  if (doc.querySelector('style[data-gfr-unloaded-style]')) return;
  const style = doc.createElement('style');
  style.setAttribute('data-gfr-unloaded-style', '');
  style.textContent = MARK_CSS;
  doc.head.append(style);
}

// Lazy images whose script never ran in Googlebot's render: the rendered HTML still had a
// placeholder, so Googlebot never requested them and Search Console doesn't list them.
// lazy: what sanitize made load ({ el, src, srcset }). Puts back what Googlebot had and returns
// the URLs of those images.
export function leaveLazyUnrequested(lazy, baseUrl) {
  const changes = new Map(lazy.map(change => [change.el, change]));
  const revert = ({ el, src, srcset }) => {
    if (src === null) el.removeAttribute('src');
    // made absolute like every other URL in the render (see sanitize)
    else if (src !== undefined) el.setAttribute('src', (src.trim() && resolve(src, baseUrl)) || src);
    if (srcset) el.removeAttribute('srcset');
  };
  const urls = [];
  for (const change of lazy) {
    const { el } = change;
    if (el.localName !== 'img' || !('src' in change)) continue;
    urls.push(resolve(el.getAttribute('src'), baseUrl) ?? el.getAttribute('src'));
    revert(change);
    if (el.parentElement?.localName === 'picture') {
      for (const source of el.parentElement.querySelectorAll('source')) if (changes.has(source)) revert(changes.get(source));
    }
    mark(el, "Never loaded: its lazy-load script didn't run, so the page kept a placeholder");
  }
  if (urls.length) addMarkStyle(lazy[0].el.ownerDocument);
  return urls;
}

// Images with loading="lazy" that Googlebot never requested: it doesn't scroll, so one outside its
// viewport, such as off-screen in a carousel, stays unloaded (in the live test the viewport grows to
// the page's full height, not its width). requested: every URL Search Console lists in Page resources, loaded or not (see
// requested.js), or null when the full list couldn't be read. Runs on the HTML as written, like
// leaveUnloaded. Returns the URLs of the images it left out.
export function leaveLazyNotRequested(doc, requested, baseUrl, googlebotUrl = baseUrl) {
  if (!requested) return [];
  const listed = new Set(requested.map(url => resolve(url, googlebotUrl)).filter(Boolean));
  const bases = [...new Set([baseUrl, googlebotUrl])];
  const isListed = value => bases.some(base => listed.has(httpUrl(value, base)));
  // Its http(s) candidates, the img's own first: Googlebot requests one of them.
  const candidates = img => {
    const sources = img.parentElement?.localName === 'picture' ? [...img.parentElement.querySelectorAll('source')] : [];
    return [img, ...sources]
      .flatMap(el => [el.getAttribute('src'), ...srcsetUrls(el.getAttribute('srcset') || '')])
      .filter(value => value && httpUrl(value, baseUrl));
  };
  const images = [...doc.querySelectorAll('img')].filter(img => !img.closest('noscript') && !img.hasAttribute('data-gfr-unloaded'));
  // A list none of the page's images is in can't be told from one misread: leave everything.
  if (!images.some(img => candidates(img).some(isListed))) return [];
  const urls = [];
  for (const img of images) {
    if ((img.getAttribute('loading') || '').trim().toLowerCase() !== 'lazy') continue;
    const values = candidates(img);
    if (!values.length || values.some(isListed)) continue;
    urls.push(httpUrl(values[0], baseUrl));
    if (img.parentElement?.localName === 'picture') img.parentElement.querySelectorAll('source').forEach(source => source.remove());
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    img.setAttribute('src', UNLOADED_URL);
    mark(img, 'Google never requested it: loading="lazy", outside its viewport');
  }
  if (urls.length) addMarkStyle(doc);
  return urls;
}
