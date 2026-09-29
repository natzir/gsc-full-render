import { describe, it, expect } from 'vitest';
import { findInspectionPanels, findInspectedUrl, readPanel, readUnloaded, pickUrls, isPanelOpen } from '../src/source.js';

const pickBaseUrl = (doc, inspectedUrl) => pickUrls(doc, inspectedUrl).baseUrl;
import { buildScPage, moreInfo } from './helpers/sc-page.js';

const INSPECTED = 'https://www.shop.example/city/madrid.html';
const parse = html => new DOMParser().parseFromString(html, 'text/html');

describe('findInspectionPanels', () => {
  it('finds the HTML, Screenshot and More info tab panels of an inspection panel', () => {
    const { htmlPanel, shotPanel, infoPanel } = buildScPage();
    const [panel, ...rest] = findInspectionPanels(document);
    expect(rest).toHaveLength(0);
    expect(panel.htmlPanel).toBe(htmlPanel);
    expect(panel.shotPanel).toBe(shotPanel);
    expect(panel.infoPanel).toBe(infoPanel);
    expect(panel.tabs).toHaveLength(3);
  });

  it('still finds the panel when the editor is missing but the screenshot is there', () => {
    buildScPage({ editor: false });
    expect(findInspectionPanels(document)).toHaveLength(1);
  });

  it('pairs each tab bar with its own panels when Search Console reuses their ids for a new inspection', () => {
    // A crawled page opened after a live test can get tab panels with the same ids as the live
    // test's, which stay in the page, hidden, and come first.
    const view = (name, shot) => `
      <div class="${name}">
        <div role="tablist"><div role="tab" aria-controls="h">h</div><div role="tab" aria-controls="s">s</div><div role="tab" aria-controls="i">i</div></div>
        <div role="tabpanel" id="h"><div class="CodeMirror"></div></div>
        <div role="tabpanel" id="s">${shot}</div>
        <div role="tabpanel" id="i">${name}</div>
      </div>`;
    document.body.innerHTML = view('old', '<img src="data:image/png;base64,AAAA">') + view('new', 'Screenshot is available only in live test');
    const [old, current] = findInspectionPanels(document);
    expect([old.htmlPanel, old.shotPanel, old.infoPanel].map(panel => panel.closest('.old'))).not.toContain(null);
    expect([current.htmlPanel, current.shotPanel, current.infoPanel].map(panel => panel.closest('.new'))).not.toContain(null);
  });

  it('ignores other three-tab widgets', () => {
    document.body.innerHTML = `
      <div role="tablist"><div role="tab" aria-controls="a">A</div><div role="tab" aria-controls="b">B</div><div role="tab" aria-controls="c">C</div></div>
      <div id="a"></div><div id="b"></div><div id="c"></div>`;
    expect(findInspectionPanels(document)).toEqual([]);
  });
});

describe('isPanelOpen', () => {
  it('tells an open panel from one Search Console keeps hidden in the page', () => {
    buildScPage();
    expect(isPanelOpen(findInspectionPanels(document)[0])).toBe(true);
    buildScPage({ open: false });
    expect(isPanelOpen(findInspectionPanels(document)[0])).toBe(false);
  });

  it('knows a closed panel Search Console slid out of view: it keeps its box but is visibility:hidden', () => {
    // a closed side panel is moved out of the window and hidden
    buildScPage();
    document.querySelector('.side').style.visibility = 'hidden';
    expect(isPanelOpen(findInspectionPanels(document)[0])).toBe(false);
  });
});

describe('findInspectedUrl', () => {
  it('returns the inspected URL shown in the page header', () => {
    buildScPage();
    expect(findInspectedUrl(document)).toBe(INSPECTED);
  });

  it('prefers the URL on screen over earlier inspections Search Console keeps hidden, and skips navigation', () => {
    document.body.innerHTML = `
      <div class="old-view"><div>https://natzir.com/old-inspection</div></div>
      <nav><div id="nav">https://natzir.com/</div></nav>
      <div class="header"><div id="current">https://natzir.com/blog/post</div></div>
      <div role="tabpanel"><div id="resource">https://cdn.example/app.js</div></div>`;
    const onScreen = () => [{ width: 100, height: 20 }];
    for (const id of ['nav', 'current', 'resource']) document.getElementById(id).getClientRects = onScreen;
    expect(findInspectedUrl(document)).toBe('https://natzir.com/blog/post');
  });

  it('accepts a scheme in capitals and a URL with spaces', () => {
    document.body.innerHTML = '<div class="header"><div id="current">HTTPS://natzir.com/a page</div></div>';
    document.getElementById('current').getClientRects = () => [{ width: 100, height: 20 }];
    expect(findInspectedUrl(document)).toBe('HTTPS://natzir.com/a page');
  });

  it('ignores URLs inside the HTML editor even when it comes first', () => {
    buildScPage();
    document.body.append(document.querySelector('.header'));
    expect(findInspectedUrl(document)).toBe(INSPECTED);
  });
});

