// Builds a minimal Search Console page with a URL Inspection side panel, matching Search
// Console's structure: a 3-tab tablist whose tabs point (aria-controls) at the
// HTML, Screenshot and More info tab panels. The HTML panel holds a CodeMirror 5 editor.
// More info holds sub-views; "Page resources" lists what Googlebot couldn't load, one row per
// resource: [icon, reason, type] then the URL. JavaScript console rows have three parts. Icons
// are icon-font glyphs: a private-use character that shows no text. Each list has a filter: a menu
// button holding its menu; Page resources' has two options (didn't load, loaded), the console's
// one per message level. total: how many couldn't be loaded, of: how many resources in all.
const RESOURCE_FILTER =
  '<div role="button" aria-label="Filter resources" aria-haspopup="true" aria-expanded="false"><div role="menu"><div role="menuitem">Resources that didn\'t load</div><div role="menuitem">Resources that loaded</div></div></div>';

export function moreInfo(unloaded = [], total = unloaded.length, of = 167) {
  const rows = unloaded
    .map(({ reason, type, url }) => `<div class="row"><div class="cells"><span class="icon">&#xe88e;</span><div>${reason}</div><div>${type}</div></div><div>${url}</div></div>`)
    .join('');
  return `
    <div class="views">
      <div class="summary"><div>Page resources</div><div>${total}/${of} couldn't be loaded</div></div>
      <div class="resources">
        <div class="head"><span>arrow_back</span><div>Page resources</div><div>${total}/${of} couldn't be loaded</div></div>
        ${RESOURCE_FILTER}
        <div class="list"><div class="rows">${rows}</div></div>
      </div>
      <div class="console">
        <div role="button" aria-label="Filter messages" aria-haspopup="true" aria-expanded="false"><div role="menu">${['Error', 'Warning', 'Info', 'Log', 'Debug'].map(level => `<div role="menuitem">${level}</div>`).join('')}</div></div>
        <div class="row"><div class="cells"><span class="icon"></span><div>Error</div><div>00:03.000</div></div><div>Failed to load https://cdn.example/a.js</div><div>https://cdn.example/a.js</div></div>
      </div>
    </div>`;
}

export function buildScPage({
  html = '<!DOCTYPE html>\n<html><head></head><body><a href="/a">a</a></body></html>',
  screenshot = true,
  footer = 'Rendered with Google Inspection Tool smartphone',
  url = 'https://www.shop.example/city/madrid.html',
  editor = true,
  open = true,
  info = moreInfo(),
  loaded = [],
  respond = true,
  ignoreFor = 0,
} = {}) {
  document.body.innerHTML = `
    <div class="header"><div class="url">${url}</div></div>
    <div class="side">
      <div role="tablist">
        <div role="tab" aria-controls="p-html">html</div>
        <div role="tab" aria-controls="p-shot">screenshot</div>
        <div role="tab" aria-controls="p-info">more info</div>
      </div>
      <span role="tabpanel" id="p-html">${editor ? '<div class="CodeMirror"><span>https://inside.example/</span></div>' : ''}</span>
      <span role="tabpanel" id="p-shot"><div class="shot">${screenshot ? '<img src="data:image/png;base64,AAAA" alt="">' : '<div>Screenshot is available only in live test</div>'}</div><div class="foot">${footer}</div></span>
      <span role="tabpanel" id="p-info">${info}</span>
    </div>`;
  let value = html;
  let generation = 1;
  let doc = {};
  const cm = editor
    ? {
        getValue: () => value,
        lineCount: () => value.split('\n').length,
        changeGeneration: () => generation,
        getDoc: () => doc,
        setValue(next) {
          value = next;
          generation += 1;
        },
        // Like CodeMirror's swapDoc: a new document with its own (reset) history.
        swapDoc(next) {
          value = next;
          doc = {};
          generation = 1;
        },
      }
    : null;
  if (cm) document.querySelector('.CodeMirror').CodeMirror = cm;
  // jsdom has no layout: an open panel is one whose tablist reports a box.
  if (open) document.querySelector('[role="tablist"]').getClientRects = () => [{ width: 400, height: 48 }];
  return {
    htmlPanel: document.getElementById('p-html'),
    shotPanel: document.getElementById('p-shot'),
    infoPanel: document.getElementById('p-info'),
    editor: cm,
    filterLog: wireResourceFilter({ loaded, respond, ignoreFor }),
  };
}

// Page resources' filter, as Search Console's behaves: a click on the button opens its menu,
// moved out of the button to the end of the page and marked with the button's id (jsowner).
// Pressing its second option closes the menu and, a moment later, switches the rows of what did
// load on or off and renders the list again, with a new filter. Escape closes the menu. Like
// Search Console's, the option ignores a bare click() (it acts on the mouse release) and any press
// in the first ignoreFor ms after the menu opened. loaded: [{ type, url }] those rows; respond:
// false for options that do nothing. Returns what happened.
function wireResourceFilter({ loaded, respond, ignoreFor }) {
  const log = [];
  let renders = 0;
  const wire = filter => {
    const menu = filter.querySelector('[role="menu"]');
    let openedAt = 0;
    const close = () => {
      filter.setAttribute('aria-expanded', 'false');
      menu.remove();
    };
    filter.addEventListener('click', event => {
      // Search Console's handlers are delegated from the page: a button it replaced gets nothing.
      if (event.target !== filter || !filter.isConnected) return;
      filter.id ||= `ow${++renders}`;
      menu.setAttribute('jsowner', filter.id);
      document.body.append(menu);
      filter.setAttribute('aria-expanded', 'true');
      openedAt = Date.now();
      log.push('open');
    });
    menu.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      close();
      log.push('closed');
    });
    menu.querySelectorAll('[role="menuitem"]')[1].addEventListener('mouseup', () => {
      if (Date.now() - openedAt < ignoreFor) {
        log.push('ignored');
        return;
      }
      close();
      if (!respond) return;
      setTimeout(() => {
        const rows = document.querySelector('#p-info .rows');
        const shown = rows.querySelectorAll('.loaded');
        if (shown.length) {
          shown.forEach(row => row.remove());
          log.push('loaded off');
        } else {
          rows.insertAdjacentHTML(
            'beforeend',
            loaded
              .map(({ type, url }) => `<div class="row loaded"><div class="cells"><span class="icon">&#xe876;</span><div>Loaded</div><div>${type}</div></div><div>${url}</div></div>`)
              .join(''),
          );
          log.push('loaded on');
        }
        const fresh = document.createRange().createContextualFragment(RESOURCE_FILTER).firstElementChild;
        filter.replaceWith(fresh);
        wire(fresh);
      }, 10);
    });
  };
  const filter = document.querySelector('#p-info .resources [aria-haspopup]');
  if (filter) wire(filter);
  return log;
}
