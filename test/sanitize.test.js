import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sanitize, isJavascriptUrl } from '../src/sanitize.js';

const BASE = 'https://shop.example.com/cat/page';
const hostile = () =>
  new DOMParser().parseFromString(readFileSync(`${import.meta.dirname}/fixtures/hostile.html`, 'utf8'), 'text/html');

describe('isJavascriptUrl', () => {
  it.each([
    ['javascript:alert(1)', true],
    ['JaVaScRiPt:alert(1)', true],
    [' java\tscript:alert(1)', true],
    ['\njavascript:x', true],
    ['https://example.com/javascript:x', false],
    ['/path', false],
  ])('%j → %s', (value, expected) => {
    expect(isJavascriptUrl(value)).toBe(expected);
  });
});

describe('sanitize', () => {
  it('drops preloads of scripts, which Search Console\'s CSP blocks and reports', () => {
    const doc = new DOMParser().parseFromString(
      `<head><link rel="preload" as="script" href="/a.js"><link rel="modulepreload" href="/m.js">
        <link rel="preload" as="image" href="/i.jpg"><link rel="preload" as="style" href="/s.css"></head>`,
      'text/html',
    );
    sanitize(doc, BASE);
    expect([...doc.querySelectorAll('link')].map(link => link.getAttribute('as'))).toEqual(['image', 'style']);
  });

  it('removes every executable construct from the hostile fixture', () => {
    const doc = hostile();
    sanitize(doc, BASE);
    expect(doc.querySelectorAll('script, noscript, object, embed, iframe, frame')).toHaveLength(0);
    expect(doc.querySelectorAll('meta[http-equiv]')).toHaveLength(0);
    for (const el of doc.querySelectorAll('*')) {
      for (const { name, value } of el.attributes) {
        expect(name.toLowerCase().startsWith('on'), `${el.localName}[${name}]`).toBe(false);
        expect(isJavascriptUrl(value), `${el.localName}[${name}]=${value}`).toBe(false);
      }
    }
  });

  it('inserts our base first in head, with target _blank only, replacing the page base', () => {
    const doc = hostile();
    sanitize(doc, BASE);
    const bases = doc.querySelectorAll('base');
    expect(bases).toHaveLength(1);
    expect(doc.head.firstElementChild).toBe(bases[0]);
    // Search Console's CSP (base-uri 'self') would block an href: URLs are made absolute instead.
    expect(bases[0].hasAttribute('href')).toBe(false);
    expect(bases[0].getAttribute('target')).toBe('_blank');
  });

  it('makes relative URLs absolute, since the render cannot use a <base href>', () => {
    const doc = new DOMParser().parseFromString(
      `<head><link rel="stylesheet" href="/css/a.css"><link rel="preload" as="image" imagesrcset="/i/a.webp 1x, i/b.webp 2x">
        <style>@import "print.css"; .h{background:url(../img/h.jpg)} @font-face{src:url('/f/x.woff2')}</style></head>
      <body><a id="a" href="p?x=1">a</a><img id="i" src="/i/c.jpg" srcset="/i/c.jpg 1x, /i/c2.jpg 2x"><video id="v" poster="v.jpg"></video>
        <svg><use id="u" href="/sprite.svg#ico"></use></svg><div id="d" style="background:url(/i/bg.png); color: red"></div>
        <img id="keep" src="data:image/gif;base64,R0l"><a id="mail" href="mailto:x@y.z">m</a><img id="empty" src=""></body>`,
      'text/html',
    );
    sanitize(doc, BASE);
    const attr = (id, name) => doc.getElementById(id).getAttribute(name);
    expect(doc.querySelector('link[rel=stylesheet]').getAttribute('href')).toBe('https://shop.example.com/css/a.css');
    expect(doc.querySelector('link[rel=preload]').getAttribute('imagesrcset')).toBe('https://shop.example.com/i/a.webp 1x, https://shop.example.com/cat/i/b.webp 2x');
    const css = doc.querySelector('style').textContent;
    expect(css).toContain('@import "https://shop.example.com/cat/print.css"');
    expect(css).toContain('url("https://shop.example.com/img/h.jpg")');
    expect(css).toContain('url("https://shop.example.com/f/x.woff2")');
    expect(attr('a', 'href')).toBe('https://shop.example.com/cat/p?x=1');
    expect(attr('i', 'src')).toBe('https://shop.example.com/i/c.jpg');
    expect(attr('i', 'srcset')).toBe('https://shop.example.com/i/c.jpg 1x, https://shop.example.com/i/c2.jpg 2x');
    expect(attr('v', 'poster')).toBe('https://shop.example.com/cat/v.jpg');
    expect(attr('u', 'href')).toBe('https://shop.example.com/sprite.svg#ico');
    expect(attr('d', 'style')).toBe('background:url("https://shop.example.com/i/bg.png"); color: red');
    expect(attr('keep', 'src')).toBe('data:image/gif;base64,R0l');
    expect(attr('mail', 'href')).toBe('mailto:x@y.z');
    expect(attr('empty', 'src')).toBe('');
  });

  it('removes target from links and forms so clicks cannot navigate the render', () => {
    const doc = hostile();
    sanitize(doc, BASE);
    expect(doc.getElementById('tgt').hasAttribute('target')).toBe(false);
  });

  it('replaces iframes with a labelled placeholder that keeps their size', () => {
    const doc = hostile();
    sanitize(doc, BASE);
    const boxes = [...doc.querySelectorAll('div')].map(d => d.textContent);
    expect(boxes).toContain('iframe: https://www.youtube.com/embed/x');
    expect(boxes).toContain('iframe: (inline srcdoc)');
    const sized = [...doc.querySelectorAll('div')].find(d => d.textContent === 'iframe: (inline srcdoc)');
    expect(sized.getAttribute('style')).toContain('width:300px');
    expect(sized.getAttribute('style')).toContain('min-height:150px');
  });

  it('keeps hidden iframes hidden: the placeholder takes the iframe\'s style, class and hidden', () => {
    // e.g. a consent manager's __tcfapiLocator / __uspapiLocator
    const doc = new DOMParser().parseFromString(
      '<iframe name="__tcfapiLocator" style="display: none;"></iframe><iframe class="x" hidden></iframe>',
      'text/html',
    );
    sanitize(doc, BASE);
    const [styled, hidden] = doc.querySelectorAll('body > div');
    expect(styled.getAttribute('style')).toMatch(/;display: none;$/);
    expect(hidden.hasAttribute('hidden')).toBe(true);
    expect(hidden.getAttribute('class')).toBe('x');
  });

  it('forces lazy images to load', () => {
    const doc = hostile();
    sanitize(doc, BASE);
    const lazy1 = doc.getElementById('lazy1');
    expect(lazy1.getAttribute('src')).toBe('https://shop.example.com/img/a.jpg');
    expect(lazy1.getAttribute('srcset')).toBe('https://shop.example.com/img/a.jpg 1x, https://shop.example.com/img/a2.jpg 2x');
    expect(lazy1.getAttribute('loading')).toBe('eager');
    expect(doc.getElementById('lazy2').getAttribute('src')).toBe('https://shop.example.com/img/real.jpg');
  });

  it('reports what it made load, so what Googlebot had can be put back', () => {
    const doc = new DOMParser().parseFromString(
      '<img id="a" src="data:image/gif;base64,R0l" data-src="/a.jpg" data-srcset="/a2.jpg 2x">' +
        '<img id="b" src="/b.jpg" data-srcset="/b2.jpg 2x"><img id="c" data-src="/c.jpg"><img id="d" src="/d.jpg">',
      'text/html',
    );
    const { lazy } = sanitize(doc, BASE);
    const byId = id => doc.getElementById(id);
    expect(lazy).toEqual([
      { el: byId('a'), src: 'data:image/gif;base64,R0l', srcset: true },
      { el: byId('b'), srcset: true },
      { el: byId('c'), src: null, srcset: false },
    ]);
  });

  it('keeps declarative shadow DOM inert so its content cannot come alive in the render', () => {
    const doc = hostile();
    sanitize(doc, BASE);
    expect(doc.querySelectorAll('#dsd template')).toHaveLength(2);
    expect(doc.querySelectorAll('template[shadowrootmode], template[shadowroot]')).toHaveLength(0);
  });

  it('never sends Search Console\'s URL as referrer to the hosts the page loads from', () => {
    const doc = hostile();
    sanitize(doc, BASE);
    const policies = [...doc.querySelectorAll('meta')].filter(m => (m.getAttribute('name') || '').toLowerCase() === 'referrer');
    expect(policies.map(m => m.getAttribute('content'))).toEqual(['no-referrer']);
    expect(doc.head.children[1]).toBe(policies[0]);
    expect(doc.querySelectorAll('[referrerpolicy]')).toHaveLength(0);
  });

  it('still blocks link clicks when no base URL is known', () => {
    const doc = hostile();
    sanitize(doc, null);
    const bases = doc.querySelectorAll('base');
    expect(bases).toHaveLength(1);
    expect(bases[0].hasAttribute('href')).toBe(false);
    expect(bases[0].getAttribute('target')).toBe('_blank');
  });
});
