// Links: what each one is (destination, rel, crawlability, what its URL looks like) and how it
// shows on load, plus the overlay that draws them in the render.
import { isHttp } from './urls.js';

export const DESTINATIONS = ['internal', 'external', 'none'];
export const DESTINATION_LABELS = { internal: 'Internal', external: 'External', none: 'No URL' };
export const DESTINATION_COLORS = { internal: '#188038', external: '#1a73e8', none: '#80868b' };
export const REL_TOKENS = ['nofollow', 'ugc', 'sponsored'];
export const CRAWL_ISSUES = {
  'no-href': 'no href',
  'empty-href': 'empty or # href',
  javascript: 'javascript: URL',
  'non-http': 'not an http(s) URL',
  'invalid-url': 'invalid URL',
  'not-a-link': 'not an <a> (onclick/data-href)',
};
const ISSUE_COLOR = '#d93025';

// Elements that can carry data-href/onclick but are never page content (e.g. <link data-href>
// used by script loaders to fetch stylesheets).
const NOT_CONTENT = new Set(['link', 'script', 'style', 'meta', 'template', 'noscript']);
const TIP_MAX = 200;
const TEXT_MAX = 150;

const siteHost = host => host.toLowerCase().replace(/^www\./, '');

// Without a known base URL, a relative href is still a link to the same site: resolve it
// against a placeholder host that stands for "this site".
const THIS_SITE = 'https://this-site.invalid/';

// baseUrl resolves relative hrefs; siteUrl says which site is "internal" (they differ when the
// page's <base href> points elsewhere, e.g. a CDN).
export function describeLink(el, baseUrl, siteUrl = baseUrl) {
  const { url, ...description } = inspectLink(el, baseUrl, siteUrl);
  return description;
}

// describeLink, plus the http(s) URL it links to (a URL, or null).
function inspectLink(el, baseUrl, siteUrl) {
  const base = baseUrl ?? THIS_SITE;
  const isAnchor = el.localName === 'a';
  const raw = el.getAttribute(isAnchor ? 'href' : 'data-href');
  const tokens = isAnchor ? (el.getAttribute('rel') || '').toLowerCase().split(/\s+/) : [];
  const rel = REL_TOKENS.filter(token => tokens.includes(token));
  let url = null;
  let issue = '';
  if (!isAnchor) issue = 'not-a-link';
  else if (raw === null) issue = 'no-href';
  else if (raw.trim() === '' || raw.trim() === '#') issue = 'empty-href';
  if (raw !== null && raw.trim() !== '' && raw.trim() !== '#') {
    try {
      url = new URL(raw.trim(), base);
    } catch {
      issue ||= 'invalid-url';
    }
  }
  if (url && !isHttp(url)) {
    issue ||= url.protocol === 'javascript:' ? 'javascript' : 'non-http';
    url = null;
  }
  const site = siteHost(new URL(siteUrl ?? base).hostname);
  const destination = url ? (siteHost(url.hostname) === site ? 'internal' : 'external') : 'none';
  return { destination, rel, crawlable: !issue, issue, url };
}

// Short description used in the tooltip, e.g. "Internal · nofollow" or "Not crawlable: no href".
function linkLabel({ destination, rel, crawlable, issue }) {
  if (!crawlable) return `Not crawlable: ${CRAWL_ISSUES[issue]}`;
  return [DESTINATION_LABELS[destination], ...rel].join(' · ');
}

function linkTip(el) {
  if (el.localName === 'a') {
    const href = el.getAttribute('href');
    const rel = el.getAttribute('rel');
    return `${href ?? '(no href)'}${rel ? ` · rel="${rel}"` : ''}`;
  }
  const dataHref = el.getAttribute('data-href');
  return dataHref !== null ? `<${el.localName} data-href="${dataHref}">` : `<${el.localName} onclick>`;
}

function linkText(el) {
  const text = el.textContent.replace(/\s+/g, ' ').trim();
  if (text) return text.slice(0, TEXT_MAX);
  const img = el.querySelector('img');
  if (img) return `[img] ${img.getAttribute('alt') || ''}`.trim();
  return el.querySelector('svg') ? '[svg]' : '';
}

