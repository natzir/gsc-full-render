// The view laid over the Screenshot tab: Screenshot | Full page, ⤢, the note and the list of what
// Search Console couldn't load. It lives in a Shadow DOM so styles never leak either way.
import { TEXT, explainReason } from './text.js';
import { FONT, BUTTON_CSS, h, icon } from './dom.js';

const VIEWS = ['google', 'full'];
const VIEW_LABELS = { google: 'Screenshot', full: 'Full page' };

// Height of Google's footer ("Rendered with …"); our button bar takes its place.
const BAR_HEIGHT = 49;

// The viewport sits where Google draws its screenshot image and scrollbar: 16 px from each side.
const PANEL_CSS = `:host{all:initial}
[hidden]{display:none!important}
.wrap{display:flex;flex-direction:column;height:100%;background:#fff;${FONT};font-size:13px;color:#202124}
.stage{flex:1;min-height:0;display:flex;flex-direction:column}
.caption{position:relative;z-index:3;display:flex;flex-wrap:wrap;align-items:baseline;column-gap:6px;padding:6px 16px;font-size:11px;line-height:16px;color:#5f6368}
.by{margin-left:auto;color:#80868b;text-decoration:none}
.by:hover{color:#1a73e8;text-decoration:underline}
.catcher{position:absolute;inset:0;z-index:2}
.unloaded{border:0;border-radius:0;background:none;padding:0;font-size:11px;font-weight:500;color:#b06000}
.unloaded:hover:not(:disabled){background:none;text-decoration:underline}
.details{position:absolute;left:8px;right:8px;top:100%;max-height:320px;overflow:auto;padding:8px 12px;background:#fff;border:1px solid #dadce0;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,.2);font-size:12px;line-height:16px;color:#3c4043}
.details p{margin:0 24px 4px 0}
.details .close{position:absolute;top:4px;right:4px;border:0;background:none;padding:0;width:24px;height:24px;border-radius:50%;font-size:18px;line-height:1;color:#5f6368}
.details ul{margin:0;padding:0;list-style:none}
.details li{padding:6px 0;border-top:1px solid #f1f3f4}
.details .tag{font-size:10px;padding:0 6px;margin-right:4px;border-radius:8px;background:#f1f3f4}
.details .effect,.details .url{display:block;color:#5f6368}
.details .url{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.viewport{position:relative;flex:1;min-height:0;overflow:hidden;margin:0 16px}
.status{position:relative;z-index:1;padding:24px 0;background:#fff;color:#5f6368;text-align:center}
.bar{flex:none;box-sizing:border-box;height:${BAR_HEIGHT}px;display:flex;align-items:center;gap:8px;padding:0 8px 0 16px;border-top:1px solid #e8eaed;background:#fff}
.seg{display:inline-flex;border:1px solid #dadce0;border-radius:16px;overflow:hidden}
.seg button{border:0;border-radius:0}
.seg button+button{border-left:1px solid #dadce0}
.open{margin-left:auto;display:inline-flex;align-items:center;padding:5px 8px}
.open svg{width:16px;height:16px;fill:currentColor}
.google .stage{display:none}
.error{margin:8px;padding:10px 12px;border-radius:8px;background:#fce8e6;color:#a50e0e}
${BUTTON_CSS}`;

// "⤢": opens the full page larger.
function openButton() {
  const expand = icon('M4 4h6v2H7.4l4.3 4.3-1.4 1.4L6 7.4V10H4zm16 16h-6v-2h2.6l-4.3-4.3 1.4-1.4 4.3 4.3V14h2z');
  return h('button', { type: 'button', class: 'open', 'aria-label': TEXT.openLabel, title: TEXT.openTitle }, expand);
}

// Sets one inline style property and returns a function that puts it back, leaving any other
// inline style Search Console may have set in the meantime untouched.
function setStyle(el, property, value, priority = '') {
  const hadAttribute = el.hasAttribute('style');
  const previous = el.style.getPropertyValue(property);
  const previousPriority = el.style.getPropertyPriority(property);
  el.style.setProperty(property, value, priority);
  return () => {
    if (previous) el.style.setProperty(property, previous, previousPriority);
    else el.style.removeProperty(property);
    if (!hadAttribute && el.getAttribute('style') === '') el.removeAttribute('style');
  };
}

