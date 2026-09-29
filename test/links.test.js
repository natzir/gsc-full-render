import { describe, it, expect } from 'vitest';
import { describeLink, markLinks, linkOnLoad, enableLinkOverlay, highlightLinks, overlayCss, shownLinkId } from '../src/links.js';

const BASE = 'https://www.shop.example.com/cat/page';
const parse = html => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
const el = html => parse(html).body.firstElementChild;

const describeOf = (html, base = BASE, site = base) => {
  const { rel, ...rest } = describeLink(el(html), base, site);
  return { ...rest, rel: rel.join(' ') };
};

describe('describeLink', () => {
  it.each([
    ['<a href="/p">x</a>', { destination: 'internal', rel: '', crawlable: true, issue: '' }],
    ['<a href="#reviews">x</a>', { destination: 'internal', rel: '', crawlable: true, issue: '' }],
    ['<a href="https://shop.example.com/x">x</a>', { destination: 'internal', rel: '', crawlable: true, issue: '' }],
    ['<a href="//www.shop.example.com/x">x</a>', { destination: 'internal', rel: '', crawlable: true, issue: '' }],
    ['<a href="https://blog.shop.example.com/">x</a>', { destination: 'external', rel: '', crawlable: true, issue: '' }],
    ['<a href="https://other.com/" rel="noopener">x</a>', { destination: 'external', rel: '', crawlable: true, issue: '' }],
    ['<a href="/p" rel="nofollow">x</a>', { destination: 'internal', rel: 'nofollow', crawlable: true, issue: '' }],
    ['<a href="https://other.com/" rel="UGC nofollow">x</a>', { destination: 'external', rel: 'nofollow ugc', crawlable: true, issue: '' }],
    ['<a href="https://ad.example/" rel="sponsored">x</a>', { destination: 'external', rel: 'sponsored', crawlable: true, issue: '' }],
    ['<a>text</a>', { destination: 'none', rel: '', crawlable: false, issue: 'no-href' }],
    ['<a href="">x</a>', { destination: 'none', rel: '', crawlable: false, issue: 'empty-href' }],
    ['<a href=" # ">x</a>', { destination: 'none', rel: '', crawlable: false, issue: 'empty-href' }],
    ['<a href="javascript:void(0)" rel="nofollow">x</a>', { destination: 'none', rel: 'nofollow', crawlable: false, issue: 'javascript' }],
    ['<a href="mailto:a@b.com">x</a>', { destination: 'none', rel: '', crawlable: false, issue: 'non-http' }],
    ['<a href="tel:+34600000000">x</a>', { destination: 'none', rel: '', crawlable: false, issue: 'non-http' }],
    ['<a href="http://[bad">x</a>', { destination: 'none', rel: '', crawlable: false, issue: 'invalid-url' }],
    ['<span data-href="/p">x</span>', { destination: 'internal', rel: '', crawlable: false, issue: 'not-a-link' }],
    ['<div onclick="go()">x</div>', { destination: 'none', rel: '', crawlable: false, issue: 'not-a-link' }],
  ])('%s', (html, expected) => {
    expect(describeOf(html)).toEqual(expected);
  });

  it('judges internal against the site and resolves relative links against <base> (e.g. a CDN)', () => {
    const CDN = 'https://static.cdn.example/';
    const SITE = 'https://shop.example.com/cat/page';
    expect(describeOf('<a href="https://shop.example.com/x">x</a>', CDN, SITE).destination).toBe('internal');
    expect(describeOf('<a href="/p">x</a>', CDN, SITE).destination).toBe('external');
  });

  it('treats relative links as internal when no base URL is known', () => {
    expect(describeOf('<a href="/p">x</a>', null).destination).toBe('internal');
    expect(describeOf('<a href="https://other.com/">x</a>', null).destination).toBe('external');
  });
});

