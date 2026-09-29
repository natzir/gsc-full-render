// Small DOM helpers shared by the panel, the larger view and the toasts. No innerHTML anywhere:
// Search Console enforces Trusted Types.

export const FONT = 'font-family:"Google Sans",Roboto,Arial,sans-serif';

// How long a link and its row stay highlighted after a click.
export const FLASH_MS = 1600;

export const BUTTON_CSS = `button{${FONT};font-size:13px;font-weight:500;color:#3c4043;background:#fff;border:1px solid #dadce0;border-radius:16px;padding:4px 12px;cursor:pointer}
button:hover:not(:disabled){background:#f1f3f4}
button:focus-visible{outline:2px solid #1a73e8;outline-offset:1px}
button[aria-pressed="true"]{background:#e8f0fe;color:#1967d2}
button:disabled{color:#9aa0a6;cursor:not-allowed}`;

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  el.append(...children);
  return el;
}

// A 24×24 SVG icon with one path, hidden from assistive technology (the button carries the label).
export function icon(d) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}
