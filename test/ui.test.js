import { describe, it, expect, vi, afterEach } from 'vitest';
import { mountPanelUi } from '../src/panel.js';
import { openModal } from '../src/modal.js';
import { showToast } from '../src/toast.js';
import { TEXT } from '../src/text.js';
import { buildScPage } from './helpers/sc-page.js';

const shadow = shotPanel => shotPanel.querySelector(':scope > [data-gfr-host]').shadowRoot;
const hostOf = shotPanel => shotPanel.querySelector(':scope > [data-gfr-host]');
const button = (root, text) => [...root.querySelectorAll('button')].find(b => b.textContent === text);
const shownButtons = root => [...root.querySelectorAll('button')].filter(b => !b.hidden && !b.closest('[hidden]')).map(b => b.textContent);
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('mountPanelUi', () => {
  it('overlays Google\'s screenshot without taking part in the panel\'s layout', () => {
    const { shotPanel } = buildScPage();
    mountPanelUi(shotPanel, { live: true });
    const host = hostOf(shotPanel);
    expect(shotPanel.firstElementChild).toBe(host);
    expect(host.style.position).toBe('absolute');
    expect([host.style.top, host.style.right, host.style.bottom, host.style.left]).toEqual(['0px', '0px', '0px', '0px']);
    expect(shotPanel.style.position).toBe('relative');
    expect(button(shadow(shotPanel), 'Full page').getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps Google\'s elements in the layout but invisible in Full mode', () => {
    const { shotPanel } = buildScPage();
    mountPanelUi(shotPanel, { live: true });
    for (const el of [shotPanel.querySelector('.shot'), shotPanel.querySelector('.foot')]) {
      expect(el.style.visibility).toBe('hidden');
      expect(el.style.display).toBe('');
    }
  });

  it('switching to Screenshot restores Google\'s markup and keeps only the bottom bar', () => {
    const { shotPanel } = buildScPage();
    const before = [...shotPanel.children].map(c => c.outerHTML);
    mountPanelUi(shotPanel, { live: true });
    button(shadow(shotPanel), 'Screenshot').click();
    const after = [...shotPanel.children].filter(c => !c.hasAttribute('data-gfr-host')).map(c => c.outerHTML);
    expect(after).toEqual(before);
    expect(hostOf(shotPanel).style.top).toBe('auto');
    expect(hostOf(shotPanel).style.height).toBe('49px');
    button(shadow(shotPanel), 'Full page').click();
    expect(shotPanel.querySelector('.shot').style.visibility).toBe('hidden');
  });

  it('keeps Google\'s footer text available on the Screenshot button', () => {
    const { shotPanel } = buildScPage();
    mountPanelUi(shotPanel, { live: true });
    expect(button(shadow(shotPanel), 'Screenshot').title).toBe(`${TEXT.views.google} · Rendered with Google Inspection Tool smartphone`);
  });

  it('disables Screenshot on crawled pages, with an explanation', () => {
    const { shotPanel } = buildScPage({ screenshot: false });
    mountPanelUi(shotPanel, { live: false });
    const google = button(shadow(shotPanel), 'Screenshot');
    expect(google.disabled).toBe(true);
    expect(google.title).toBe(TEXT.googleDisabled);
  });

  it('destroy leaves the panel exactly as it was', () => {
    const { shotPanel } = buildScPage();
    const before = shotPanel.outerHTML;
    mountPanelUi(shotPanel, { live: true }).destroy();
    expect(shotPanel.outerHTML).toBe(before);
  });

  it('keeps new Google elements hidden while in Full mode', async () => {
    const { shotPanel } = buildScPage();
    const ui = mountPanelUi(shotPanel, { live: true });
    const late = document.createElement('div');
    shotPanel.append(late);
    await tick();
    expect(late.style.visibility).toBe('hidden');
    ui.destroy();
    expect(late.hasAttribute('style')).toBe(false);
  });

  it('places the render where Google places its screenshot image', () => {
    const { shotPanel } = buildScPage();
    const ui = mountPanelUi(shotPanel, { live: true });
    expect(ui.viewport.classList.contains('viewport')).toBe(true);
    expect(shadow(shotPanel).querySelector('style').textContent).toMatch(/\.viewport\{[^}]*position:relative[^}]*margin:0 16px/);
  });

  it('offers Screenshot | Full page, and ⤢ to open the page larger', () => {
    const { shotPanel } = buildScPage();
    const onOpen = vi.fn();
    const ui = mountPanelUi(shotPanel, { live: true, onOpen });
    const root = shadow(shotPanel);
    const open = root.querySelector('button.open');
    expect(shownButtons(root)).toEqual(['Screenshot', 'Full page', '']);
    expect(open.getAttribute('aria-label')).toBe(TEXT.openLabel);
    expect(open.title).toBe(TEXT.openTitle);
    expect(root.querySelector('.legend, .download')).toBeNull();
    expect(open.disabled).toBe(true);
    ui.showPrepared({});
    expect(open.disabled).toBe(false);
    open.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
    button(root, 'Screenshot').click();
    expect(open.disabled).toBe(true);
  });

  it('says in the note and on Full page when something was left out', () => {
    const { shotPanel } = buildScPage();
    const ui = mountPanelUi(shotPanel, { live: true });
    const root = shadow(shotPanel);
    ui.showPrepared({ leftOut: true });
    expect(root.querySelector('.note').textContent).toBe(TEXT.notes.leftOut);
    expect(button(root, 'Full page').title).toBe(`${TEXT.views.full} · ${TEXT.views.leftOut}`);
    ui.showPrepared({ leftOut: false });
    expect(root.querySelector('.note').textContent).toBe(TEXT.note);
    expect(button(root, 'Full page').title).toBe(TEXT.views.full);
  });

  it('says that the styles and images come from your browser now, not from Google', () => {
    const { shotPanel } = buildScPage();
    mountPanelUi(shotPanel, { live: true });
    const root = shadow(shotPanel);
    expect(root.querySelector('.note').textContent).toBe("Google's rendered HTML · styles and images loaded now by your browser, not by Google");
    expect(button(root, 'Full page').title).toBe(
      "The whole page: Google's rendered HTML, with the styles, images and fonts your browser loads now from the site, not the ones Google loaded, and no timeouts",
    );
  });

  it('keeps Screenshot when the user chose it while the render was loading', () => {
    const { shotPanel } = buildScPage();
    const ui = mountPanelUi(shotPanel, { live: true });
    const root = shadow(shotPanel);
    button(root, 'Screenshot').click();
    ui.showPrepared({ leftOut: true });
    expect(button(root, 'Screenshot').getAttribute('aria-pressed')).toBe('true');
  });

  it('shows loading, then fills the note', () => {
    const { shotPanel } = buildScPage();
    const ui = mountPanelUi(shotPanel, { live: true });
    const root = shadow(shotPanel);
    ui.showLoading();
    expect(root.querySelector('.status').textContent).toBe(TEXT.loading);
    ui.showPrepared({});
    ui.showLoaded({ failedStylesheets: 2 });
    expect(root.querySelector('.status').hidden).toBe(true);
    expect(root.querySelector('.note').textContent).toBe(`${TEXT.note} · 2 stylesheets failed to load`);
    // no tooltip, no help cursor: the base URL confused more than it helped
    expect(root.querySelector('.note').hasAttribute('title')).toBe(false);
    expect(root.querySelector('style').textContent).not.toContain('cursor:help');
    ui.showLoaded({ failedStylesheets: 0, unlocked: true });
    expect(root.querySelector('.note').textContent).toBe(`${TEXT.note} · ${TEXT.unlocked}`);
    ui.showLoaded({ failedStylesheets: 0, failedFonts: 1 });
    expect(root.querySelector('.note').textContent).toBe(`${TEXT.note} · 1 font failed to load`);
  });

  it('says what Googlebot couldn\'t load, why, and what that changes here', () => {
    const { shotPanel } = buildScPage();
    const ui = mountPanelUi(shotPanel, { live: true });
    const root = shadow(shotPanel);
    const resources = [
      { reason: 'Googlebot blocked by robots.txt', type: 'Image', url: 'https://maps.googleapis.com/map', effect: 'shown' },
      { reason: 'Other error', type: 'XHR', url: 'https://www.shop.example/api', effect: 'no-visual' },
      { reason: 'Not found (404)', type: 'Image', url: 'https://cdn.example/bg.png', effect: 'not-found' },
      { reason: 'Other error', type: 'Image', url: 'https://cdn.example/slow.png', effect: 'loaded' },
    ];
    ui.showPrepared({ leftOut: true, unloaded: { count: 4, resources } });
    const toggle = root.querySelector('.unloaded');
    const details = root.querySelector('.details');
    expect(toggle.textContent).toBe('⚠ 4 not loaded');
    expect(details.hidden).toBe(true);
    toggle.click();
    expect(details.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const items = [...details.querySelectorAll('li')].map(li => [...li.children].map(el => el.textContent));
    expect(items).toEqual([
      ['Image', TEXT.reasons.robots, TEXT.effects.shown, 'https://maps.googleapis.com/map'],
      ['XHR', TEXT.reasons.other, TEXT.effects['no-visual'], 'https://www.shop.example/api'],
      ['Image', 'Not found (404)', TEXT.effects['not-found'], 'https://cdn.example/bg.png'],
      ['Image', TEXT.reasons.other, TEXT.effects.loaded, 'https://cdn.example/slow.png'],
    ]);
    toggle.click();
    expect(details.hidden).toBe(true);
  });

  it('shows no empty type tag for a resource Search Console gives no type', () => {
    const { shotPanel } = buildScPage();
    const ui = mountPanelUi(shotPanel, { live: true });
    const resources = [{ reason: 'Googlebot blocked by robots.txt', type: '', url: 'https://shop.example/w.js', effect: 'no-visual' }];
    ui.showPrepared({ unloaded: { count: 1, resources } });
    const li = shadow(shotPanel).querySelector('.details li');
    expect([...li.children].map(el => el.textContent)).toEqual([TEXT.reasons.robots, TEXT.effects['no-visual'], 'https://shop.example/w.js']);
  });

  it('says so when Search Console\'s list of what didn\'t load can\'t be read', () => {
    const { shotPanel } = buildScPage();
    const ui = mountPanelUi(shotPanel, { live: true });
    const root = shadow(shotPanel);
    ui.showPrepared({ unloaded: { count: 5, resources: null } });
    root.querySelector('.unloaded').click();
    expect(root.querySelector('.details p').textContent).toBe(TEXT.unloadedUnread(5));
  });

  it('adds the lazy images Googlebot never requested, in their own group', () => {
    const { shotPanel } = buildScPage();
    const ui = mountPanelUi(shotPanel, { live: true });
    const root = shadow(shotPanel);
    const resources = [{ reason: 'Googlebot blocked by robots.txt', type: 'XHR', url: 'https://www.shop.example/api', effect: 'no-visual' }];
    ui.showPrepared({ leftOut: true, unloaded: { count: 1, resources }, lazy: ['https://a.example/1.jpg', 'https://a.example/2.jpg'] });
    expect(root.querySelector('.unloaded').textContent).toBe('⚠ 3 not loaded');
    const details = root.querySelector('.details');
    expect([...details.querySelectorAll('p')].map(p => p.textContent)).toEqual([TEXT.unloadedIntro(1), TEXT.lazyIntro(2)]);
    const items = [...details.querySelectorAll('li')].map(li => [...li.children].map(el => el.textContent));
    expect(items.slice(1)).toEqual([
      ['Image', TEXT.reasons.lazy, TEXT.effects.lazy, 'https://a.example/1.jpg'],
      ['Image', TEXT.reasons.lazy, TEXT.effects.lazy, 'https://a.example/2.jpg'],
    ]);
  });

  it('lists lazy images alone when Search Console reports nothing', () => {
    const { shotPanel } = buildScPage();
    const ui = mountPanelUi(shotPanel, { live: true });
    const root = shadow(shotPanel);
    ui.showPrepared({ leftOut: true, unloaded: { count: 0, resources: [] }, lazy: ['https://a.example/1.jpg'] });
    expect(root.querySelector('.unloaded').textContent).toBe('⚠ 1 not loaded');
    expect([...root.querySelectorAll('.details p')].map(p => p.textContent)).toEqual([TEXT.lazyIntro(1)]);
  });

  it('closes the list of what didn\'t load on a click outside it, on Esc, or with its close button', () => {
    const { shotPanel } = buildScPage();
    const ui = mountPanelUi(shotPanel, { live: true });
    const root = shadow(shotPanel);
    const resources = [{ reason: 'Other error', type: 'Image', url: 'https://a.example/1.jpg', effect: 'shown' }];
    ui.showPrepared({ leftOut: true, unloaded: { count: 1, resources } });
    const toggle = root.querySelector('.unloaded');
    const details = root.querySelector('.details');
    const press = target => target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, composed: true }));
    toggle.click();
    press(details.querySelector('li'));
    expect(details.hidden).toBe(false);
    press(document.body);
    expect(details.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    // a click on the render happens inside its frame, out of reach: a layer over it takes it
    expect(root.querySelector('.catcher').hidden).toBe(false);
    press(root.querySelector('.catcher'));
    expect(details.hidden).toBe(true);
    expect(root.querySelector('.catcher').hidden).toBe(true);
    toggle.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(details.hidden).toBe(true);
    toggle.click();
    details.querySelector('.close').click();
    expect(details.hidden).toBe(true);
    ui.destroy();
  });

  it('credits natzir.com above the render, opening in a new tab', () => {
    const { shotPanel } = buildScPage();
    mountPanelUi(shotPanel, { live: true });
    const link = shadow(shotPanel).querySelector('.caption a.by');
    expect(link.textContent).toBe('by natzir.com');
    expect(link.getAttribute('href')).toBe('https://natzir.com/');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener');
  });

  it('shows no warning when everything loaded', () => {
    const { shotPanel } = buildScPage();
    const ui = mountPanelUi(shotPanel, { live: true });
    ui.showPrepared({ unloaded: { count: 0, resources: [] } });
    expect(shadow(shotPanel).querySelector('.unloaded').hidden).toBe(true);
  });

  it('showError explains the problem and leaves Google\'s screenshot visible', () => {
    const { shotPanel } = buildScPage({ editor: false });
    const ui = mountPanelUi(shotPanel, { live: true });
    ui.showError();
    expect(shadow(shotPanel).querySelector('[role="alert"]').textContent).toBe(TEXT.noHtml);
    expect(shotPanel.querySelector('.shot').hasAttribute('style')).toBe(false);
  });

  it('showEmpty draws nothing and leaves Google\'s content visible', () => {
    const { shotPanel } = buildScPage({ html: '' });
    const ui = mountPanelUi(shotPanel, { live: true });
    ui.showEmpty();
    expect(shotPanel.querySelector('.shot').hasAttribute('style')).toBe(false);
    expect(hostOf(shotPanel).style.display).toBe('none'); // no invisible strip catching clicks
  });
});

