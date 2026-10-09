import { describe, it, expect } from 'vitest';
import { AUTO_SCRIPT, MENU_ID, MENU_TITLE, WELCOME_PAGE, installed, startup, menuClicked, iconClicked } from '../src/extension/worker.js';
import { fakeChrome } from './helpers/fake-chrome.js';

const SC_TABS = [
  { id: 1, url: 'https://search.google.com/search-console/inspect?resource_id=a&id=b' },
  { id: 2, url: 'https://search.google.com/u/1/search-console?resource_id=c' },
];
const autoInjection = tabId => ({ target: { tabId }, files: ['auto.js'], world: 'MAIN' });

describe('installed', () => {
  it('on first install opens the welcome page, adds the checked menu, registers the automatic start and starts it in open Search Console tabs', async () => {
    const api = fakeChrome({ openTabs: SC_TABS });
    await installed({ reason: 'install' }, api);
    expect(api.calls.created).toEqual([{ url: WELCOME_PAGE }]);
    expect(api.calls.menus).toEqual([{ id: MENU_ID, type: 'checkbox', title: MENU_TITLE, contexts: ['action'], checked: true }]);
    expect(api.registered).toEqual([AUTO_SCRIPT]);
    expect(api.calls.queries).toEqual([{ url: AUTO_SCRIPT.matches }]);
    expect(api.calls.executed).toEqual([autoInjection(1), autoInjection(2)]);
  });

  it('on an update keeps a stored "off": unchecked menu, no automatic start, no welcome page', async () => {
    const api = fakeChrome({ stored: { autoStart: false }, registered: [AUTO_SCRIPT], openTabs: SC_TABS });
    await installed({ reason: 'update' }, api);
    expect(api.calls.created).toEqual([]);
    expect(api.calls.menus.map(menu => menu.checked)).toEqual([false]);
    expect(api.registered).toEqual([]);
    expect(api.calls.executed).toEqual([]);
  });

  it('on an update with the setting on leaves the existing registration alone (Chrome rejects a second one)', async () => {
    const api = fakeChrome({ registered: [AUTO_SCRIPT], openTabs: SC_TABS });
    await installed({ reason: 'update' }, api);
    expect(api.registered).toEqual([AUTO_SCRIPT]);
    expect(api.calls.executed).toEqual([]);
  });

  it('replaces the menu an earlier version left instead of adding a second one', async () => {
    const api = fakeChrome();
    await installed({ reason: 'update' }, api);
    await installed({ reason: 'update' }, api);
    expect(api.calls.menus).toHaveLength(1);
  });

  it('opens the welcome page even if registering the automatic start fails', async () => {
    const api = fakeChrome({ failRegister: true });
    await expect(installed({ reason: 'install' }, api)).rejects.toThrow('register failed');
    expect(api.calls.created).toEqual([{ url: WELCOME_PAGE }]);
  });

  it('starts in the other open tabs when one of them refuses', async () => {
    const api = fakeChrome({ openTabs: SC_TABS, refuse: [1] });
    await installed({ reason: 'install' }, api);
    expect(api.calls.executed).toEqual([autoInjection(2)]);
  });

  it('doesn\'t open the welcome page when Chrome or a shared module updates', async () => {
    const api = fakeChrome();
    for (const reason of ['chrome_update', 'shared_module_update']) await installed({ reason }, api);
    expect(api.calls.created).toEqual([]);
  });
});

describe('startup', () => {
  it('registers the automatic start if it went missing while the setting is on', async () => {
    const api = fakeChrome();
    await startup(api);
    expect(api.registered).toEqual([AUTO_SCRIPT]);
  });

  it('removes it if it is there while the setting is off', async () => {
    const api = fakeChrome({ stored: { autoStart: false }, registered: [AUTO_SCRIPT] });
    await startup(api);
    expect(api.registered).toEqual([]);
  });
});

describe('menuClicked', () => {
  it('unchecking saves "off" and removes the automatic start, leaving open tabs as they are', async () => {
    const api = fakeChrome({ registered: [AUTO_SCRIPT], openTabs: SC_TABS });
    await menuClicked({ menuItemId: MENU_ID, checked: false }, api);
    expect(api.stored).toEqual({ autoStart: false });
    expect(api.registered).toEqual([]);
    expect(api.calls.executed).toEqual([]);
  });

  it('checking saves "on", registers the automatic start and starts it in open Search Console tabs', async () => {
    const api = fakeChrome({ stored: { autoStart: false }, openTabs: SC_TABS });
    await menuClicked({ menuItemId: MENU_ID, checked: true }, api);
    expect(api.stored).toEqual({ autoStart: true });
    expect(api.registered).toEqual([AUTO_SCRIPT]);
    expect(api.calls.executed).toEqual([autoInjection(1), autoInjection(2)]);
  });

  it('ignores other menu items', async () => {
    const api = fakeChrome();
    await menuClicked({ menuItemId: 'other', checked: false }, api);
    expect(api.stored).toEqual({});
  });
});

describe('iconClicked', () => {
  it('runs the toggle in the page\'s own world', async () => {
    const api = fakeChrome();
    await iconClicked({ id: 7 }, api);
    expect(api.calls.executed).toEqual([{ target: { tabId: 7 }, files: ['toggle.js'], world: 'MAIN' }]);
  });

  it('stays silent on pages Chrome protects', async () => {
    const api = fakeChrome({ refuse: [7] });
    await expect(iconClicked({ id: 7 }, api)).resolves.toBeUndefined();
  });
});

describe('AUTO_SCRIPT', () => {
  // A match pattern's * stands for any characters, the query string included.
  const covered = url =>
    AUTO_SCRIPT.matches.some(pattern =>
      new RegExp(`^${pattern.replace(/[.?+^$()[\]{}|\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(url),
    );

  it('runs in the page\'s own world, where Search Console\'s editor is, and survives restarts', () => {
    expect(AUTO_SCRIPT).toEqual({
      id: 'auto',
      js: ['auto.js'],
      matches: ['https://search.google.com/search-console*', 'https://search.google.com/u/*'],
      runAt: 'document_idle',
      world: 'MAIN',
      persistAcrossSessions: true,
    });
  });

  it('covers every Search Console page, secondary accounts included, and nothing else on the host', () => {
    expect(covered('https://search.google.com/search-console/inspect?resource_id=x&id=y')).toBe(true);
    expect(covered('https://search.google.com/search-console?resource_id=x')).toBe(true);
    expect(covered('https://search.google.com/u/1/search-console/inspect?resource_id=x')).toBe(true);
    expect(covered('https://search.google.com/test/rich-results')).toBe(false);
  });
});