// What an SEO checks in a URL, as written in the href and as resolved. Status codes and
// redirects can't be known here: from Search Console the browser
// may not read other sites' responses (CORS).
export const URL_FLAGS = {
  params: 'Parameters',
  fragment: 'Fragment (#)',
  self: 'To this page',
  http: 'HTTP',
  uppercase: 'Uppercase',
  'non-ascii': 'Spaces or non-ASCII',
  long: 'Long (115+ chars)',
  absolute: 'Absolute',
  relative: 'Relative',
  'no-slash': 'Relative without /',
  'protocol-relative': 'Protocol-relative (//)',
  'missing-scheme': 'Domain without https://',
};
// Every link is one or the other: they are filters, not tags worth showing on each row.
export const UNTAGGED_URL_FLAGS = new Set(['absolute', 'relative']);
const LONG_URL = 115; // what Screaming Frog flags as over-long
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
// A relative href that starts like a host ("www.site.com/…", "site.com/…") is read as a path.
const LOOKS_LIKE_HOST = /^(www\.|[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}(\/|$))/i;
const LOOKS_LIKE_FILE = /^[^/]*\.(html?|php|aspx?|jsp|cgi|pdf|jpe?g|png|gif|svg|webp|css|js|xml|txt)(\/|$)/i;

function decoded(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// href: the attribute as written; url: the http(s) URL it links to (a URL); pageUrl: the page's.
function urlFlags(href, url, pageUrl) {
  const written = href.trim();
  const { search, hash, protocol, pathname } = url;
  const flags = new Set();
  if (search) flags.add('params');
  if (hash) flags.add('fragment');
  if (pageUrl && url.href.split('#')[0] === pageUrl.split('#')[0]) flags.add('self');
  if (protocol === 'http:') flags.add('http');
  // %C3%A9 (an encoded é) is not uppercase
  if (/[A-Z]/.test(pathname.replace(/%[0-9a-f]{2}/gi, ''))) flags.add('uppercase');
  if (/[^\x21-\x7e]/.test(decoded(pathname + search))) flags.add('non-ascii');
  if (url.href.length > LONG_URL) flags.add('long');
  if (SCHEME.test(written)) flags.add('absolute');
  else if (written.startsWith('//')) flags.add('protocol-relative');
  else {
    flags.add('relative');
    if (!/^[/?#]/.test(written)) {
      flags.add('no-slash');
      if (LOOKS_LIKE_HOST.test(written) && !LOOKS_LIKE_FILE.test(written)) flags.add('missing-scheme');
    }
  }
  return Object.keys(URL_FLAGS).filter(flag => flags.has(flag));
}

// Marks each link in place (data-gfr-id, -dest, -follow, -crawl, -label, -tip) and returns one
// entry per link for the list and the CSV (the list counts them itself, per filter).
// siteUrl: the page's own URL, for internal vs external; pageUrl: the inspected URL, for links
// "to this page" (a canonical can point elsewhere, e.g. /shoes for /shoes?page=2).
export function markLinks(doc, baseUrl, siteUrl = baseUrl, pageUrl = siteUrl) {
  const links = [];
  for (const el of (doc.body ?? doc).querySelectorAll('a, [onclick], [data-href]')) {
    if (NOT_CONTENT.has(el.localName) || el.closest('noscript')) continue;
    if (el.localName === 'a') {
      // Named anchors (<a name="top"></a>) are not meant as links.
      if (!el.hasAttribute('href') && !el.textContent.trim() && !el.querySelector('img, svg')) continue;
    } else if (el.querySelector('a[href]')) {
      continue; // a click wrapper around a real link: the inner link is what counts
    }
    const { url: target, ...description } = inspectLink(el, baseUrl, siteUrl);
    // Without a base URL, a relative href has no absolute URL to show.
    const url = target && !target.href.startsWith(THIS_SITE) ? target : null;
    const id = links.length;
    const href = el.getAttribute(el.localName === 'a' ? 'href' : 'data-href') ?? '';
    el.setAttribute('data-gfr-id', String(id));
    el.setAttribute('data-gfr-dest', description.destination);
    el.setAttribute('data-gfr-follow', description.rel.length ? 'nofollow' : 'follow');
    el.setAttribute('data-gfr-crawl', description.crawlable ? 'yes' : 'no');
    el.setAttribute('data-gfr-label', linkLabel(description));
    el.setAttribute('data-gfr-tip', linkTip(el).slice(0, TIP_MAX));
    links.push({ id, tag: el.localName, text: linkText(el), href, url: url?.href ?? '', ...description, urlFlags: url ? urlFlags(href, url, pageUrl) : [] });
  }
  return { links };
}

// Smallest box that still counts as visible: screen-reader-only text is clipped to 1×1 px.
const MIN_VISIBLE_PX = 2;

// Any overflow other than visible clips (the shorthand covers engines that only compute it).
const clipsContent = style => [style.overflowX, style.overflowY, style.overflow].some(value => value && value !== 'visible');

// How each link shows when the page loads, without interacting:
// - 'visible'
// - 'carousel': it has a box, but a scrolling container cuts it off sideways
// - 'collapsed': shows only after a click — no box (display:none: tab, accordion, menu), cut
//   off vertically by a block ("see more" with a limited height, or folded to 0), or in a fixed
//   drawer slid off the page
// - 'invisible': keeps its place but can't be seen (visibility:hidden, opacity:0)
// - 'visually_hidden': never shown on screen: screen-reader-only (a box, or a clipping wrapper,
//   under 2×2 px) or moved off the page (a skip link at left:-9999px)
// Only meaningful while the render's iframe is displayed.
export const ON_LOAD_STATES = ['visible', 'carousel', 'collapsed', 'invisible', 'visually_hidden'];

const SCROLLS = /^(auto|scroll)$/;

// measure: { styleOf, boxOf, scrollX, scrollY }, shared by every link in one pass.
function onLoadState(el, { styleOf, boxOf, scrollX, scrollY }) {
  const rects = [...el.getClientRects()];
  if (!rects.length) return 'collapsed';
  // Keeps its place but can't be seen (visibility:hidden, or inside opacity:0): a click, a scroll
  // or an animation reveals it (e.g. a footer that fades in on scroll). Being cut off or folded
  // away still wins: that is a click.
  let invisible = styleOf(el).visibility === 'hidden';
  const sized = rects.filter(r => r.width >= MIN_VISIBLE_PX && r.height >= MIN_VISIBLE_PX);
  if (!sized.length) return 'visually_hidden';
  let left = Math.min(...sized.map(r => r.left));
  let top = Math.min(...sized.map(r => r.top));
  let right = Math.max(...sized.map(r => r.right));
  let bottom = Math.max(...sized.map(r => r.bottom));
  const root = el.ownerDocument;
  let clipped = true; // ancestors clip until a fixed-position element takes the box out of them
  for (let node = el; node && node !== root.body && node !== root.documentElement; node = node.parentElement) {
    const style = styleOf(node);
    if (style.opacity === '0') invisible = true;
    if (clipped && node !== el && clipsContent(style)) {
      const clip = boxOf(node);
      const flat = clip.bottom - clip.top < MIN_VISIBLE_PX;
      if (flat && clip.right - clip.left < MIN_VISIBLE_PX) return 'visually_hidden'; // a 1×1 wrapper
      if (flat) return 'collapsed'; // folded to 0
      // A block that scrolls vertically (an app shell's 100vh main) cuts nothing off: what is
      // below is reached by scrolling, as on any page.
      const scrollsY = SCROLLS.test(style.overflowY);
      const overlapsX = Math.min(right, clip.right) - Math.max(left, clip.left) >= MIN_VISIBLE_PX;
      const overlapsY = scrollsY || Math.min(bottom, clip.bottom) - Math.max(top, clip.top) >= MIN_VISIBLE_PX;
      if (!overlapsX || !overlapsY) return overlapsY ? 'carousel' : 'collapsed';
      left = Math.max(left, clip.left);
      right = Math.min(right, clip.right);
      if (!scrollsY) {
        top = Math.max(top, clip.top);
        bottom = Math.min(bottom, clip.bottom);
      }
    }
    if (style.position === 'fixed') clipped = false;
  }
  // Left of or above the page, where no scrolling reaches: a skip link at left:-9999px, or the
  // menu of a fixed drawer slid out of view, which a click opens.
  if (right + scrollX <= 0 || bottom + scrollY <= 0) return clipped ? 'visually_hidden' : 'collapsed';
  return invisible ? 'invisible' : 'visible';
}

// The id of the link a click in the render landed on, if the list shows it (a filtered-out link
// has no outline and must not reset the filters).
export function shownLinkId(target) {
  const el = target.closest?.('[data-gfr-show]');
  return el ? Number(el.getAttribute('data-gfr-id')) : null;
}

export function linkOnLoad(doc, links) {
  const states = new Map(links.map(({ id }) => [id, 'collapsed']));
  const view = doc.defaultView;
  // Shared ancestors are styled and measured once per pass.
  const cached = (read, cache = new Map()) => node => {
    if (!cache.has(node)) cache.set(node, read(node));
    return cache.get(node);
  };
  const measure = {
    styleOf: cached(node => view.getComputedStyle(node)),
    boxOf: cached(node => node.getBoundingClientRect()),
    scrollX: view.scrollX ?? 0,
    scrollY: view.scrollY ?? 0,
  };
  // One pass over the marked elements instead of one query per link (pages with mega menus).
  for (const el of doc.querySelectorAll('[data-gfr-id]')) {
    const id = Number(el.getAttribute('data-gfr-id'));
    if (states.has(id)) states.set(id, onLoadState(el, measure));
  }
  return states;
}

// Overlay drawn inside the render's document. Only links marked data-gfr-show are outlined, so
// the page shows what the list's filters show. Listeners added from Search Console's page fire
// in the sandboxed iframe even though its own scripts cannot run.
export function overlayCss() {
  const rules = DESTINATIONS.map(
    destination => `[data-gfr-show][data-gfr-dest="${destination}"]{outline:2px solid ${DESTINATION_COLORS[destination]}!important;outline-offset:1px!important}`,
  );
  rules.push('[data-gfr-show][data-gfr-follow="nofollow"]{outline-style:dotted!important}');
  rules.push(`[data-gfr-show][data-gfr-crawl="no"]{outline:2px dashed ${ISSUE_COLOR}!important;outline-offset:1px!important}`);
  rules.push('[data-gfr-flash]{outline:3px solid #fbbc04!important;outline-offset:2px!important;box-shadow:0 0 0 6px rgba(251,188,4,.35)!important}');
  rules.push(
    '#gfr-tip{position:fixed;z-index:2147483647;pointer-events:none;max-width:320px;padding:4px 8px;border-radius:4px;background:#202124;color:#fff;font:12px/1.4 Roboto,Arial,sans-serif;word-break:break-all;box-shadow:0 2px 6px rgba(0,0,0,.3)}',
  );
  return rules.join('\n');
}

// ids: Set of link ids to outline, or null for all of them.
export function highlightLinks(doc, ids) {
  for (const el of doc.querySelectorAll('[data-gfr-id]')) {
    el.toggleAttribute('data-gfr-show', ids === null || ids.has(Number(el.getAttribute('data-gfr-id'))));
  }
}

export function enableLinkOverlay(doc) {
  const style = doc.createElement('style');
  style.id = 'gfr-link-overlay';
  style.textContent = overlayCss();
  const tip = doc.createElement('div');
  tip.id = 'gfr-tip';
  tip.style.display = 'none';
  doc.head.append(style);
  doc.body.append(tip);

  const onOver = event => {
    const link = event.target.closest?.('[data-gfr-show]');
    if (!link) {
      tip.style.display = 'none';
      return;
    }
    tip.textContent = `${link.getAttribute('data-gfr-label')} · ${link.getAttribute('data-gfr-tip')}`;
    const color = link.getAttribute('data-gfr-crawl') === 'no' ? ISSUE_COLOR : DESTINATION_COLORS[link.getAttribute('data-gfr-dest')];
    tip.style.borderLeft = `4px solid ${color}`;
    tip.style.display = 'block';
  };
  const onMove = event => {
    const view = doc.defaultView;
    if (!view || tip.style.display === 'none') return;
    const below = event.clientY + 16;
    const top = below + tip.offsetHeight > view.innerHeight ? event.clientY - tip.offsetHeight - 8 : below;
    const left = Math.min(event.clientX + 12, view.innerWidth - tip.offsetWidth - 4);
    tip.style.top = `${Math.max(4, top)}px`;
    tip.style.left = `${Math.max(4, left)}px`;
  };
  const onLeave = () => {
    tip.style.display = 'none';
  };

  doc.addEventListener('mouseover', onOver);
  doc.addEventListener('mousemove', onMove);
  doc.documentElement.addEventListener('mouseleave', onLeave);
  return () => {
    doc.removeEventListener('mouseover', onOver);
    doc.removeEventListener('mousemove', onMove);
    doc.documentElement.removeEventListener('mouseleave', onLeave);
    style.remove();
    tip.remove();
    doc.querySelectorAll('[data-gfr-show]').forEach(el => el.removeAttribute('data-gfr-show'));
  };
}
