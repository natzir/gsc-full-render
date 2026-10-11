// Google's rendered HTML flattens each shadow root into its host, <style> included, so in the
// render those styles would reach the whole page. Each one is scoped back to its host with
// @scope, down to its slots (the page's own content) and to the components inside it.
// @keyframes, @font-face and @property still work inside @scope; an @import is dropped.
const LIMIT = 'slot, :scope [data-gfr-shadow] > *';

// A host is an element with a <style> of its own that styles :host or holds a slot of its own:
// both only mean something inside a shadow root. Light DOM components, and Elementor's widgets,
// write a <style> inside an element too, and are left alone.
export function scopeShadowStyles(doc) {
  const hosts = new Map();
  let count = 0;
  for (const style of doc.body?.querySelectorAll('style') ?? []) {
    const host = style.parentElement;
    if (!hosts.has(host)) hosts.set(host, host !== doc.body && isHost(host) ? ++count : 0);
    const n = hosts.get(host);
    if (!n) continue;
    host.setAttribute('data-gfr-shadow', String(n));
    style.textContent = `@scope ([data-gfr-shadow="${n}"]) to (${LIMIT}) {\n${hostToScope(style.textContent)}\n}`;
  }
}

function isHost(el) {
  const css = [...el.children].filter(child => child.localName === 'style').map(style => style.textContent).join('\n');
  return /:host\b/.test(css) || ownsSlot(el);
}

// A slot inside a custom element below the host belongs to that component, not to the host.
function ownsSlot(host) {
  return [...host.querySelectorAll('slot')].some(slot => {
    for (let el = slot.parentElement; el !== host; el = el.parentElement) {
      if (el.localName.includes('-')) return false;
    }
    return true;
  });
}

// :host(x) matches the host when it also matches x; :host-context() is left as it was.
function hostToScope(css) {
  return css.replace(/:host\(/g, ':scope:is(').replace(/:host(?![\w(-])/g, ':scope');
}
