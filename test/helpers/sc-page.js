// Builds a minimal Search Console page with a URL Inspection side panel, matching Search
// Console's structure: a 3-tab tablist whose tabs point (aria-controls) at the
// HTML, Screenshot and More info tab panels. The HTML panel holds a CodeMirror 5 editor.
// More info holds sub-views; "Page resources" lists what Googlebot couldn't load, one row per
// resource: [icon, reason, type] then the URL. JavaScript console rows have three parts. Icons
// are icon-font glyphs: a private-use character that shows no text.
export function moreInfo(unloaded = [], total = unloaded.length) {
  const rows = unloaded
    .map(({ reason, type, url }) => `<div class="row"><div class="cells"><span class="icon">&#xe88e;</span><div>${reason}</div><div>${type}</div></div><div>${url}</div></div>`)
    .join('');
  return `
    <div class="views">
      <div class="summary"><div>Page resources</div><div>${total}/167 couldn't be loaded</div></div>
      <div class="resources">
        <div class="head"><span>arrow_back</span><div>Page resources</div><div>${total}/167 couldn't be loaded</div></div>
        <div class="list"><div class="rows">${rows}</div></div>
      </div>
      <div class="console">
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
  };
}
