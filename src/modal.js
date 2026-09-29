// The larger view (⤢): the full page at real size, with its list of links, filters and CSV. It
// lives in a Shadow DOM so styles never leak either way.
import { DESTINATIONS, DESTINATION_LABELS, DESTINATION_COLORS, REL_TOKENS, CRAWL_ISSUES, ON_LOAD_STATES, URL_FLAGS, UNTAGGED_URL_FLAGS } from './links.js';
import { TEXT } from './text.js';
import { FONT, BUTTON_CSS, FLASH_MS, h, icon } from './dom.js';

const MODAL_CSS = `:host{all:initial}
[hidden]{display:none!important}
.backdrop{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;background:rgba(32,33,36,.6)}
.dialog{display:flex;flex-direction:column;height:calc(100vh - 32px);max-width:calc(100vw - 32px);background:#fff;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.35);overflow:hidden;${FONT};font-size:13px;color:#202124}
.head{display:flex;align-items:center;gap:12px;padding:8px 8px 8px 16px;border-bottom:1px solid #e8eaed}
.title{font-weight:500;margin-right:auto}
.close{border:0;background:transparent;font-size:22px;line-height:1;width:32px;height:32px;padding:0;border-radius:50%;color:#5f6368}
.body{flex:1;min-height:0;display:flex}
.render{position:relative;flex:0 1 auto;min-width:200px;overflow:hidden;background:#fff;border-right:1px solid #e8eaed}
.list{flex:1 1 360px;min-width:260px;min-height:0;display:flex;flex-direction:column}
.filters{display:grid;grid-template-columns:auto 1fr auto 1fr;align-items:center;gap:6px 8px;padding:8px 12px;border-bottom:1px solid #e8eaed;font-size:12px;color:#5f6368}
.filters select{${FONT};font-size:13px;color:#202124;padding:3px 6px;min-width:0;border:1px solid #dadce0;border-radius:4px;background:#fff}
.filters select:disabled{color:#9aa0a6}
.summary{padding:4px 12px;border-bottom:1px solid #e8eaed;font-size:12px;line-height:18px;color:#5f6368}
.summary .clear{border:0;border-radius:0;background:none;padding:0;font-size:12px;color:#1a73e8}
.summary .clear:hover:not(:disabled){background:none;text-decoration:underline}
.rows{flex:1;min-height:0;overflow:auto;margin:0;padding:0;list-style:none}
.row{display:block;width:100%;position:relative;box-sizing:border-box;text-align:left;border:0;border-bottom:1px solid #f1f3f4;border-radius:0;padding:6px 12px 6px 28px;font-weight:400}
.row i{position:absolute;left:12px;top:12px;width:8px;height:8px;border-radius:50%}
.row .text,.row .url{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row .url{font-size:11px;color:#5f6368}
.row.not-visible .text{color:#80868b;font-style:italic}
.row.flash{background:#feefc3}
.tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:3px}
.tag{font-size:10px;line-height:16px;padding:0 6px;border-radius:8px;background:#f1f3f4;color:#3c4043}
.tag.issue{background:#fce8e6;color:#a50e0e}
.tag.rel{background:#fef7e0;color:#8a5a00}
.download{display:inline-flex;align-items:center;gap:4px;border:0;border-radius:0;background:none;padding:0;color:#1a73e8;font-size:12px;font-weight:500}
.download:hover:not(:disabled){background:none;text-decoration:underline}
.download svg{width:16px;height:16px;fill:currentColor}
${BUTTON_CSS}`;

// "⬇ Download links": styled as a link, since it downloads a file rather than changing the view.
function downloadLink(onClick) {
  const link = h('button', { type: 'button', class: 'download', title: TEXT.csv }, icon('M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z'), 'Download links');
  link.addEventListener('click', () => onClick?.());
  return link;
}

const dot = destination => h('i', { style: `background:${DESTINATION_COLORS[destination]}` });

// Width of the link list column shown next to the render.
const LIST_WIDTH = 420;
const REL_LABELS = { follow: 'Follow', nofollow: 'Nofollow', ugc: 'UGC', sponsored: 'Sponsored' };

// The focused element, looking inside shadow roots (the ⤢ button lives in one).
function deepActiveElement() {
  let el = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return el;
}