describe('markLinks', () => {
  it('marks each link with its dimensions, each one independent of the others', () => {
    const doc = parse(`
      <a href="/a">a</a>
      <a href="/b" rel="nofollow">b</a>
      <a href="https://other.com/" rel="ugc nofollow">c</a>
      <a href="javascript:x()">d</a>`);
    const { links } = markLinks(doc, BASE);
    expect(links.map(link => [link.destination, link.rel.join(' ') || 'follow', link.crawlable])).toEqual([
      ['internal', 'follow', true],
      ['internal', 'nofollow', true],
      ['external', 'nofollow ugc', true], // tokens in a fixed order
      ['none', 'follow', false],
    ]);
    const b = doc.querySelectorAll('a')[1];
    expect([b.dataset.gfrDest, b.dataset.gfrFollow, b.dataset.gfrCrawl]).toEqual(['internal', 'nofollow', 'yes']);
    expect(b.dataset.gfrLabel).toBe('Internal · nofollow');
    expect(doc.querySelectorAll('a')[3].dataset.gfrLabel).toBe('Not crawlable: javascript: URL');
  });

  it('flags what an SEO checks in each URL, as written and as resolved', () => {
    const doc = parse(`
      <a href="/hotel?id=2#reviews">1</a>
      <a href="https://www.shop.example.com/cat/page#top">2</a>
      <a href="#reviews">3</a>
      <a href="http://www.shop.example.com/a">4</a>
      <a href="/Hotels/Madrid">5</a>
      <a href="/café">6</a>
      <a href="hotel/madrid">7</a>
      <a href="//cdn.example/x">8</a>
      <a href="www.other.com/page">9</a>
      <a href="/${'a'.repeat(120)}">10</a>
      <a href="mailto:a@b.c">11</a>`);
    expect(markLinks(doc, BASE).links.map(link => link.urlFlags)).toEqual([
      ['params', 'fragment', 'relative'],
      ['fragment', 'self', 'absolute'],
      ['fragment', 'self', 'relative'],
      ['http', 'absolute'],
      ['uppercase', 'relative'],
      ['non-ascii', 'relative'], // not uppercase: the %C3%A9 that encodes é doesn't count
      ['relative', 'no-slash'],
      ['protocol-relative'],
      ['relative', 'no-slash', 'missing-scheme'], // the browser reads it as /cat/www.other.com/page
      ['long', 'relative'],
      [],
    ]);
  });

  it('says "to this page" against the inspected page, not its canonical', () => {
    // /shoes?page=2 has the canonical /shoes: a link to /shoes goes to another page
    const doc = parse('<a href="/shoes">a</a><a href="/shoes?page=2#top">b</a>');
    const flags = markLinks(doc, BASE, 'https://www.shop.example.com/shoes', 'https://www.shop.example.com/shoes?page=2').links.map(link => link.urlFlags.includes('self'));
    expect(flags).toEqual([false, true]);
  });

  it('ignores empty named anchors', () => {
    const doc = parse('<a name="top"></a><a id="x"></a><a>Menu</a><a><img src="i.png"></a>');
    expect(markLinks(doc, BASE).links.map(link => link.crawlable)).toEqual([false, false]);
    expect(doc.querySelector('a[name]').hasAttribute('data-gfr-id')).toBe(false);
  });

  it('ignores click wrappers that contain a real link', () => {
    const doc = parse('<div onclick="go()"><a href="/p">p</a></div><div data-href="/q">q</div>');
    expect(markLinks(doc, BASE).links.length).toBe(2);
    expect(doc.querySelector('div').hasAttribute('data-gfr-id')).toBe(false);
  });

  it('ignores elements that are not page content, like <link data-href> in the head', () => {
    const doc = new DOMParser().parseFromString(
      '<head><link rel="stylesheet" data-href="a.css" href="https://cdn.example/a.css"></head>' +
        '<body><a href="/a">a</a><link rel="preload" data-href="b.css"><script data-href="x"></script><template><a href="/t">t</a></template></body>',
      'text/html',
    );
    expect(markLinks(doc, BASE).links.length).toBe(1);
  });

  it('ignores links inside <noscript>, which the render never shows', () => {
    const doc = parse('<noscript><a href="/nojs">No JS</a></noscript><a href="/ok">OK</a>');
    expect(markLinks(doc, BASE).links.length).toBe(1);
  });

  it('lists every counted link with the data the list and the CSV need', () => {
    const doc = parse(`
      <a href="/a" rel="noopener nofollow">  Hotel   Madrid </a>
      <a href="https://other.com/x"><img src="i.png" alt="Logo"></a>
      <div data-href="/q">Card</div>
      <a href="mailto:a@b.com">Mail</a>`);
    const { links } = markLinks(doc, BASE);
    expect(links).toEqual([
      { id: 0, tag: 'a', text: 'Hotel Madrid', href: '/a', url: 'https://www.shop.example.com/a', destination: 'internal', rel: ['nofollow'], crawlable: true, issue: '', urlFlags: ['relative'] },
      { id: 1, tag: 'a', text: '[img] Logo', href: 'https://other.com/x', url: 'https://other.com/x', destination: 'external', rel: [], crawlable: true, issue: '', urlFlags: ['absolute'] },
      { id: 2, tag: 'div', text: 'Card', href: '/q', url: 'https://www.shop.example.com/q', destination: 'internal', rel: [], crawlable: false, issue: 'not-a-link', urlFlags: ['relative'] },
      { id: 3, tag: 'a', text: 'Mail', href: 'mailto:a@b.com', url: '', destination: 'none', rel: [], crawlable: false, issue: 'non-http', urlFlags: [] },
    ]);
    expect(doc.querySelector('div').getAttribute('data-gfr-id')).toBe('2');
  });

  it('truncates long tips to 200 characters', () => {
    const doc = parse(`<a href="/${'x'.repeat(300)}">long</a>`);
    markLinks(doc, BASE);
    expect(doc.querySelector('a').getAttribute('data-gfr-tip')).toHaveLength(200);
  });
});

