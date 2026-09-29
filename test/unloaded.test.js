import { describe, it, expect } from 'vitest';
import { leaveUnloaded, leaveLazyUnrequested, UNLOADED_URL } from '../src/unloaded.js';
import { sanitize } from '../src/sanitize.js';

const BASE = 'https://www.shop.example/city/madrid.html';
const parse = html => new DOMParser().parseFromString(html, 'text/html');
const robots = (type, url) => ({ reason: 'Googlebot blocked by robots.txt', type, url });

describe('leaveUnloaded', () => {
  it('leaves a failed image unloaded, marked, with its other candidates gone', () => {
    const doc = parse(`
      <picture><source srcset="/img/map.webp 1x"><img id="map" src="/img/map.png" srcset="/img/map-2x.png 2x" sizes="100vw"></picture>
      <img id="logo" src="/img/logo.png">`);
    const effects = leaveUnloaded(doc, [robots('Image', 'https://www.shop.example/img/map.webp')], BASE);
    expect(effects).toEqual(['shown']);
    const map = doc.getElementById('map');
    expect(map.getAttribute('src')).toBe(UNLOADED_URL);
    expect(map.hasAttribute('srcset') || map.hasAttribute('sizes')).toBe(false);
    expect(doc.querySelector('source')).toBeNull();
    expect(map.hasAttribute('data-gfr-unloaded')).toBe(true);
    expect(map.title).toBe("Search Console couldn't load this: Googlebot blocked by robots.txt");
    expect(doc.getElementById('logo').getAttribute('src')).toBe('/img/logo.png');
  });

  it('matches srcset candidates whose URLs contain commas', () => {
    const doc = parse('<img src="/a.png" srcset="https://res.cloudinary.com/x/c_fill,w_400/a.jpg 1x,https://res.cloudinary.com/x/c_fill,w_800/a.jpg 2x">');
    expect(leaveUnloaded(doc, [robots('Image', 'https://res.cloudinary.com/x/c_fill,w_800/a.jpg')], BASE)).toEqual(['shown']);
    expect(doc.querySelector('img').getAttribute('src')).toBe(UNLOADED_URL);
  });

  it('leaves out a stylesheet that failed with an HTTP error', () => {
    const doc = parse('<link rel="stylesheet" href="/css/main.css"><link rel="stylesheet" href="/css/other.css">');
    expect(leaveUnloaded(doc, [{ reason: 'Not found (404)', type: 'Stylesheet', url: 'https://www.shop.example/css/main.css' }], BASE)).toEqual(['shown']);
    expect([...doc.querySelectorAll('link')].map(link => link.getAttribute('href'))).toEqual(['/css/other.css']);
  });

  it('loads what failed for a reason Search Console does not give ("Other error"): often a limit of the test', () => {
    const doc = parse('<link rel="stylesheet" href="/css/main.css"><img src="/a.jpg">');
    const other = type => ({ reason: 'Other error', type, url: `https://www.shop.example/${type === 'Image' ? 'a.jpg' : 'css/main.css'}` });
    expect(leaveUnloaded(doc, [other('Stylesheet'), other('Image')], BASE)).toEqual(['loaded', 'loaded']);
    expect(doc.querySelector('link')).not.toBeNull();
    expect(doc.querySelector('img').getAttribute('src')).toBe('/a.jpg');
    expect(doc.querySelector('style[data-gfr-unloaded-style]')).toBeNull();
  });

  it('leaves failed URLs in the page\'s own CSS unloaded: style attributes and style elements', () => {
    const doc = parse(`
      <style>.hero{background:url('/img/hero.jpg')} .ok{background:url(/img/ok.jpg)} @font-face{src:url("https://fonts.example/f.woff2")}</style>
      <div id="card" style="background-image: url(/img/card.jpg); color: red"></div>`);
    const effects = leaveUnloaded(
      doc,
      [robots('Image', 'https://www.shop.example/img/hero.jpg'), robots('Image', 'https://www.shop.example/img/card.jpg'), robots('Font', 'https://fonts.example/f.woff2')],
      BASE,
    );
    expect(effects).toEqual(['shown', 'shown', 'shown']);
    const css = doc.querySelector('style').textContent;
    expect(css).toContain(`.hero{background:url("${UNLOADED_URL}")}`);
    expect(css).toContain('.ok{background:url(/img/ok.jpg)}');
    expect(css).toContain(`src:url("${UNLOADED_URL}")`);
    const card = doc.getElementById('card');
    expect(card.getAttribute('style')).toBe(`background-image: url("${UNLOADED_URL}"); color: red`);
    expect(card.hasAttribute('data-gfr-unloaded')).toBe(true);
  });

  it('tells what cannot change the render from what is not in the HTML', () => {
    const doc = parse('<img src="https://account.shop.example/api">');
    const effects = leaveUnloaded(
      doc,
      [robots('XHR', 'https://account.shop.example/api'), robots('Script', 'https://cdn.example/app.js'), robots('Image', 'https://cdn.example/bg-from-css.png')],
      BASE,
    );
    expect(effects).toEqual(['no-visual', 'no-visual', 'not-found']);
    expect(doc.querySelector('img').getAttribute('src')).toBe('https://account.shop.example/api'); // an XHR says nothing about the image
  });

  it('counts a script Search Console gives no type as no visual difference', () => {
    const doc = parse('<p>x</p>');
    expect(leaveUnloaded(doc, [robots('', 'https://shop.example/js/Worker-D.js?v=2'), robots('', 'https://cdn.example/x.png')], BASE)).toEqual(['no-visual', 'not-found']);
  });

  it('counts a script as no visual difference whatever the language: Search Console translates the type', () => {
    const doc = parse('<p>x</p>');
    expect(leaveUnloaded(doc, [robots('Secuencia de comandos', 'https://cdn.example/app.js?v=1'), robots('Skript', 'https://cdn.example/m.mjs')], BASE)).toEqual([
      'no-visual',
      'no-visual',
    ]);
  });

  it('leaves out every use of a URL Search Console lists twice', () => {
    const doc = parse('<img id="a" src="/a.png"><div id="b" style="background:url(/a.png)"></div>');
    const effects = leaveUnloaded(doc, [robots('Image', 'https://www.shop.example/a.png'), robots('Image', 'https://www.shop.example/a.png')], BASE);
    expect(effects).toEqual(['shown', 'shown']);
    expect(doc.getElementById('a').getAttribute('src')).toBe(UNLOADED_URL);
  });

  it('does not outline the whole page when the failed image is the background of body or html', () => {
    const doc = parse('<html style="background:url(/bg.jpg)"><body style="background:url(/bg.jpg)"><p>x</p></body></html>');
    expect(leaveUnloaded(doc, [robots('Image', 'https://www.shop.example/bg.jpg')], BASE)).toEqual(['shown']);
    for (const el of [doc.documentElement, doc.body]) {
      expect(el.getAttribute('style')).toBe(`background:url("${UNLOADED_URL}")`);
      expect(el.hasAttribute('data-gfr-unloaded') || el.hasAttribute('title')).toBe(false);
    }
  });

  it('matches URLs as Googlebot resolved them too: against the page it fetched, which the canonical can differ from', () => {
    const doc = parse('<img src="img/a.jpg">');
    const googlebot = 'https://www.shop.example/es/page.html';
    expect(leaveUnloaded(doc, [robots('Image', 'https://www.shop.example/es/img/a.jpg')], BASE, googlebot)).toEqual(['shown']);
  });

  it('adds the style that outlines what was left unloaded, only when something was', () => {
    const doc = parse('<img src="/a.png">');
    leaveUnloaded(doc, [robots('XHR', 'https://www.shop.example/a.png')], BASE);
    expect(doc.querySelector('style[data-gfr-unloaded-style]')).toBeNull();
    leaveUnloaded(doc, [robots('Image', 'https://www.shop.example/a.png')], BASE);
    expect(doc.querySelector('style[data-gfr-unloaded-style]').textContent).toMatch(/\[data-gfr-unloaded\]\{outline:2px dashed #b06000/);
  });
});

describe('leaveLazyUnrequested', () => {
  it('puts back the placeholder Googlebot had where its lazy-load script never ran, and lists those images', () => {
    const doc = parse(`
      <picture><source data-srcset="/a.webp"><img id="a" src="data:image/gif;base64,R0l" data-src="/a.jpg" data-srcset="/a2.jpg 2x"></picture>
      <img id="b" data-src="/b.jpg">
      <img id="c" src="/c.jpg" data-srcset="/c2.jpg 2x">
      <img id="d" src="/d.png">`);
    const { lazy } = sanitize(doc, BASE);
    leaveUnloaded(doc, [robots('Image', 'https://www.shop.example/d.png')], BASE);
    expect(leaveLazyUnrequested(lazy, BASE)).toEqual(['https://www.shop.example/a.jpg', 'https://www.shop.example/b.jpg']);
    const a = doc.getElementById('a');
    expect(a.getAttribute('src')).toBe('data:image/gif;base64,R0l');
    expect(a.hasAttribute('srcset')).toBe(false);
    expect(doc.querySelector('source').hasAttribute('srcset')).toBe(false);
    expect(a.hasAttribute('data-gfr-unloaded')).toBe(true);
    expect(a.title).toBe("Never loaded: its lazy-load script didn't run, so the page kept a placeholder");
    expect(doc.getElementById('b').hasAttribute('src')).toBe(false);
    // Googlebot did load /c.jpg: only a sharper candidate was added, which changes nothing here.
    expect(doc.getElementById('c').getAttribute('srcset')).toBe('https://www.shop.example/c2.jpg 2x');
    expect(doc.querySelectorAll('style[data-gfr-unloaded-style]')).toHaveLength(1);
  });

  it('changes nothing when every lazy image was loaded', () => {
    const doc = parse('<img src="/c.jpg" data-srcset="/c2.jpg 2x">');
    const { lazy } = sanitize(doc, BASE);
    expect(leaveLazyUnrequested(lazy, BASE)).toEqual([]);
    expect(doc.querySelector('style[data-gfr-unloaded-style]')).toBeNull();
  });
});
