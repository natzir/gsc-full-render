import { describe, it, expect, vi, afterEach } from 'vitest';
import { linksToCsv, csvFilename, downloadCsv } from '../src/csv.js';

const links = [
  {
    id: 0,
    tag: 'a',
    text: 'Hotel, "Madrid"',
    href: '/a',
    url: 'https://www.shop.example/a',
    destination: 'internal',
    rel: ['nofollow', 'ugc'],
    crawlable: true,
    issue: '',
    urlFlags: ['params', 'relative'],
  },
  { id: 1, tag: 'div', text: '=HYPERLINK("x")', href: '', url: '', destination: 'none', rel: [], crawlable: false, issue: 'not-a-link', urlFlags: [] },
];

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('linksToCsv', () => {
  it('writes one column per dimension, quoting where needed', () => {
    const csv = linksToCsv(links, new Map([[0, 'visible'], [1, 'collapsed']]));
    const lines = csv.replace(/^﻿/, '').split('\r\n');
    expect(lines[0]).toBe('text,url,href,destination,rel,crawlable,crawl_issue,url_flags,on_load,tag');
    expect(lines[1]).toBe('"Hotel, ""Madrid""",https://www.shop.example/a,/a,internal,nofollow ugc,yes,,params relative,visible,a');
    expect(lines[3]).toBe('');
  });

  it('starts with a BOM so spreadsheets read it as UTF-8', () => {
    expect(linksToCsv([]).startsWith('﻿')).toBe(true);
  });

  it('defuses cells that a spreadsheet would run as formulas, and spells out crawl issues', () => {
    const row = linksToCsv(links, new Map()).split('\r\n')[2];
    expect(row).toBe(`"'=HYPERLINK(""x"")",,,,follow,no,not an <a> (onclick/data-href),,,div`);
  });
});

describe('csvFilename', () => {
  it('names the file after the host and the date', () => {
    expect(csvFilename('https://www.shop.example/city/madrid.html', new Date(2026, 5, 15))).toBe('links-www.shop.example-2026-06-15.csv');
    expect(csvFilename(null, new Date(2026, 0, 5))).toBe('links-page-2026-01-05.csv');
  });
});

describe('downloadCsv', () => {
  it('downloads the text through a temporary link', () => {
    URL.createObjectURL = vi.fn(() => 'blob:csv');
    URL.revokeObjectURL = vi.fn();
    const clicked = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      clicked.push({ href: this.getAttribute('href'), download: this.download, marked: this.hasAttribute('data-gfr-download') });
    });
    downloadCsv('a,b\r\n', 'links.csv');
    expect(clicked).toEqual([{ href: 'blob:csv', download: 'links.csv', marked: true }]);
    expect(document.querySelector('[data-gfr-download]')).toBeNull();
  });
});
