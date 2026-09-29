// The link list as a CSV download.
import { CRAWL_ISSUES } from './links.js';

const COLUMNS = ['text', 'url', 'href', 'destination', 'rel', 'crawlable', 'crawl_issue', 'url_flags', 'on_load', 'tag'];

// A cell starting with one of these would run as a formula when the CSV is opened in a
// spreadsheet; anchor texts come from third-party pages, so they are prefixed with '.
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value) {
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// onLoad: Map of link id → on-load state (see linkOnLoad); links without an entry get an empty cell.
export function linksToCsv(links, onLoad = new Map()) {
  const rows = links.map(link => [
    link.text,
    link.url,
    link.href,
    link.destination === 'none' ? '' : link.destination,
    link.rel.length ? link.rel.join(' ') : 'follow',
    link.crawlable ? 'yes' : 'no',
    link.issue ? CRAWL_ISSUES[link.issue] : '',
    link.urlFlags.join(' '),
    onLoad.get(link.id) ?? '',
    link.tag,
  ]);
  return `﻿${[COLUMNS, ...rows].map(row => row.map(cell).join(',')).join('\r\n')}\r\n`;
}

export function csvFilename(pageUrl, date = new Date()) {
  let host = 'page';
  try {
    host = new URL(pageUrl).hostname.replace(/[^a-z0-9.-]/gi, '-') || host;
  } catch {
    // no usable page URL: keep the generic name
  }
  const pad = n => String(n).padStart(2, '0');
  return `links-${host}-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.csv`;
}

export function downloadCsv(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.setAttribute('data-gfr-download', '');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