describe('shownLinkId', () => {
  it('answers a click only on a link the list shows, so a filtered-out link keeps the filters', () => {
    const doc = parse('<a id="on" href="/a" data-gfr-id="3" data-gfr-show><span>x</span></a><a id="off" href="/b" data-gfr-id="4">y</a>');
    expect(shownLinkId(doc.querySelector('#on span'))).toBe(3);
    expect(shownLinkId(doc.getElementById('off'))).toBeNull();
    expect(shownLinkId(doc.body)).toBeNull();
  });
});

describe('linkOnLoad', () => {
  // jsdom has no layout: give elements the boxes a browser would compute.
  const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  const place = (id, rect) => {
    const el = document.getElementById(id);
    el.getClientRects = () => (rect ? [rect] : []);
    el.getBoundingClientRect = () => rect ?? box(0, 0, 0, 0);
  };
  const stateOf = html => {
    document.body.innerHTML = html;
    const { links } = markLinks(document, BASE);
    return () => [...linkOnLoad(document, links).values()];
  };

  it('tells visible links from links with no box (display:none: tab, accordion, menu)', () => {
    const states = stateOf('<a id="a" href="/a">a</a><a id="b" href="/b">b</a>');
    place('a', box(0, 0, 50, 20));
    place('b', null);
    expect(states()).toEqual(['visible', 'collapsed']);
  });

  it('calls a link cut off sideways by a scrolling container a carousel item', () => {
    const states = stateOf('<div id="c" style="overflow-x:auto"><a id="in" href="/1">1</a><a id="out" href="/2">2</a></div>');
    place('c', box(0, 0, 400, 100));
    place('in', box(10, 10, 100, 20));
    place('out', box(420, 10, 100, 20));
    expect(states()).toEqual(['visible', 'carousel']);
  });

  it('calls a link cut off below a "see more" block, or inside a block folded to 0, collapsed', () => {
    const states = stateOf(`
      <div id="more" style="overflow:hidden"><a id="first" href="/1">1</a><a id="below" href="/2">2</a></div>
      <div id="fold" style="overflow:hidden"><a id="folded" href="/3">3</a></div>`);
    place('more', box(0, 0, 400, 100));
    place('first', box(0, 10, 100, 20));
    place('below', box(0, 140, 100, 20));
    place('fold', box(0, 200, 400, 0));
    place('folded', box(0, 200, 100, 20));
    expect(states()).toEqual(['visible', 'collapsed', 'collapsed']);
  });

  it('calls links that keep their place but are opacity:0 or visibility:hidden invisible: a click, a scroll or an animation reveals them', () => {
    // e.g. natzir.com's footer, faded in on scroll: <section style="opacity: 0"> around a fixed footer
    const states = stateOf(`
      <section style="opacity:0"><footer style="position:fixed"><a id="faded" href="/1">1</a></footer></section>
      <a id="hidden" href="/2" style="visibility:hidden">2</a>`);
    place('faded', box(0, 0, 100, 20));
    place('hidden', box(0, 30, 100, 20));
    expect(states()).toEqual(['invisible', 'invisible']);
  });

  it('prefers collapsed when an invisible link is also inside a block folded to 0', () => {
    const states = stateOf('<div id="fold" style="overflow:hidden"><div style="opacity:0"><a id="a" href="/1">1</a></div></div>');
    place('fold', box(0, 0, 400, 0));
    place('a', box(0, 0, 100, 20));
    expect(states()).toEqual(['collapsed']);
  });

  it('keeps visually hidden for screen-reader-only links, which never show', () => {
    const states = stateOf('<a id="sronly" href="/3">3</a>');
    place('sronly', box(0, 60, 1, 1));
    expect(states()).toEqual(['visually_hidden']);
  });

  it('calls a link inside a 1×1 screen-reader-only wrapper visually hidden, not collapsed', () => {
    const states = stateOf('<span id="sr" style="position:absolute;overflow:hidden"><a id="a" href="#main">Skip to content</a></span>');
    place('sr', box(0, 0, 1, 1));
    place('a', box(0, 0, 120, 20));
    expect(states()).toEqual(['visually_hidden']);
  });

  it('calls a link moved off the page visually hidden (a skip link at left:-9999px)', () => {
    const states = stateOf('<a id="skip" href="#main">Skip</a><a id="above" href="/1">1</a>');
    place('skip', box(-9999, 0, 80, 20));
    place('above', box(0, -60, 80, 20));
    expect(states()).toEqual(['visually_hidden', 'visually_hidden']);
  });

  it('calls the links of a drawer slid off the page collapsed: a click opens it', () => {
    const states = stateOf('<nav style="position:fixed"><a id="menu" href="/1">1</a></nav>');
    place('menu', box(-327, 74, 153, 25));
    expect(states()).toEqual(['collapsed']);
  });

  it('keeps the links below the first screen of an app shell visible: its container scrolls', () => {
    const states = stateOf('<main id="shell" style="overflow-y:auto"><a id="top" href="/1">1</a><a id="below" href="/2">2</a></main>');
    place('shell', box(0, 0, 412, 732));
    place('top', box(0, 10, 100, 20));
    place('below', box(0, 2000, 100, 20));
    expect(states()).toEqual(['visible', 'visible']);
  });

  it('does not let a clipping container hide a fixed-position link', () => {
    const states = stateOf('<div id="c" style="overflow:hidden"><a id="fixed" href="/1" style="position:fixed">1</a></div>');
    place('c', box(0, 0, 100, 100));
    place('fixed', box(0, 300, 100, 20));
    expect(states()).toEqual(['visible']);
  });
});