describe('openModal', () => {
  const links = [
    { id: 0, tag: 'a', text: 'Home', href: '/', url: 'https://www.shop.example/', destination: 'internal', rel: [], crawlable: true, issue: '', urlFlags: ['relative'] },
    { id: 1, tag: 'a', text: '', href: 'https://x.com/?ref=1', url: 'https://x.com/?ref=1', destination: 'external', rel: ['nofollow'], crawlable: true, issue: '', urlFlags: ['params', 'absolute'] },
    { id: 2, tag: 'div', text: 'Card', href: '', url: '', destination: 'none', rel: [], crawlable: false, issue: 'not-a-link', urlFlags: [] },
  ];
  const open = (extra = {}) => openModal({ title: 'Full render', width: 428, links, ...extra });
  const modalRoot = () => document.querySelector('[data-gfr-modal]').shadowRoot;
  const visibleIds = () => [...modalRoot().querySelectorAll('.row')].filter(r => !r.closest('li').hidden).map(r => r.dataset.id);
  const pick = (name, value) => {
    const select = modalRoot().querySelector(`select[name="${name}"]`);
    select.value = value;
    select.dispatchEvent(new Event('change'));
  };
  const optionTexts = name => [...modalRoot().querySelectorAll(`select[name="${name}"] option`)].map(o => o.textContent);

  it('closes with Esc and reports it', () => {
    const onClose = vi.fn();
    open({ onClose });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('[data-gfr-modal]')).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('returns focus to what opened it, even inside a shadow root', () => {
    const opener = document.createElement('button');
    const shadowHost = document.createElement('div');
    document.body.append(shadowHost);
    shadowHost.attachShadow({ mode: 'open' }).append(opener);
    opener.focus();
    open().close();
    expect(shadowHost.shadowRoot.activeElement).toBe(opener);
  });

  it('resizes the render column to the page plus its measured scrollbar', () => {
    const modal = open();
    const root = modalRoot();
    modal.setRenderWidth(429);
    expect(root.querySelector('.render').style.width).toBe('429px');
    expect(root.querySelector('.dialog').style.width).toBe('429px');
    button(root, 'Links').click();
    expect(root.querySelector('.dialog').style.width).toBe('849px');
  });

  it('lets Tab reach the filters once the list is shown', () => {
    open();
    const root = modalRoot();
    button(root, 'Links').click();
    root.querySelector('select[name="destination"]').focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(root.activeElement).toBe(root.querySelector('select[name="rel"]'));
  });

  it('tags a screen-reader-only link as the filter names it', () => {
    const modal = open();
    modal.markOnLoad(new Map([[0, 'visually_hidden'], [1, 'visible'], [2, 'visible']]));
    expect([...modalRoot().querySelectorAll('.row')[0].querySelectorAll('.tag')].map(t => t.textContent)).toEqual(['hidden']);
  });

  it('keeps Tab inside the dialog', () => {
    open();
    const root = modalRoot();
    const first = button(root, 'Links');
    const last = root.querySelector('.close');
    const tab = shiftKey => {
      const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
      document.dispatchEvent(event);
      return event;
    };
    expect(root.activeElement).toBe(last);
    expect(tab(false).defaultPrevented).toBe(true);
    expect(root.activeElement).toBe(first);
    tab(true);
    expect(root.activeElement).toBe(last);
  });

  it('closes on a backdrop click but not on a click inside the dialog', () => {
    const modal = open();
    modal.render.click();
    expect(document.querySelector('[data-gfr-modal]')).not.toBeNull();
    modalRoot().querySelector('.backdrop').click();
    expect(document.querySelector('[data-gfr-modal]')).toBeNull();
  });

  it('makes the render column the positioning context of the render frame', () => {
    open();
    expect(modalRoot().querySelector('style').textContent).toMatch(/\.render\{[^}]*position:relative/);
  });

  it('opens with the page only; Links shows the list and the download, and hides them again', () => {
    const onLinksChange = vi.fn();
    open({ onLinksChange });
    const root = modalRoot();
    const viewLinks = button(root, 'Links');
    const list = root.querySelector('.list');
    const download = root.querySelector('.download');
    expect(root.querySelector('.title').textContent).toBe('Full render');
    expect(list.hidden).toBe(true);
    expect(download.hidden).toBe(true);
    viewLinks.click();
    expect(onLinksChange).toHaveBeenLastCalledWith(true);
    expect(list.hidden).toBe(false);
    expect(download.hidden).toBe(false);
    viewLinks.click();
    expect(onLinksChange).toHaveBeenLastCalledWith(false);
    expect(list.hidden).toBe(true);
  });

  it('lists every link with its text, URL and only the tags that add something', () => {
    open();
    const rows = [...modalRoot().querySelectorAll('.row')];
    expect(rows.map(r => r.querySelector('.text').textContent)).toEqual(['Home', '(no text)', 'Card']);
    expect(rows.map(r => r.querySelector('.url').textContent)).toEqual(['https://www.shop.example/', 'https://x.com/?ref=1', '(no href)']);
    expect(rows.map(r => [...r.querySelectorAll('.tag')].map(t => t.textContent))).toEqual([
      [],
      ['nofollow', 'parameters'],
      ['not crawlable: not an <a> (onclick/data-href)'],
    ]);
  });

  it('filters by destination, rel and crawlability, combined', () => {
    open();
    expect(optionTexts('destination')).toEqual(['All 3', 'Internal 1', 'External 1', 'No URL 1']);
    expect(optionTexts('rel')).toEqual(['Any 3', 'Follow 2', 'Nofollow 1', 'UGC 0', 'Sponsored 0']);
    expect(optionTexts('crawlable')).toEqual(['Any 3', 'Crawlable 2', 'Not crawlable 1']);
    pick('rel', 'nofollow');
    expect(visibleIds()).toEqual(['1']);
    pick('destination', 'internal');
    expect(visibleIds()).toEqual([]);
    pick('rel', 'follow');
    expect(visibleIds()).toEqual(['0']);
    pick('destination', '');
    pick('rel', '');
    pick('crawlable', 'no');
    expect(visibleIds()).toEqual(['2']);
  });

  it('counts each filter\'s options among the links the other filters leave, greying out empty ones', () => {
    const modal = open();
    modal.markOnLoad(new Map([[0, 'visible'], [1, 'carousel'], [2, 'collapsed']]));
    const disabled = name => [...modalRoot().querySelectorAll(`select[name="${name}"] option`)].filter(o => o.disabled).map(o => o.value);
    pick('crawlable', 'no');
    expect(optionTexts('destination')).toEqual(['All 1', 'Internal 0', 'External 0', 'No URL 1']);
    expect(optionTexts('rel')).toEqual(['Any 1', 'Follow 1', 'Nofollow 0', 'UGC 0', 'Sponsored 0']);
    expect(optionTexts('state')).toEqual(['Any 1', 'Visible 0', 'Carousel 0', 'Collapsed 1', 'Invisible 0', 'Hidden 0']);
    // its own options still count every link the other filters leave
    expect(optionTexts('crawlable')).toEqual(['Any 3', 'Crawlable 2', 'Not crawlable 1']);
    expect(disabled('destination')).toEqual(['internal', 'external']);
    expect(disabled('rel')).toEqual(['nofollow', 'ugc', 'sponsored']);
    pick('destination', 'none');
    pick('crawlable', '');
    // a chosen option stays selectable even when the others make it empty
    pick('rel', 'nofollow');
    expect(optionTexts('destination')).toEqual(['All 1', 'Internal 0', 'External 1', 'No URL 0']);
    expect(disabled('destination')).toEqual(['internal']);
    expect(modalRoot().querySelector('select[name="destination"]').value).toBe('none');
  });

  it('says how many links the filters show, with a way to clear them', () => {
    open();
    const summary = () => modalRoot().querySelector('.summary').textContent;
    expect(summary()).toBe('3 links');
    pick('rel', 'nofollow');
    expect(summary()).toBe('Showing 1 of 3 · Clear filters');
    button(modalRoot(), 'Clear filters').click();
    expect(summary()).toBe('3 links');
    expect(visibleIds()).toEqual(['0', '1', '2']);
    expect(modalRoot().querySelector('select[name="rel"]').value).toBe('');
  });

  it('filters by what each URL has, and tags only what stands out (not absolute or relative)', () => {
    open();
    expect(optionTexts('url')).toEqual([
      'Any 3', 'Parameters 1', 'Fragment (#) 0', 'To this page 0', 'HTTP 0', 'Uppercase 0', 'Spaces or non-ASCII 0',
      'Long (115+ chars) 0', 'Absolute 1', 'Relative 1', 'Relative without / 0', 'Protocol-relative (//) 0', 'Domain without https:// 0',
    ]);
    pick('url', 'params');
    expect(visibleIds()).toEqual(['1']);
    pick('url', 'relative');
    expect(visibleIds()).toEqual(['0']);
  });

  it('tells the page which links to outline: those the filters show', () => {
    const onFilterChange = vi.fn();
    open({ onFilterChange });
    pick('rel', 'nofollow');
    expect(onFilterChange).toHaveBeenLastCalledWith(new Set([1]));
    pick('rel', '');
    expect(onFilterChange).toHaveBeenLastCalledWith(null);
  });

  it('marks each row with how its link shows on load, and filters by it', () => {
    const modal = open();
    expect(modalRoot().querySelector('select[name="state"]').disabled).toBe(true);
    modal.markOnLoad(new Map([[0, 'visible'], [1, 'carousel'], [2, 'collapsed']]));
    const rows = modalRoot().querySelectorAll('.row');
    expect(rows[0].classList.contains('not-visible')).toBe(false);
    expect(rows[1].classList.contains('not-visible')).toBe(true);
    expect(rows[1].title).toBe(TEXT.onLoadTitles.carousel);
    expect([...rows[1].querySelectorAll('.tag')].map(t => t.textContent)).toEqual(['nofollow', 'parameters', 'carousel']);
    expect(optionTexts('state')).toEqual(['Any 3', 'Visible 1', 'Carousel 1', 'Collapsed 1', 'Invisible 0', 'Hidden 0']);
    pick('state', 'collapsed');
    expect(visibleIds()).toEqual(['2']);
  });

  it('reports a row click with the link id', () => {
    const onRowClick = vi.fn();
    open({ onRowClick });
    modalRoot().querySelectorAll('.row')[2].click();
    expect(onRowClick).toHaveBeenCalledWith(2);
  });

  it('showRow brings a link\'s row into view, even when filtered out, and highlights it', () => {
    vi.useFakeTimers();
    const modal = open();
    const root = modalRoot();
    button(root, 'Links').click();
    modal.markOnLoad(new Map([[0, 'visible'], [1, 'visible'], [2, 'collapsed']]));
    pick('state', 'visible');
    pick('destination', 'internal');
    const scrolled = [];
    HTMLElement.prototype.scrollIntoView = function () {
      scrolled.push(this.dataset.id);
    };
    modal.showRow(2);
    const row = root.querySelector('.row[data-id="2"]');
    expect(row.closest('li').hidden).toBe(false);
    for (const name of ['destination', 'rel', 'crawlable', 'state']) expect(root.querySelector(`select[name="${name}"]`).value).toBe('');
    expect(scrolled).toEqual(['2']);
    expect(row.classList.contains('flash')).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(row.classList.contains('flash')).toBe(false);
    delete HTMLElement.prototype.scrollIntoView;
  });

  it('offers "Download links" with an icon once links are shown', () => {
    const onCsv = vi.fn();
    open({ onCsv });
    button(modalRoot(), 'Links').click();
    const download = modalRoot().querySelector('.download');
    expect(download.textContent).toBe('Download links');
    expect(download.querySelector('svg')).not.toBeNull();
    download.click();
    expect(onCsv).toHaveBeenCalledTimes(1);
  });
});

describe('showToast', () => {
  it('shows a message and removes it after the delay', () => {
    vi.useFakeTimers();
    const host = showToast(TEXT.on, 2500);
    expect(host.shadowRoot.querySelector('.toast').textContent).toBe(TEXT.on);
    expect(host.isConnected).toBe(true);
    vi.advanceTimersByTime(2500);
    expect(host.isConnected).toBe(false);
  });
});