// Opens with the render only; "Links" adds the link list and the download, and asks the caller
// (onLinksChange) to outline the links in the render. width: width of the render column (the
// page plus room for its scrollbar).
export function openModal({ title, width, links, onClose, onRowClick, onCsv, onLinksChange, onFilterChange }) {
  const previousFocus = deepActiveElement();
  const host = h('div', { 'data-gfr-modal': '' });
  const root = host.attachShadow({ mode: 'open' });

  const closeButton = h('button', { type: 'button', class: 'close', 'aria-label': 'Close' }, '×');
  const viewLinks = h('button', { type: 'button', 'aria-pressed': 'false' }, 'Links');
  const download = downloadLink(onCsv);
  download.hidden = true;
  const render = h('div', { class: 'render' });
  render.style.width = `${width}px`;

  const tag = (text, kind = '') => h('span', { class: `tag ${kind}`.trim() }, text);
  const rows = new Map(); // link id → row button
  // Each link's values per filter, worked out once; its on-load state arrives with markOnLoad.
  const entries = links.map(link => {
    const tags = h('span', { class: 'tags' }, ...link.rel.map(token => tag(token, 'rel')));
    if (!link.crawlable) tags.append(tag(`not crawlable: ${CRAWL_ISSUES[link.issue]}`, 'issue'));
    for (const flag of link.urlFlags) if (!UNTAGGED_URL_FLAGS.has(flag)) tags.append(tag(URL_FLAGS[flag].toLowerCase()));
    const row = h(
      'button',
      { type: 'button', class: 'row', 'data-id': String(link.id) },
      dot(link.destination),
      h('span', { class: 'text' }, link.text || '(no text)'),
      h('span', { class: 'url' }, link.url || link.href || '(no href)'),
      tags,
    );
    row.addEventListener('click', () => onRowClick?.(link.id));
    rows.set(link.id, row);
    const values = {
      destination: [link.destination],
      rel: link.rel.length ? link.rel : ['follow'],
      crawlable: [link.crawlable ? 'yes' : 'no'],
      state: [],
      url: link.urlFlags,
    };
    return { id: link.id, item: h('li', {}, row), values };
  });
  const byId = new Map(entries.map(entry => [entry.id, entry]));

  // Five filters, combined. Each one's options count the links the others leave, so they
  // narrow down together; the page outlines exactly what the list shows.
  const FILTERS = {
    destination: { label: 'Destination', all: 'All', values: DESTINATIONS, text: value => DESTINATION_LABELS[value] },
    rel: { label: 'Rel', all: 'Any', values: ['follow', ...REL_TOKENS], text: value => REL_LABELS[value] },
    crawlable: { label: 'Crawlable', all: 'Any', values: ['yes', 'no'], text: value => (value === 'yes' ? 'Crawlable' : 'Not crawlable') },
    state: { label: 'On load', all: 'Any', values: ON_LOAD_STATES, text: value => TEXT.onLoadLabels[value] },
    url: { label: 'URL', all: 'Any', values: Object.keys(URL_FLAGS), text: value => URL_FLAGS[value] },
  };
  const filters = { destination: null, rel: null, crawlable: null, state: null, url: null };
  let statesKnown = false; // on-load states arrive once the render has loaded (markOnLoad)
  const clearButton = h('button', { type: 'button', class: 'clear' }, 'Clear filters');
  const summary = h('div', { class: 'summary' });
  const filtered = () => Object.values(filters).some(value => value !== null);
  const refresh = () => {
    const active = Object.entries(filters).filter(([, value]) => value !== null);
    // The filters each link fails: it shows when there are none, and counts in a filter's
    // options when that filter is the only one.
    const misses = entries.map(({ values }) => active.filter(([name, value]) => !values[name].includes(value)).map(([name]) => name));
    entries.forEach((entry, index) => (entry.item.hidden = misses[index].length > 0));
    for (const [name, el] of Object.entries(selects)) {
      if (name === 'state' && !statesKnown) continue;
      const counts = new Map();
      let pool = 0;
      entries.forEach(({ values }, index) => {
        const missed = misses[index];
        if (missed.length > 1 || (missed.length === 1 && missed[0] !== name)) return;
        pool++;
        for (const value of values[name]) counts.set(value, (counts.get(value) ?? 0) + 1);
      });
      const { all, text } = FILTERS[name];
      const [first, ...options] = el.options;
      first.textContent = `${all} ${pool}`;
      for (const option of options) {
        const count = counts.get(option.value) ?? 0;
        option.textContent = `${text(option.value)} ${count}`;
        // A chosen option stays selectable even when the other filters leave it empty.
        option.disabled = !count && option.value !== filters[name];
      }
    }
    const shown = entries.filter(entry => !entry.item.hidden).length;
    const total = `${entries.length} link${entries.length === 1 ? '' : 's'}`;
    summary.replaceChildren(...(filtered() ? [`Showing ${shown} of ${entries.length} · `, clearButton] : [total]));
  };
  const applyFilters = () => {
    refresh();
    onFilterChange?.(filtered() ? new Set(entries.filter(entry => !entry.item.hidden).map(entry => entry.id)) : null);
  };
  const selects = {};
  for (const [name, { label, all, values, text }] of Object.entries(FILTERS)) {
    const el = h('select', { name, 'aria-label': label }, h('option', { value: '' }, all), ...values.map(value => h('option', { value }, text(value))));
    el.addEventListener('change', () => {
      filters[name] = el.value || null;
      applyFilters();
    });
    selects[name] = el;
  }
  selects.state.disabled = true;
  const showAll = () => {
    for (const [name, el] of Object.entries(selects)) {
      el.value = '';
      filters[name] = null;
    }
    applyFilters();
  };
  clearButton.addEventListener('click', showAll);
  refresh();

  const list = h(
    'div',
    { class: 'list', hidden: '' },
    h('div', { class: 'filters' }, ...Object.entries(FILTERS).flatMap(([name, { label }]) => [h('span', {}, label), selects[name]])),
    summary,
    h('ol', { class: 'rows' }, ...entries.map(entry => entry.item)),
  );
  const dialog = h(
    'div',
    { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'head' }, h('span', { class: 'title' }, title), viewLinks, download, closeButton),
    h('div', { class: 'body' }, render, list),
  );
  let renderWidth = width;
  let linksOn = false;
  const sizeDialog = () => {
    dialog.style.width = `${linksOn ? renderWidth + LIST_WIDTH : renderWidth}px`;
  };
  sizeDialog();
  const toggleLinks = () => {
    linksOn = !linksOn;
    viewLinks.setAttribute('aria-pressed', String(linksOn));
    list.hidden = download.hidden = !linksOn;
    sizeDialog();
    onLinksChange?.(linksOn);
  };
  viewLinks.addEventListener('click', toggleLinks);
  const backdrop = h('div', { class: 'backdrop' }, dialog);
  root.append(h('style', {}, MODAL_CSS), backdrop);

  let open = true;
  // Esc closes; Tab and Shift+Tab cycle through the dialog's own controls only.
  const focusables = () => [...root.querySelectorAll('button, select')].filter(b => !b.disabled && !b.closest('[hidden]'));
  const onKey = event => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables();
    const index = items.indexOf(root.activeElement);
    const next = event.shiftKey ? (index <= 0 ? items.length - 1 : index - 1) : (index + 1) % items.length;
    event.preventDefault();
    items[next]?.focus();
  };
  function close() {
    if (!open) return;
    open = false;
    document.removeEventListener('keydown', onKey, true);
    host.remove();
    previousFocus?.focus?.();
    onClose?.();
  }
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) close();
  });
  closeButton.addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
  document.body.append(host);
  closeButton.focus();

  const flashTimers = new Map();
  return {
    render,
    close,
    // Once the page's own scrollbar is known: room for the page at real size plus that scrollbar.
    setRenderWidth(px) {
      renderWidth = px;
      render.style.width = `${px}px`;
      sizeDialog();
    },
    // Scrolls the list to a link's row (clearing a filter that hides it) and highlights it.
    showRow(id) {
      const row = rows.get(id);
      if (!row) return;
      if (byId.get(id).item.hidden) showAll();
      row.scrollIntoView({ block: 'center' });
      row.classList.add('flash');
      clearTimeout(flashTimers.get(id));
      flashTimers.set(id, setTimeout(() => row.classList.remove('flash'), FLASH_MS));
    },
    // states: Map of link id → on-load state (see linkOnLoad in links.js).
    markOnLoad(states) {
      for (const [id, state] of states) {
        const row = rows.get(id);
        if (!row) continue;
        byId.get(id).values.state = [state];
        row.classList.toggle('not-visible', state !== 'visible');
        row.title = TEXT.onLoadTitles[state] ?? '';
        if (state !== 'visible') row.querySelector('.tags').append(tag(TEXT.onLoadLabels[state].toLowerCase()));
      }
      statesKnown = true;
      selects.state.disabled = false;
      applyFilters();
    },
  };
}
