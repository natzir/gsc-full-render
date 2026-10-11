// Google's rendered HTML flattens each shadow root into its host, <style> included, so in the
// render those styles would reach the whole page. Each one is scoped back to its host with
// @scope, down to its slots (the page's own content) and to the components inside it.
const LIMIT = 'slot, [data-gfr-shadow] > *';

// A host is an element with a <style> of its own that is a custom element or holds a slot of its
// own; a plain element with only a <style> is left alone, as Elementor writes its widgets.
export function scopeShadowStyles(doc) {
  const hosts = new Map();
  for (const style of doc.body?.querySelectorAll('style') ?? []) {
    const host = style.parentElement;
    if (host === doc.body || !(host.localName.includes('-') || ownsSlot(host))) continue;
    if (!hosts.has(host)) {
      hosts.set(host, hosts.size + 1);
      host.setAttribute('data-gfr-shadow', String(hosts.size));
    }
    const root = `[data-gfr-shadow="${hosts.get(host)}"]`;
    style.textContent = `@scope (${root}) to (${LIMIT}) {\n${hostToScope(style.textContent)}\n}`;
  }
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
