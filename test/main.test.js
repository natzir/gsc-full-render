import { describe, it, expect, vi, afterEach } from 'vitest';
import { toggle, autoStart } from '../src/main.js';
import { TEXT, EXTENSION_TEXT } from '../src/text.js';
import { buildScPage, moreInfo } from './helpers/sc-page.js';

const SC = 'https://search.google.com/search-console/inspect?resource_id=sc-domain%3Anatzir.com&id=x';
const OVERVIEW = 'https://search.google.com/search-console?resource_id=sc-domain%3Anatzir.com';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const toasts = () => [...document.querySelectorAll('[data-gfr-toast]')].map(t => t.shadowRoot.querySelector('.toast').textContent);
const wins = [];
const fakeWin = extra => {
  const win = { document, location: { href: SC }, ...extra };
  wins.push(win);
  return win;
};

const panelButton = (shotPanel, text) =>
  [...shotPanel.querySelector(':scope > [data-gfr-host]').shadowRoot.querySelectorAll('button')].find(b => b.textContent === text);
const openLarger = shotPanel => shotPanel.querySelector(':scope > [data-gfr-host]').shadowRoot.querySelector('button.open').click();

afterEach(() => {
  for (const win of wins.splice(0)) if (win.__gscFullRender) toggle(win);
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('toggle', () => {
  it('refuses to start outside Search Console', () => {
    const win = fakeWin({ location: { href: 'https://example.com/' } });
    expect(toggle(win)).toBe('refused');
    expect(toasts()).toContain(TEXT.notSearchConsole);
    expect(win.__gscFullRender).toBeUndefined();
  });

  it('refuses on Search Console pages other than URL Inspection', () => {
    buildScPage();
    const win = fakeWin({ location: { href: 'https://search.google.com/search-console?resource_id=sc-domain%3Anatzir.com' } });
    expect(toggle(win)).toBe('refused');
    expect(toasts()).toContain(TEXT.notSearchConsole);
    expect(win.__gscFullRender).toBeUndefined();
  });

  it('turns on in URL Inspection before the panel is open, says what to open, and mounts when it opens', async () => {
    const win = fakeWin();
    expect(toggle(win)).toBe('on');
    expect(toasts()).toContain(TEXT.onNoPanel);
    const { shotPanel } = buildScPage();
    await wait(100);
    expect(shotPanel.querySelector(':scope > [data-gfr-host]')).not.toBeNull();
  });

  it('says what to open when the only panels are hidden leftovers of earlier inspections', () => {
    buildScPage({ open: false });
    expect(toggle(fakeWin())).toBe('on');
    expect(toasts()).toContain(TEXT.onNoPanel);
  });

  it('shows an error instead of loading forever when the page cannot be prepared', async () => {
    const { shotPanel } = buildScPage();
    const failing = { createPolicy: () => ({ createHTML: () => { throw new Error('boom'); } }) };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    toggle(fakeWin({ trustedTypes: failing }));
    await wait(100);
    const root = shotPanel.querySelector(':scope > [data-gfr-host]').shadowRoot;
    expect(root.querySelector('[role="alert"]').textContent).toBe(`${TEXT.failed}boom`);
    expect(shotPanel.querySelector('.shot').hasAttribute('style')).toBe(false);
  });

  it('turns off completely even if one view fails to tear down', () => {
    buildScPage();
    const win = fakeWin();
    toggle(win);
    const remove = vi.spyOn(Element.prototype, 'remove').mockImplementationOnce(() => {
      throw new Error('stuck');
    });
    expect(() => toggle(win)).not.toThrow();
    remove.mockRestore();
    expect(win.__gscFullRender).toBeUndefined();
    expect(toasts()).toEqual([TEXT.off]);
  });

  it('works for secondary Google accounts (/u/1/)', () => {
    const { shotPanel } = buildScPage();
    const win = fakeWin({ location: { href: 'https://search.google.com/u/1/search-console/inspect?resource_id=x&id=y' } });
    expect(toggle(win)).toBe('on');
    expect(shotPanel.querySelector(':scope > [data-gfr-host]')).not.toBeNull();
  });

  it('reports a blocked Trusted Types policy', () => {
    const win = fakeWin({ trustedTypes: { createPolicy() { throw new Error('nope'); } } });
    expect(toggle(win)).toBe('blocked');
    expect(toasts()).toContain(`${TEXT.blocked}nope`);
  });

  it('turns on, mounts the view, and turning off restores the panel exactly', async () => {
    const { shotPanel } = buildScPage();
    const before = shotPanel.innerHTML;
    const win = fakeWin();
    expect(toggle(win)).toBe('on');
    expect(toasts()).toContain(TEXT.on);
    expect(shotPanel.querySelector(':scope > [data-gfr-host]')).not.toBeNull();
    await wait(100);
    expect(toggle(win)).toBe('off');
    expect(toasts()).toEqual([TEXT.off]);
    expect(shotPanel.innerHTML).toBe(before);
    expect(win.__gscFullRender).toBeUndefined();
  });

  it('waits for Search Console\'s HTML, and shows the error only if it never arrives', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { shotPanel } = buildScPage({ editor: false });
      toggle(fakeWin());
      const root = shotPanel.querySelector(':scope > [data-gfr-host]').shadowRoot;
      expect(root.querySelector('[role="alert"]')).toBeNull();
      expect(root.querySelector('.status').textContent).toBe(TEXT.waiting);
      vi.advanceTimersByTime(19_000);
      expect(root.querySelector('[role="alert"]')).toBeNull();
      vi.advanceTimersByTime(1_000);
      expect(root.querySelector('[role="alert"]').textContent).toBe(TEXT.noHtml);
    } finally {
      vi.useRealTimers();
    }
  });

  it('draws nothing when the page produced no HTML', () => {
    const { shotPanel } = buildScPage({ html: '' });
    toggle(fakeWin());
    const host = shotPanel.querySelector(':scope > [data-gfr-host]');
    expect(host.style.display).toBe('none');
    expect(host.shadowRoot.querySelector('[role="alert"]')).toBeNull();
  });

  it('downloads the links as CSV from the larger view', async () => {
    const { shotPanel } = buildScPage({ html: '<!DOCTYPE html><a href="/a">A</a><a href="https://other.com/">B</a>' });
    toggle(fakeWin());
    await wait(100);
    const blobs = [];
    URL.createObjectURL = vi.fn(blob => {
      blobs.push(blob);
      return 'blob:csv';
    });
    URL.revokeObjectURL = vi.fn();
    const downloads = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      downloads.push(this.download);
    });
    openLarger(shotPanel);
    const modal = document.querySelector('[data-gfr-modal]').shadowRoot;
    [...modal.querySelectorAll('button')].find(b => b.textContent === 'Links').click();
    modal.querySelector('.download').click();
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toMatch(/^links-www\.shop\.example-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(blobs[0].type).toBe('text/csv;charset=utf-8');
  });

  it('lists the links in the larger view', async () => {
    const { shotPanel } = buildScPage({ html: '<!DOCTYPE html><a href="/a">A</a><a href="https://other.com/">B</a>' });
    toggle(fakeWin());
    await wait(100);
    openLarger(shotPanel);
    const rows = document.querySelector('[data-gfr-modal]').shadowRoot.querySelectorAll('.row');
    expect([...rows].map(r => r.querySelector('.text').textContent)).toEqual(['A', 'B']);
  });

  it('turns off cleanly with the larger view open after the panel was removed', async () => {
    const { shotPanel } = buildScPage();
    const win = fakeWin();
    toggle(win);
    await wait(100);
    const root = shotPanel.querySelector(':scope > [data-gfr-host]').shadowRoot;
    root.querySelector('button.open').click();
    expect(document.querySelector('[data-gfr-modal]')).not.toBeNull();
    shotPanel.closest('.side').remove();
    expect(() => toggle(win)).not.toThrow();
    expect(document.querySelectorAll('[data-gfr-host], [data-gfr-modal]')).toHaveLength(0);
  });

  it('leaves out of the full page what robots.txt blocked, loads "Other error", and ⤢ opens it larger', async () => {
    const blocked = 'https://natzir.com/blocked.png';
    const { shotPanel } = buildScPage({
      html: `<!DOCTYPE html><img src="${blocked}"><img src="https://natzir.com/slow.png"><a href="/a">A</a>`,
      info: moreInfo([
        { reason: 'Googlebot blocked by robots.txt', type: 'Image', url: blocked },
        { reason: 'Other error', type: 'Image', url: 'https://natzir.com/slow.png' },
      ]),
    });
    toggle(fakeWin());
    await wait(100);
    const root = shotPanel.querySelector(':scope > [data-gfr-host]').shadowRoot;
    const srcs = frame => [...new DOMParser().parseFromString(frame.srcdoc, 'text/html').querySelectorAll('img')].map(img => img.getAttribute('src'));
    expect(panelButton(shotPanel, 'Full page').getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('.unloaded').textContent).toBe('⚠ 2 not loaded');
    expect(root.querySelector('.note').textContent).toBe(TEXT.notes.leftOut);
    // robots.txt is certain: left out. "Other error" gives no reason: loaded.
    expect([...root.querySelectorAll('iframe')].map(srcs)).toEqual([['data:,', 'https://natzir.com/slow.png']]);
    openLarger(shotPanel);
    const modal = document.querySelector('[data-gfr-modal]').shadowRoot;
    expect(modal.querySelector('.title').textContent).toBe(TEXT.modalTitle);
    expect(srcs(modal.querySelector('iframe'))).toEqual(['data:,', 'https://natzir.com/slow.png']);
  });

  it('leaves nothing out when Search Console only missed things that change nothing', async () => {
    const { shotPanel } = buildScPage({
      info: moreInfo([{ reason: 'Other error', type: 'XHR', url: 'https://natzir.com/api' }]),
    });
    toggle(fakeWin());
    await wait(100);
    const root = shotPanel.querySelector(':scope > [data-gfr-host]').shadowRoot;
    expect(root.querySelector('.note').textContent).toBe(TEXT.note);
    expect(root.querySelector('.unloaded').hidden).toBe(false);
  });

  it('shows lazy images that never loaded with their placeholder, even when Search Console lists nothing', async () => {
    const { shotPanel } = buildScPage({ html: '<!DOCTYPE html><img src="data:image/gif;base64,R0l" data-src="https://natzir.com/big.jpg">' });
    toggle(fakeWin());
    await wait(100);
    const root = shotPanel.querySelector(':scope > [data-gfr-host]').shadowRoot;
    const imgSrc = frame => new DOMParser().parseFromString(frame.srcdoc, 'text/html').querySelector('img').getAttribute('src');
    expect(root.querySelector('.unloaded').textContent).toBe('⚠ 1 not loaded');
    expect(imgSrc(root.querySelector('iframe'))).toBe('data:image/gif;base64,R0l');
  });

  it('replaces the no-HTML message with the render once Search Console\'s HTML arrives', async () => {
    const { shotPanel, htmlPanel } = buildScPage({ editor: false });
    toggle(fakeWin());
    const root = () => shotPanel.querySelector(':scope > [data-gfr-host]').shadowRoot;
    const editor = document.createElement('div');
    editor.className = 'CodeMirror';
    editor.CodeMirror = { getValue: () => '<!DOCTYPE html><p>late</p>', lineCount: () => 1, changeGeneration: () => 1, getDoc: () => ({}) };
    htmlPanel.append(editor);
    await wait(150);
    expect(root().querySelector('[role="alert"]')).toBeNull();
    expect(root().querySelector('iframe')).not.toBeNull();
  });

  it('drops the view of a panel that closed once another one opens, so hidden renders don\'t pile up', async () => {
    const first = buildScPage();
    toggle(fakeWin());
    await wait(100);
    const oldSide = document.querySelector('.side');
    oldSide.querySelector('[role="tablist"]').getClientRects = () => []; // closed
    const newSide = oldSide.cloneNode(true);
    newSide.querySelector('[data-gfr-host]').remove();
    newSide.querySelector('.CodeMirror').CodeMirror = first.editor;
    newSide.querySelector('[role="tablist"]').getClientRects = () => [{ width: 400, height: 48 }];
    document.body.append(newSide);
    await wait(100);
    expect(first.shotPanel.querySelector(':scope > [data-gfr-host]')).toBeNull();
    // [id=…], not #p-shot: with two elements sharing that id, jsdom resolves #p-shot document-wide
    expect(newSide.querySelector('[id="p-shot"] > [data-gfr-host]')).not.toBeNull();
  });
});

