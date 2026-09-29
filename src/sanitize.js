// Makes Search Console's rendered HTML safe and static before it goes into our iframe.
// The sandbox already blocks scripts; removing them too is defence in depth.
import { resolveUrl, mapSrcset, mapCssUrls } from './urls.js';

// Script preloads too: no script runs, and Search Console's CSP would block and report them.
const REMOVED = 'script, noscript, object, embed, applet, base, link[rel~="modulepreload" i], link[rel~="preload" i][as="script" i]';
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'xlink:href', 'data', 'poster']);
// Made absolute: the render lives in a srcdoc frame, which inherits Search Console's CSP, and its
// base-uri 'self' blocks a <base href> to the page's site (relative stylesheets would be
// requested from search.google.com).
const ABSOLUTE_ATTRS = new Set(['href', 'src', 'poster', 'action', 'formaction', 'background', 'xlink:href']);
const SRCSET_ATTRS = new Set(['srcset', 'imagesrcset']);
const TARGET_TAGS = new Set(['a', 'area', 'form']);
const LAZY_SRC = ['data-src', 'data-lazy-src', 'data-original'];
const LAZY_SRCSET = ['data-srcset', 'data-lazy-srcset'];

// Browsers ignore control characters and whitespace inside the scheme ("java\tscript:").
export function isJavascriptUrl(value) {
  return /^javascript:/i.test(value.replace(/[\u0000- ]/g, ''));
}

// Returns { lazy }: the lazy images it made load (see forceLazyImages), so what Googlebot had can
// be put back where its lazy-load script never ran.
export function sanitize(doc, baseUrl) {
  doc.querySelectorAll(REMOVED).forEach(el => el.remove());
  doc.querySelectorAll('meta[http-equiv]').forEach(meta => {
    const kind = meta.getAttribute('http-equiv').trim().toLowerCase();
    if (kind === 'refresh' || kind === 'content-security-policy') meta.remove();
  });
  doc.querySelectorAll('meta[name]').forEach(meta => {
    if (meta.getAttribute('name').trim().toLowerCase() === 'referrer') meta.remove();
  });
  doc.querySelectorAll('iframe, frame').forEach(frame => frame.replaceWith(framePlaceholder(doc, frame)));
  // DOMParser leaves declarative shadow DOM inert, but the srcdoc parser would attach it, and
  // none of these rules reach inside a <template>: keep it inert.
  doc.querySelectorAll('template').forEach(template => {
    template.removeAttribute('shadowrootmode');
    template.removeAttribute('shadowroot');
  });
  const lazy = forceLazyImages(doc);
  const absolute = url => (baseUrl && url.trim() ? resolveUrl(url, baseUrl) : null);
  for (const el of doc.querySelectorAll('*')) {
    for (const { name, value } of [...el.attributes]) {
      const lower = name.toLowerCase();
      if (lower.startsWith('on')) el.removeAttribute(name);
      else if (URL_ATTRS.has(lower) && isJavascriptUrl(value)) el.setAttribute(name, '#');
      else if (lower === 'target' && TARGET_TAGS.has(el.localName)) el.removeAttribute(name);
      else if (lower === 'referrerpolicy') el.removeAttribute(name);
      else if (ABSOLUTE_ATTRS.has(lower)) setIfChanged(el, name, value, absolute(value) ?? value);
      else if (SRCSET_ATTRS.has(lower)) setIfChanged(el, name, value, mapSrcset(value, absolute));
      else if (lower === 'style') setIfChanged(el, name, value, mapCssUrls(value, absolute));
    }
  }
  for (const style of doc.querySelectorAll('style')) {
    const css = mapCssUrls(style.textContent, absolute);
    if (css !== style.textContent) style.textContent = css;
  }
  // target=_blank + a sandbox without allow-popups: link clicks are blocked. No href: Search
  // Console's CSP would block it, and every URL is absolute already.
  const base = doc.createElement('base');
  base.setAttribute('target', '_blank');
  doc.head.prepend(base);
  // The render lives on search.google.com: without this, the page's own policy could send the
  // inspection URL as referrer to every host it loads from, and a Search Console referer trips
  // hotlink protection.
  const referrer = doc.createElement('meta');
  referrer.setAttribute('name', 'referrer');
  referrer.setAttribute('content', 'no-referrer');
  base.after(referrer);
  return { lazy };
}

function setIfChanged(el, name, before, after) {
  if (after !== before) el.setAttribute(name, after);
}

function framePlaceholder(doc, frame) {
  const box = doc.createElement('div');
  const src = frame.getAttribute('src') || (frame.hasAttribute('srcdoc') ? '(inline srcdoc)' : '(no src)');
  box.textContent = `iframe: ${src}`;
  const width = frame.getAttribute('width') || '';
  const height = frame.getAttribute('height') || '';
  box.setAttribute(
    'style',
    [
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'box-sizing:border-box',
      'padding:8px',
      'background:#f1f3f4',
      'color:#5f6368',
      'border:1px dashed #9aa0a6',
      'font:12px/1.4 monospace',
      'word-break:break-all',
      'overflow:hidden',
      'max-width:100%',
      `width:${/^\d+$/.test(width) ? `${width}px` : '100%'}`,
      `min-height:${/^\d+$/.test(height) ? `${height}px` : '60px'}`,
      // What hid the iframe (e.g. a consent manager's display:none locator iframes) hides the
      // box too: the iframe's own style comes last, so it wins.
      frame.getAttribute('style') || '',
    ].join(';'),
  );
  for (const name of ['class', 'hidden']) if (frame.hasAttribute(name)) box.setAttribute(name, frame.getAttribute(name));
  return box;
}

// A lazy-loading script that never ran leaves the real URL in data-src: load it, unless it was
// left unloaded (see unloaded.js). Each change is reported as { el, src (the original, null if
// none; absent when src was kept), srcset }.
function forceLazyImages(doc) {
  const promoted = [];
  for (const el of doc.querySelectorAll('img:not([data-gfr-unloaded]), source')) {
    if ((el.getAttribute('loading') || '').toLowerCase() === 'lazy') el.setAttribute('loading', 'eager');
    const change = { el, srcset: false };
    const src = el.getAttribute('src');
    const lazySrc = firstAttr(el, LAZY_SRC);
    if (lazySrc && (!src || src.startsWith('data:'))) {
      change.src = src;
      el.setAttribute('src', lazySrc);
    }
    const lazySrcset = firstAttr(el, LAZY_SRCSET);
    if (lazySrcset && !el.getAttribute('srcset')) {
      change.srcset = true;
      el.setAttribute('srcset', lazySrcset);
    }
    if ('src' in change || change.srcset) promoted.push(change);
  }
  return promoted;
}

function firstAttr(el, names) {
  for (const name of names) {
    const value = el.getAttribute(name);
    if (value) return value;
  }
  return null;
}
