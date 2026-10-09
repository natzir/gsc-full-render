import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { toBookmarkletUrl, installPage } from '../scripts/bookmarklet-url.mjs';

describe('toBookmarkletUrl', () => {
  it('escapes only what a javascript: URL would otherwise corrupt', () => {
    const code = 'a="50%";\tb=`x\ny`;c="a&b<c>";';
    const url = toBookmarkletUrl(code);
    expect(url).toBe('javascript:a="50%25";%09b=`x%0Ay`;c="a&b<c>";');
    expect(decodeURIComponent(url.slice('javascript:'.length))).toBe(code);
  });
});

describe('installPage', () => {
  it('embeds the exact bookmarklet URL in a draggable link', () => {
    const url = toBookmarkletUrl('alert("a&b<c>")');
    const doc = new DOMParser().parseFromString(installPage(url), 'text/html');
    expect(doc.querySelector('a.bm').getAttribute('href')).toBe(url);
  });

  it('uses the full name for the page and the short one for the bookmark', () => {
    const doc = new DOMParser().parseFromString(installPage('javascript:void 0'), 'text/html');
    expect(doc.title).toBe('Google Search Console Full Fetch & Render');
    expect(doc.querySelector('h1').textContent).toBe('Google Search Console Full Fetch & Render');
    expect(doc.querySelector('a.bm').textContent).toBe('GSC Full Render');
  });
});

describe('the GitHub Pages copy', () => {
  const read = path => readFileSync(`${import.meta.dirname}/../${path}`, 'utf8');

  it('is the install page as built, so the bookmarklet people drag from the web is the current one', () => {
    expect(read('docs/index.html')).toBe(read('dist/install.html'));
  });

  it('is served as it is, without Jekyll', () => {
    expect(existsSync(`${import.meta.dirname}/../docs/.nojekyll`)).toBe(true);
  });
});
