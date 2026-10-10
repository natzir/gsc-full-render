// The full list of what Googlebot requested for the page, so loading="lazy" images it never
// requested can be left out (see leaveLazyNotRequested). More info › Page resources lists only
// what didn't load: what did shows with the second option of its filter on, and Search Console
// builds those rows only then. So the filter is switched on, the list read and the filter switched
// back, with menus hidden meanwhile.
import { readResourceRows, resourceTotal } from './source.js';

const WAIT_MS = 3000;
const STEP_MS = 20;
// Right after opening, Search Console's menu ignores presses (about 400 ms): pressed again this often.
const PRESS_MS = 150;
// Its menu closes with an animation: kept hidden until it has.
const CLOSING_MS = 300;
const HIDING = 'data-gfr-hiding-menu';

let queue = Promise.resolve();

// infoPanel: the More info tab panel. Resolves to every URL Page resources lists, loaded or not,
// as soon as it is read (the filter is switched back after), or to null when that full list can't
// be read: no count yet, no filter, or rows that don't add up to Search Console's own total. One
// read at a time: two views must not switch the filter at once.
export function readRequested(infoPanel, { wait = WAIT_MS } = {}) {
  let found;
  const list = new Promise(resolve => (found = resolve));
  const read = queue.then(() => readList(infoPanel, wait, found));
  queue = read.catch(error => console.error('[GSC Full Render]', error));
  queue.then(() => found(null)); // a read that ended without a list
  return list;
}

async function readList(infoPanel, wait, found) {
  const total = resourceTotal(infoPanel);
  if (total === null) return;
  const urls = () => readResourceRows(infoPanel).map(row => row.url);
  const before = urls().length;
  if (before === total) return found(urls());
  if (!resourceFilter(infoPanel)) return;
  const root = infoPanel.ownerDocument.documentElement;
  const style = hideMenus(root);
  const opened = [];
  try {
    if (!(await switchLoaded(infoPanel, wait, opened))) return;
    found((await until(() => urls().length === total, wait)) ? urls() : null);
    // Switched back only if it changed: a menu that didn't respond is as it was.
    if (urls().length !== before) {
      await switchLoaded(infoPanel, wait, opened);
      await until(() => urls().length === before, wait);
    }
  } finally {
    opened.forEach(closeMenu);
    await sleep(CLOSING_MS);
    style.remove();
    root.removeAttribute(HIDING);
  }
}

// Page resources' filter: the menu button nearest its "N/M couldn't be loaded" count (the
// JavaScript console's is further away). Not its menu: Search Console moves that out of the button
// once opened, and out of the page once closed.
function resourceFilter(infoPanel) {
  const distances = [...infoPanel.querySelectorAll('[aria-haspopup]')].map(button => [button, countDistance(button, infoPanel)]);
  const nearest = Math.min(...distances.map(([, distance]) => distance));
  const filters = distances.filter(([, distance]) => distance === nearest && distance < Infinity);
  return filters.length === 1 ? filters[0][0] : null;
}

function countDistance(el, infoPanel) {
  let distance = 0;
  for (let node = el.parentElement; node && infoPanel.contains(node); node = node.parentElement, distance++) {
    if (resourceTotal(node) !== null) return distance;
  }
  return Infinity;
}

// Opens Page resources' filter and toggles its second option, "Resources that loaded". The filter
// is found anew each time: Search Console renders a new one with the list, and the old one no
// longer responds. False when no menu with two options opened, or it never took the press.
// opened: collects the menus it opened, to close any left open.
async function switchLoaded(infoPanel, wait, opened) {
  const filter = resourceFilter(infoPanel);
  if (!filter) return false;
  filter.click();
  let menu = null;
  await until(() => (menu = openMenu(filter)), wait);
  if (!menu) return false;
  opened.push({ filter, menu });
  const options = menu.querySelectorAll('[role="menuitem"]');
  if (options.length !== 2) return false;
  const closed = () => !isOpen({ filter, menu });
  for (let waited = 0; !closed(); waited += PRESS_MS) {
    if (waited >= wait) return false;
    press(options[1]);
    await until(closed, PRESS_MS);
  }
  return true;
}

// The filter's menu while open: Search Console moves it to the end of the page and marks it with
// the button's id (jsowner).
function openMenu(filter) {
  if (filter.getAttribute('aria-expanded') !== 'true') return null;
  const owned = filter.id && filter.ownerDocument.querySelector(`[role="menu"][jsowner="${filter.id.replace(/["\\]/g, '\\$&')}"]`);
  return owned || filter.querySelector('[role="menu"]');
}

const isOpen = ({ filter, menu }) => menu.isConnected && filter.isConnected && filter.getAttribute('aria-expanded') === 'true';

function closeMenu(open) {
  if (!isOpen(open)) return;
  const { KeyboardEvent } = open.menu.ownerDocument.defaultView;
  for (const type of ['keydown', 'keyup']) {
    open.menu.dispatchEvent(new KeyboardEvent(type, { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true, composed: true }));
  }
}

// Search Console's menu options ignore a bare click(): they act on the whole press.
function press(el) {
  const view = el.ownerDocument.defaultView;
  const { left, top } = el.getBoundingClientRect();
  const init = { bubbles: true, cancelable: true, composed: true, button: 0, clientX: left + 1, clientY: top + 1, pointerType: 'mouse', isPrimary: true };
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    const Event = type.startsWith('pointer') ? (view.PointerEvent ?? view.MouseEvent) : view.MouseEvent;
    el.dispatchEvent(new Event(type, init));
  }
}

function hideMenus(root) {
  root.setAttribute(HIDING, '');
  const style = root.ownerDocument.createElement('style');
  style.textContent = `[${HIDING}] [role="menu"]{opacity:0!important}`;
  root.ownerDocument.head.append(style);
  return style;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(done, wait) {
  for (let waited = 0; !done(); waited += STEP_MS) {
    if (waited >= wait) return false;
    await sleep(STEP_MS);
  }
  return true;
}