describe('readPanel', () => {
  it('reads a live test: HTML, kind and the width of Google\'s screenshot', () => {
    const page = buildScPage({ html: '<!DOCTYPE html><p>hi</p>' });
    Object.defineProperty(page.shotPanel.querySelector('img'), 'naturalWidth', { value: 360 });
    const [panel] = findInspectionPanels(document);
    expect(readPanel(panel, document)).toMatchObject({
      html: '<!DOCTYPE html><p>hi</p>',
      kind: 'live',
      width: 360,
      inspectedUrl: INSPECTED,
      unloaded: { count: 0, resources: [] },
    });
  });

  it('uses 1024 px for a crawled page rendered with the desktop crawler', () => {
    buildScPage({ screenshot: false, footer: 'Rendered with Googlebot desktop' });
    const [panel] = findInspectionPanels(document);
    expect(readPanel(panel, document)).toMatchObject({ kind: 'crawled', width: 1024 });
  });

  it('uses 412 px for a crawled page rendered with the smartphone crawler', () => {
    buildScPage({ screenshot: false, footer: 'Rendered with Googlebot smartphone' });
    const [panel] = findInspectionPanels(document);
    expect(readPanel(panel, document).width).toBe(412);
  });

  it('tells a missing editor apart from an empty one', () => {
    buildScPage({ editor: false });
    expect(readPanel(findInspectionPanels(document)[0], document)).toMatchObject({ html: null, editorFound: false });
    buildScPage({ html: '   ' });
    expect(readPanel(findInspectionPanels(document)[0], document)).toMatchObject({ html: null, editorFound: true });
  });
});

const BLOCKED = [
  { reason: 'Googlebot blocked by <a href="#">robots.txt</a>', type: 'XHR', url: 'https://account.shop.example/privacy-consents/implicit' },
  { reason: 'Googlebot blocked by <a href="#">robots.txt</a>', type: 'Image', url: 'https://maps.googleapis.com/maps/api/staticmap?size=375x80&amp;zoom=13' },
  { reason: 'Other error', type: 'Stylesheet', url: 'https://static.shop.example/css/main.css' },
];

describe('readUnloaded', () => {
  it('reads reason, type and URL of each resource Googlebot couldn\'t load, and nothing from the console', () => {
    const { infoPanel } = buildScPage({ info: moreInfo(BLOCKED) });
    expect(readUnloaded(infoPanel)).toEqual({
      count: 3,
      resources: [
        { reason: 'Googlebot blocked by robots.txt', type: 'XHR', url: 'https://account.shop.example/privacy-consents/implicit' },
        { reason: 'Googlebot blocked by robots.txt', type: 'Image', url: 'https://maps.googleapis.com/maps/api/staticmap?size=375x80&zoom=13' },
        { reason: 'Other error', type: 'Stylesheet', url: 'https://static.shop.example/css/main.css' },
      ],
    });
  });

  it('reads resources Search Console gives no type (e.g. a web worker)', () => {
    const worker = { reason: 'Googlebot blocked by robots.txt', type: '', url: 'https://shop.example/js/PostCacheWebWorker-DCDzPNIE.js' };
    const { infoPanel } = buildScPage({ info: moreInfo([BLOCKED[0], worker]) });
    expect(readUnloaded(infoPanel).resources).toEqual([
      { reason: 'Googlebot blocked by robots.txt', type: 'XHR', url: 'https://account.shop.example/privacy-consents/implicit' },
      worker,
    ]);
  });

  it('returns an empty list when everything loaded or More info is missing', () => {
    expect(readUnloaded(buildScPage({ info: moreInfo([]) }).infoPanel)).toEqual({ count: 0, resources: [] });
    expect(readUnloaded(null)).toEqual({ count: 0, resources: [] });
  });

  it('does not trust a list whose length differs from Search Console\'s own count', () => {
    // e.g. the list's filter set to "Resources that loaded"
    const { infoPanel } = buildScPage({ info: moreInfo(BLOCKED.slice(0, 2), 5) });
    expect(readUnloaded(infoPanel)).toEqual({ count: 5, resources: null });
  });

  it('does not say everything loaded when Search Console counts failures but no row can be read', () => {
    // e.g. rows that changed shape, or only the resources that did load listed
    const { infoPanel } = buildScPage({ info: moreInfo([], 3) });
    expect(readUnloaded(infoPanel)).toEqual({ count: 3, resources: null });
  });
});

describe('pickBaseUrl', () => {
  it('prefers the canonical, resolved against the inspected URL', () => {
    const doc = parse('<link rel="canonical" href="/city/madrid.html"><meta property="og:url" content="https://og.example/">');
    expect(pickBaseUrl(doc, 'https://www.shop.example/x')).toBe('https://www.shop.example/city/madrid.html');
  });

  it('falls back to og:url, then to the inspected URL', () => {
    expect(pickBaseUrl(parse('<meta property="og:url" content="https://og.example/p">'), INSPECTED)).toBe('https://og.example/p');
    expect(pickBaseUrl(parse('<p>no hints</p>'), INSPECTED)).toBe(INSPECTED);
  });

  it('ignores canonicals that are not http(s)', () => {
    expect(pickBaseUrl(parse('<link rel="canonical" href="javascript:x">'), INSPECTED)).toBe(INSPECTED);
  });

  it('resolves the page\'s own base against the document URL', () => {
    const doc = parse('<link rel="canonical" href="https://shop.example.com/cat/page"><base href="/assets/">');
    expect(pickBaseUrl(doc, INSPECTED)).toBe('https://shop.example.com/assets/');
  });

  it('returns null when nothing is known', () => {
    expect(pickBaseUrl(parse('<p>x</p>'), null)).toBeNull();
  });
});