describe('autoStart', () => {
  it('starts quietly and mounts the open panel', () => {
    const { shotPanel } = buildScPage();
    const win = fakeWin();
    expect(autoStart(win, EXTENSION_TEXT)).toBe('on');
    expect(toasts()).toEqual([]);
    expect(shotPanel.querySelector(':scope > [data-gfr-host]')).not.toBeNull();
  });

  it('starts on any Search Console page and mounts once URL Inspection opens without a page load', async () => {
    const win = fakeWin({ location: { href: OVERVIEW } });
    expect(autoStart(win, EXTENSION_TEXT)).toBe('on');
    const { shotPanel } = buildScPage();
    await wait(100);
    expect(shotPanel.querySelector(':scope > [data-gfr-host]')).not.toBeNull();
    expect(toasts()).toEqual([]);
  });

  it('does nothing when it already runs, so starting again adds no second view', async () => {
    const { shotPanel } = buildScPage();
    const win = fakeWin();
    autoStart(win, EXTENSION_TEXT);
    const state = win.__gscFullRender;
    expect(autoStart(win, EXTENSION_TEXT)).toBe('running');
    expect(win.__gscFullRender).toBe(state);
    await wait(100);
    expect(shotPanel.querySelectorAll(':scope > [data-gfr-host]')).toHaveLength(1);
  });

  it('is turned off by the icon or by the bookmarklet, which share its state', () => {
    buildScPage();
    const win = fakeWin();
    autoStart(win, EXTENSION_TEXT);
    expect(toggle(win, EXTENSION_TEXT)).toBe('off');
    expect(toasts()).toEqual([TEXT.off]);
    autoStart(win, EXTENSION_TEXT);
    expect(toggle(win)).toBe('off');
    expect(win.__gscFullRender).toBeUndefined();
  });

  it('says so when Search Console blocks it, naming the extension', () => {
    const win = fakeWin({ trustedTypes: { createPolicy() { throw new Error('nope'); } } });
    expect(autoStart(win, EXTENSION_TEXT)).toBe('blocked');
    expect(toasts()).toEqual([`${EXTENSION_TEXT.blocked}nope`]);
    expect(win.__gscFullRender).toBeUndefined();
  });
});

describe('toggle from the extension icon', () => {
  it('names the icon, not the bookmarklet, when it turns on', () => {
    buildScPage();
    expect(toggle(fakeWin(), EXTENSION_TEXT)).toBe('on');
    expect(toasts()).toEqual([EXTENSION_TEXT.on]);
  });

  it('still refuses outside URL Inspection', () => {
    const win = fakeWin({ location: { href: OVERVIEW } });
    expect(toggle(win, EXTENSION_TEXT)).toBe('refused');
    expect(toasts()).toEqual([TEXT.notSearchConsole]);
  });

  it('shares every other text with the bookmarklet', () => {
    expect(EXTENSION_TEXT.on).toBe('Full render ON · click the extension icon again to turn it off');
    expect(EXTENSION_TEXT.blocked).toBe('Search Console blocked the extension: ');
    expect({ ...EXTENSION_TEXT, on: TEXT.on, blocked: TEXT.blocked }).toEqual(TEXT);
  });
});
