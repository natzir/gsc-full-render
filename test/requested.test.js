import { describe, it, expect, vi, afterEach } from 'vitest';
import { readRequested } from '../src/requested.js';
import { buildScPage, moreInfo } from './helpers/sc-page.js';

const failed = [
  { reason: 'Other error', type: 'Image', url: 'https://natzir.com/slow.png' },
  { reason: 'Googlebot blocked by robots.txt', type: 'Script', url: 'https://natzir.com/a.js' },
];
const loaded = [
  { type: 'Image', url: 'https://natzir.com/logo.png' },
  { type: 'Stylesheet', url: 'https://natzir.com/style.css' },
];
const everything = [...failed, ...loaded].map(({ url }) => url);
const rowUrls = infoPanel => [...infoPanel.querySelectorAll('.rows .row')].map(row => row.lastElementChild.textContent);
const switchedTwice = ['open', 'loaded on', 'open', 'loaded off'];
// The list comes back as soon as it is read; the filter is switched back after.
const settles = (log, expected) => vi.waitFor(() => expect(log).toEqual(expected), { timeout: 3000 });
const restored = () => vi.waitFor(() => expect(document.documentElement.hasAttribute('data-gfr-hiding-menu')).toBe(false), { timeout: 3000 });

afterEach(async () => {
  await restored();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('readRequested', () => {
  it('switches on what did load, reads every resource, and puts the filter back as it was', async () => {
    const { infoPanel, filterLog } = buildScPage({ info: moreInfo(failed, 2, 4), loaded });
    expect(await readRequested(infoPanel)).toEqual(everything);
    await settles(filterLog, switchedTwice);
    expect(rowUrls(infoPanel)).toEqual(failed.map(({ url }) => url));
  });

  it('presses again while the menu, just opened, ignores presses', async () => {
    const { infoPanel, filterLog } = buildScPage({ info: moreInfo(failed, 2, 4), loaded, ignoreFor: 300 });
    expect(await readRequested(infoPanel)).toEqual(everything);
    await vi.waitFor(() => expect(filterLog.filter(step => step !== 'ignored')).toEqual(switchedTwice), { timeout: 3000 });
    expect(filterLog).toContain('ignored');
  });

  it('hides menus while it uses the filter, and only then', async () => {
    const { infoPanel } = buildScPage({ info: moreInfo(failed, 2, 4), loaded });
    // Search Console moves an open menu to the end of the page: any menu there is hidden.
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    document.body.append(menu);
    const reading = readRequested(infoPanel);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(getComputedStyle(menu).opacity).toBe('0');
    await reading;
    await restored();
    expect(getComputedStyle(menu).opacity).not.toBe('0');
    expect(document.head.querySelector('style')).toBeNull();
  });

  it('finds the filter again each time: Search Console renders a new one with the list', async () => {
    const { infoPanel, filterLog } = buildScPage({ info: moreInfo(failed, 2, 4), loaded });
    const first = infoPanel.querySelector('.resources [aria-haspopup]');
    expect(await readRequested(infoPanel)).toEqual(everything);
    await settles(filterLog, switchedTwice);
    expect(infoPanel.querySelector('.resources [aria-haspopup]')).not.toBe(first);
    expect(await readRequested(infoPanel)).toEqual(everything);
    await settles(filterLog, [...switchedTwice, ...switchedTwice]);
  });

  it('reads a list that is already complete without touching the filter', async () => {
    const { infoPanel, filterLog } = buildScPage({ info: moreInfo(failed, 2, 2), loaded });
    expect(await readRequested(infoPanel)).toEqual(failed.map(({ url }) => url));
    expect(filterLog).toEqual([]);
  });

  it('gives up, and puts the filter back, when the list does not add up to Search Console\'s total', async () => {
    const { infoPanel, filterLog } = buildScPage({ info: moreInfo(failed, 2, 5), loaded });
    expect(await readRequested(infoPanel, { wait: 100 })).toBeNull();
    await settles(filterLog, switchedTwice);
    expect(rowUrls(infoPanel)).toHaveLength(2);
  });

  it('does not switch the filter back when the first switch changed nothing', async () => {
    const { infoPanel, filterLog } = buildScPage({ info: moreInfo(failed, 2, 4), loaded, respond: false });
    expect(await readRequested(infoPanel, { wait: 100 })).toBeNull();
    await restored();
    expect(filterLog).toEqual(['open']);
  });

  it('closes a menu that is not Page resources\' filter, and gives up', async () => {
    const { infoPanel, filterLog } = buildScPage({ info: moreInfo(failed, 2, 4), loaded });
    infoPanel.querySelector('.resources [role="menu"]').insertAdjacentHTML('beforeend', '<div role="menuitem">Other</div>');
    expect(await readRequested(infoPanel)).toBeNull();
    await restored();
    expect(filterLog).toEqual(['open', 'closed']);
    expect(infoPanel.querySelector('.resources [aria-haspopup]').getAttribute('aria-expanded')).toBe('false');
  });

  it('gives up without Search Console\'s total (More info not filled yet) or without the filter', async () => {
    const empty = buildScPage({ info: '<div></div>' });
    expect(await readRequested(empty.infoPanel)).toBeNull();
    const noFilter = buildScPage({ info: moreInfo(failed, 2, 4), loaded });
    noFilter.infoPanel.querySelector('.resources [aria-haspopup]').remove();
    expect(await readRequested(noFilter.infoPanel)).toBeNull();
    // The console's filter is not the resources' one: it is further from the count.
    expect(noFilter.infoPanel.querySelector('.console [aria-haspopup]').getAttribute('aria-expanded')).toBe('false');
  });

  it('reads one panel at a time: two views never switch the filter at once', async () => {
    const { infoPanel, filterLog } = buildScPage({ info: moreInfo(failed, 2, 4), loaded });
    const [a, b] = await Promise.all([readRequested(infoPanel), readRequested(infoPanel)]);
    expect(a).toEqual(everything);
    expect(b).toEqual(everything);
    await settles(filterLog, [...switchedTwice, ...switchedTwice]);
  });
});
