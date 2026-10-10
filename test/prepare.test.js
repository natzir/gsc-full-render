import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { prepareHtml } from '../src/prepare.js';

const fixture = name => readFileSync(`${import.meta.dirname}/fixtures/${name}`, 'utf8');
const parse = html => new DOMParser().parseFromString(html, 'text/html');
// The mobile host, whose canonical is on www: the page's own URL is the canonical.
const INSPECTED = 'https://m.shop.example/city/madrid.html';

// Independent count of crawlable links (not reusing links.js): every <a href> that resolves
// to http(s) and is not empty or "#".
function crawlableAnchors(html, baseUrl) {
  return [...parse(html).querySelectorAll('a[href]')].filter(a => {
    const href = a.getAttribute('href').trim();
    if (href === '' || href === '#') return false;
    try {
      return /^https?:$/.test(new URL(href, baseUrl).protocol);
    } catch {
      return false;
    }
  }).length;
}

describe('prepareHtml', () => {
  it('passes the HTML through the Trusted Types policy before parsing', () => {
    const policy = { createHTML: vi.fn(s => s) };
    prepareHtml('<!DOCTYPE html><p>x</p>', 'https://a.example/', policy);
    expect(policy.createHTML).toHaveBeenCalledWith('<!DOCTYPE html><p>x</p>');
  });

  it('keeps the doctype so the render stays in standards mode', () => {
    expect(prepareHtml('<!DOCTYPE html><p>x</p>', 'https://a.example/').html.startsWith('<!DOCTYPE html><html>')).toBe(true);
  });

  it('keeps quirks mode when the page had no doctype', () => {
    expect(prepareHtml('<p>x</p>', 'https://a.example/').html.startsWith('<html>')).toBe(true);
  });

  it('classifies links against the page base, not the inspected URL', () => {
    const html =
      '<!DOCTYPE html><head><link rel="canonical" href="https://www.shop.example/city/madrid.html"></head>' +
      '<body><a href="/hotel/a.html">a</a><a href="https://other.example/">b</a></body>';
    const out = prepareHtml(html, INSPECTED);
    expect(out.baseUrl).toBe('https://www.shop.example/city/madrid.html');
    expect(out.links.map(link => link.destination)).toEqual(['internal', 'external']);
  });

  it('counts links to the site as internal even when <base> points to a CDN', () => {
    const html =
      '<!DOCTYPE html><head><link rel="canonical" href="https://shop.example.com/cat/page"><base href="https://static.cdn.example/"></head>' +
      '<body><a href="https://shop.example.com/x">x</a></body>';
    const out = prepareHtml(html, null);
    expect(out.documentUrl).toBe('https://shop.example.com/cat/page');
    expect(out.baseUrl).toBe('https://static.cdn.example/');
    expect(out.links[0].destination).toBe('internal');
  });

  it('live test: static, based on the canonical, counts match an independent count', () => {
    const raw = fixture('shop-live.html');
    const out = prepareHtml(raw, INSPECTED);
    const doc = parse(out.html);
    expect(out.baseUrl).toBe('https://www.shop.example/city/madrid.html');
    expect(doc.querySelectorAll('script')).toHaveLength(0);
    expect(doc.head.firstElementChild.localName).toBe('base');
    expect(doc.querySelectorAll('[data-gfr-id]')).toHaveLength(out.links.length);
    expect(out.links.filter(link => link.crawlable)).toHaveLength(crawlableAnchors(raw, out.baseUrl));
  });

  it('natzir.com crawled page: static, based on natzir.com, with internal links', () => {
    const raw = fixture('natzir-crawled.html');
    const out = prepareHtml(raw, 'https://natzir.com/');
    expect(out.baseUrl).toMatch(/^https:\/\/natzir\.com\//);
    expect(parse(out.html).querySelectorAll('script')).toHaveLength(0);
    expect(out.links.some(link => link.destination === 'internal')).toBe(true);
    expect(out.links.filter(link => link.crawlable)).toHaveLength(crawlableAnchors(raw, out.baseUrl));
  });

  it('leaves out of the full page what robots.txt blocked', () => {
    const map = 'https://maps.googleapis.com/maps/api/staticmap?size=375x80&zoom=13';
    const blocked = [
      { reason: 'Googlebot blocked by robots.txt', type: 'XHR', url: 'https://account.shop.example/consents' },
      { reason: 'Googlebot blocked by robots.txt', type: 'Image', url: map },
    ];
    const out = prepareHtml(fixture('shop-live.html'), INSPECTED, undefined, blocked);
    expect(out.unloaded).toEqual([
      { ...blocked[0], effect: 'no-visual' },
      { ...blocked[1], effect: 'shown' },
    ]);
    expect(out.leftOut).toBe(true);
    const tile = parse(out.html).querySelector('[data-testid="map"]');
    expect(tile.getAttribute('style')).toBe('background-image:url("data:,")');
    expect(tile.hasAttribute('data-gfr-unloaded')).toBe(true);
  });

  it('leaves nothing out when what Search Console missed changes nothing', () => {
    const out = prepareHtml('<p>x</p>', 'https://a.example/', undefined, [{ reason: 'Other error', type: 'XHR', url: 'https://a.example/api' }]);
    expect(out.leftOut).toBe(false);
    expect(out.unloaded).toEqual([{ reason: 'Other error', type: 'XHR', url: 'https://a.example/api', effect: 'no-visual' }]);
    expect(prepareHtml('<p>x</p>', 'https://a.example/').unloaded).toEqual([]);
  });

  it('keeps the placeholder of lazy images that never loaded, even when Search Console lists nothing', () => {
    const out = prepareHtml('<!DOCTYPE html><img src="data:image/gif;base64,R0l" data-src="/big.jpg">', 'https://a.example/p');
    expect(out.lazy).toEqual(['https://a.example/big.jpg']);
    expect(out.leftOut).toBe(true);
    expect(parse(out.html).querySelector('img').getAttribute('src')).toBe('data:image/gif;base64,R0l');
    expect(prepareHtml('<p>x</p>', 'https://a.example/').lazy).toEqual([]);
  });

  it('finds what Search Console couldn\'t load where Googlebot fetched the page, when the canonical is elsewhere', () => {
    const html = '<link rel="canonical" href="https://www.shop.example/other/page.html"><img src="img/a.jpg">';
    const missing = [{ reason: 'Not found (404)', type: 'Image', url: 'https://www.shop.example/es/img/a.jpg' }];
    expect(prepareHtml(html, 'https://www.shop.example/es/page.html', undefined, missing).unloaded[0].effect).toBe('shown');
  });

  it('does not let a lazy-load attribute bring back an image it left out, nor count one only in <noscript>', () => {
    const missing = url => [{ reason: 'Not found (404)', type: 'Image', url: `https://a.example/${url}` }];
    const lazy = prepareHtml('<img src="/a.jpg" data-src="/a.jpg">', 'https://a.example/p', undefined, missing('a.jpg'));
    expect(lazy.unloaded[0].effect).toBe('shown');
    expect(parse(lazy.html).querySelector('img').getAttribute('src')).toBe('data:,');
    expect(prepareHtml('<body><p>x</p><noscript><img src="/b.jpg"></noscript></body>', 'https://a.example/p', undefined, missing('b.jpg')).unloaded[0].effect).toBe('not-found');
  });

  it('leaves out the loading="lazy" images Googlebot never requested, when it has the full list of what it requested', () => {
    const html = '<!DOCTYPE html><img src="/logo.png"><img src="/near.jpg" loading="lazy"><img src="/far.jpg" loading="lazy">';
    const out = prepareHtml(html, 'https://a.example/p', undefined, [], ['https://a.example/logo.png', 'https://a.example/near.jpg']);
    expect(out.notRequested).toEqual(['https://a.example/far.jpg']);
    expect(out.leftOut).toBe(true);
    const imgs = [...parse(out.html).querySelectorAll('img')];
    expect(imgs.map(img => [img.getAttribute('src'), img.getAttribute('loading')])).toEqual([
      ['https://a.example/logo.png', null],
      ['https://a.example/near.jpg', 'eager'],
      ['data:,', 'lazy'],
    ]);
  });

  it('loads every loading="lazy" image without that list', () => {
    const out = prepareHtml('<img src="/logo.png"><img src="/far.jpg" loading="lazy">', 'https://a.example/p');
    expect(out.notRequested).toEqual([]);
    expect(out.leftOut).toBe(false);
    expect(parse(out.html).querySelectorAll('img')[1].getAttribute('loading')).toBe('eager');
  });
});