// The view is laid over Search Console's Screenshot tab without taking part in its layout, so
// the side panel keeps the size Google's own screenshot gives it.
// Links are handled at real size only: at panel size their outlines are hard to read.
// onOpen(): open the full page larger.
export function mountPanelUi(shotPanel, { live, onOpen }) {
  const host = h('div', { 'data-gfr-host': '' });
  Object.assign(host.style, { position: 'absolute', top: '0px', right: '0px', bottom: '0px', left: '0px', zIndex: '2' });
  const root = host.attachShadow({ mode: 'open' });

  // Screenshot | Full page, then ⤢ to open the full page larger.
  const buttons = {};
  for (const view of VIEWS) {
    buttons[view] = h('button', { type: 'button', 'aria-pressed': 'false', title: TEXT.views[view] }, VIEW_LABELS[view]);
    buttons[view].addEventListener('click', () => setMode(view));
  }
  const open = openButton();
  const note = h('span', { class: 'note' }, TEXT.note);
  const unloadedButton = h('button', { type: 'button', class: 'unloaded', 'aria-expanded': 'false', title: TEXT.unloadedTitle, hidden: '' });
  const detailsClose = h('button', { type: 'button', class: 'close', 'aria-label': 'Close' }, '×');
  const details = h('div', { class: 'details', hidden: '' });
  const status = h('div', { class: 'status', role: 'status' });
  // While the list is open, takes the clicks on the render, which happen inside its frame.
  const catcher = h('div', { class: 'catcher', hidden: '' });
  const viewport = h('div', { class: 'viewport' }, status, catcher);
  const bar = h(
    'div',
    { class: 'bar' },
    h('div', { class: 'seg', role: 'group', 'aria-label': 'View' }, ...VIEWS.map(view => buttons[view])),
    open,
  );
  const credit = h('a', { class: 'by', href: 'https://natzir.com/', target: '_blank', rel: 'noopener' }, 'by natzir.com');
  const caption = h('div', { class: 'caption' }, note, unloadedButton, credit, details);
  const wrap = h('div', { class: 'wrap' }, h('div', { class: 'stage' }, caption, viewport), bar);
  root.append(h('style', {}, PANEL_CSS), wrap);

  if (live) {
    // Our bar covers Google's footer; keep its text ("Rendered with …") on the Screenshot button.
    buttons.google.title = `${TEXT.views.google} · ${shotPanel.textContent.replace(/\s+/g, ' ').trim()}`;
  } else {
    buttons.google.disabled = true;
    buttons.google.title = TEXT.googleDisabled;
  }

  let mode = 'full';
  let prepared = false;
  let leftOut = false; // something Search Console couldn't load was left out of the full page
  let loaded = null; // what the shown render reported once loaded (see showLoaded)
  const restorers = new Map(); // Google's element → puts its visibility back

  const hideGoogle = () => {
    for (const child of shotPanel.children) {
      if (child === host || restorers.has(child)) continue;
      restorers.set(child, setStyle(child, 'visibility', 'hidden', 'important'));
    }
  };
  const restoreGoogle = () => {
    restorers.forEach(restore => restore());
    restorers.clear();
  };
  const renderNote = () => {
    const parts = [leftOut ? TEXT.notes.leftOut : TEXT.note];
    const { failedStylesheets = 0, failedFonts = 0, unlocked = false } = loaded ?? {};
    if (failedStylesheets) parts.push(`${failedStylesheets} stylesheet${failedStylesheets === 1 ? '' : 's'} failed to load`);
    if (failedFonts) parts.push(`${failedFonts} font${failedFonts === 1 ? '' : 's'} failed to load`);
    if (unlocked) parts.push(TEXT.unlocked);
    note.textContent = parts.join(' · ');
  };
  const setMode = next => {
    mode = next;
    for (const view of VIEWS) buttons[view].setAttribute('aria-pressed', String(view === next));
    const full = next === 'full';
    wrap.classList.toggle('google', !full);
    // In Screenshot mode only the bar remains, over Google's footer.
    host.style.top = full ? '0px' : 'auto';
    host.style.height = full ? '' : `${BAR_HEIGHT}px`;
    if (full) hideGoogle();
    else restoreGoogle();
    open.disabled = !full || !prepared;
    renderNote();
  };

  // What Search Console lists as not loaded, then the lazy images that never loaded.
  const showUnloaded = ({ count, resources }, lazy) => {
    const total = count + lazy.length;
    unloadedButton.hidden = !total;
    if (!total) return;
    unloadedButton.textContent = `⚠ ${total} not loaded`;
    const item = ({ reason, type, url, effect }) =>
      h(
        'li',
        {},
        ...(type ? [h('span', { class: 'tag' }, type)] : []),
        h('span', { class: 'why' }, explainReason(reason)),
        h('span', { class: 'effect' }, TEXT.effects[effect]),
        h('span', { class: 'url', title: url }, url),
      );
    const listed = resources
      ? [h('p', {}, TEXT.unloadedIntro(count)), h('ul', {}, ...resources.map(item))]
      : [h('p', {}, TEXT.unloadedUnread(count))];
    const lazyItem = url => item({ reason: TEXT.reasons.lazy, type: 'Image', url, effect: 'lazy' });
    details.replaceChildren(
      detailsClose,
      ...(count ? listed : []),
      ...(lazy.length ? [h('p', {}, TEXT.lazyIntro(lazy.length)), h('ul', {}, ...lazy.map(lazyItem))] : []),
    );
  };
  // The list closes with its × button, Esc, or a click anywhere outside it.
  const onOutside = event => {
    const path = event.composedPath();
    if (!path.includes(details) && !path.includes(unloadedButton)) showDetails(false);
  };
  const onEscape = event => {
    if (event.key === 'Escape') showDetails(false);
  };
  const showDetails = open => {
    details.hidden = catcher.hidden = !open;
    unloadedButton.setAttribute('aria-expanded', String(open));
    const listen = open ? 'addEventListener' : 'removeEventListener';
    document[listen]('pointerdown', onOutside, true);
    document[listen]('keydown', onEscape, true);
  };
  unloadedButton.addEventListener('click', () => showDetails(details.hidden));
  detailsClose.addEventListener('click', () => showDetails(false));

  // Search Console may re-render the tab's children; keep new ones hidden while a render shows.
  const childWatcher = new MutationObserver(() => {
    if (mode !== 'google') hideGoogle();
  });

  open.addEventListener('click', () => onOpen?.());

  const restorePanel = setStyle(shotPanel, 'position', 'relative');
  shotPanel.prepend(host);
  childWatcher.observe(shotPanel, { childList: true });
  setMode('full');

  return {
    viewport,
    showLoading(text = TEXT.loading) {
      loaded = null;
      renderNote();
      status.textContent = text;
      status.hidden = false;
    },
    // leftOut: something was left out of the full page; unloaded: { count, resources } where each
    // resource has its effect (see leaveUnloaded), or resources is null when unreadable; lazy:
    // URLs of lazy images that never loaded.
    showPrepared({ leftOut: left = false, unloaded = { count: 0, resources: [] }, lazy = [] }) {
      prepared = true;
      leftOut = left;
      showUnloaded(unloaded, lazy);
      buttons.full.title = leftOut ? `${TEXT.views.full} · ${TEXT.views.leftOut}` : TEXT.views.full;
      setMode(mode);
    },
    // Reports on the render being shown: stylesheets and fonts that failed, scroll unlocked.
    showLoaded(report) {
      loaded = report;
      status.hidden = true;
      renderNote();
    },
    showError(message = TEXT.noHtml) {
      setMode('google');
      host.style.height = 'auto';
      wrap.replaceChildren(h('div', { class: 'error', role: 'alert' }, message));
    },
    showEmpty() {
      // The editor is there but empty (e.g. the live test failed): leave Search Console as is.
      setMode('google');
      host.style.display = 'none'; // not even the bar: nothing may catch clicks on Google's footer
    },
    destroy() {
      showDetails(false);
      childWatcher.disconnect();
      restoreGoogle();
      host.remove();
      restorePanel();
    },
  };
}
