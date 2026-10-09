import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { MENU_TITLE } from '../src/extension/worker.js';

const file = name => `${import.meta.dirname}/../extension/${name}`;
const doc = new DOMParser().parseFromString(readFileSync(file('welcome.html'), 'utf8'), 'text/html');
const text = doc.body.textContent.replace(/\s+/g, ' ');

describe('welcome page', () => {
  it('names the right-click setting exactly as the menu does', () => {
    expect(text).toContain(`“${MENU_TITLE}”`);
  });

  it('says what to pin by the extension\'s store name', () => {
    expect(text).toContain('“GSC Full Fetch & Render as Googlebot by Natzir”');
  });

  it('links the post, the README and natzir.com', () => {
    expect([...doc.querySelectorAll('a')].map(a => a.getAttribute('href'))).toEqual([
      'https://natzir.com/posicionamiento-buscadores/gsc-full-fetch-render-googlebot/',
      'https://github.com/natzir/gsc-full-render#readme',
      'https://natzir.com',
    ]);
  });

  it('loads only files the extension has, and no script', () => {
    const local = [...doc.querySelectorAll('link[href], img[src]')].map(el => el.getAttribute('href') ?? el.getAttribute('src'));
    expect(local).toEqual(['tokens.css', 'welcome.css', 'icons/32.png']);
    for (const name of local) expect(existsSync(file(name))).toBe(true);
    expect(doc.querySelector('script')).toBeNull();
  });
});
