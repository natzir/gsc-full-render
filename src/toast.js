// Short messages at the bottom of the page (on, off, errors).
import { FONT, h } from './dom.js';

const TOAST_CSS = `:host{all:initial}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;max-width:calc(100vw - 32px);padding:10px 16px;border-radius:4px;background:#323232;color:#fff;${FONT};font-size:14px;line-height:20px;box-shadow:0 3px 5px rgba(0,0,0,.2)}`;

export function showToast(text, ms = 2500) {
  const host = h('div', { 'data-gfr-toast': '' });
  host.attachShadow({ mode: 'open' }).append(h('style', {}, TOAST_CSS), h('div', { class: 'toast', role: 'status' }, text));
  document.body.append(host);
  setTimeout(() => host.remove(), ms);
  return host;
}