describe('link overlay', () => {
  const setUp = () => {
    document.head.innerHTML = '';
    document.body.innerHTML = '<a id="l" href="/p" rel="nofollow">x</a><a id="m" href="javascript:x()">y</a><p id="p">plain</p>';
    markLinks(document, BASE);
  };

  it('outlines only the links it is told to show, and shows a tooltip on hover', () => {
    setUp();
    const disable = enableLinkOverlay(document);
    highlightLinks(document, new Set([0]));
    expect(document.getElementById('l').hasAttribute('data-gfr-show')).toBe(true);
    expect(document.getElementById('m').hasAttribute('data-gfr-show')).toBe(false);
    highlightLinks(document, null);
    expect(document.getElementById('m').hasAttribute('data-gfr-show')).toBe(true);
    const tip = document.getElementById('gfr-tip');
    document.getElementById('l').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(tip.style.display).toBe('block');
    expect(tip.textContent).toBe('Internal · nofollow · /p · rel="nofollow"');
    document.getElementById('p').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(tip.style.display).toBe('none');
    disable();
    expect(document.getElementById('gfr-link-overlay')).toBeNull();
    expect(document.getElementById('gfr-tip')).toBeNull();
    expect(document.querySelectorAll('[data-gfr-show]')).toHaveLength(0);
  });

  it('colours by destination, dots nofollow and dashes red what Google cannot crawl', () => {
    const css = overlayCss();
    expect(css).toContain('[data-gfr-show][data-gfr-dest="internal"]{outline:2px solid #188038!important');
    expect(css).toContain('[data-gfr-show][data-gfr-follow="nofollow"]{outline-style:dotted!important}');
    expect(css).toContain('[data-gfr-show][data-gfr-crawl="no"]{outline:2px dashed #d93025!important');
    expect(css).toContain('[data-gfr-flash]{');
  });
});
