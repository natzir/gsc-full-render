// Reads what we need from Search Console's URL Inspection side panel.
// Detection is structural (tablist + aria-controls), not text-based, so any UI language works.
import { httpUrl } from './urls.js';

const DEFAULT_WIDTH = { smartphone: 412, desktop: 1024 };

const DESKTOP_CRAWLER = /desktop|escritorio|ordenador|ordinateur|computador|computer/i;
// A URL as Search Console shows it: decoded, so it can contain spaces.
const URL_TEXT = /^https?:\/\/\S.*$/i;

export function findInspectionPanels(doc) {
  const panels = [];
  for (const tablist of doc.querySelectorAll('[role="tablist"]')) {
    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    if (tabs.length !== 3) continue;
    const [htmlPanel, shotPanel, infoPanel] = tabs.map(tab => controlledPanel(tab, tablist));
    if (!htmlPanel || !shotPanel) continue;
    const hasEditor = !!htmlPanel.querySelector('.CodeMirror');
    const hasScreenshot = !!shotPanel.querySelector('img[src^="data:image"]');
    if (hasEditor || hasScreenshot) panels.push({ tabs, htmlPanel, shotPanel, infoPanel });
  }
  return panels;
}

// Search Console gives a new inspection's tab panels the same ids as an earlier one's, which it
// keeps in the page, hidden, and which can come first: the panel a tab
// controls is the nearest element with that id, not the first in the document.
function controlledPanel(tab, tablist) {
  const id = tab.getAttribute('aria-controls');
  if (!id) return null;
  const selector = `[id="${id.replace(/["\\]/g, '\\$&')}"]`;
  for (let node = tablist.parentElement; node; node = node.parentElement) {
    const panel = node.querySelector(selector);
    if (panel) return panel;
  }
  return null;
}

// Search Console keeps panels of earlier inspections in the page, hidden; only a panel whose
// tab bar has a box, and is not visibility:hidden, is actually open. A closed side panel is slid
// out of the window and hidden, but keeps its box.
export function isPanelOpen({ tabs }) {
  const tablist = tabs[0].closest('[role="tablist"]');
  const view = tablist.ownerDocument.defaultView;
  return tablist.getClientRects().length > 0 && view.getComputedStyle(tablist).visibility !== 'hidden';
}

// The inspected URL is the first URL-like text on screen outside navigation and the panels.
// Search Console keeps earlier inspections in the page, hidden, so a hidden match is only a
// fallback (the first match in document order can be a hidden old view).
export function findInspectedUrl(doc) {
  let hidden = null;
  for (const el of doc.querySelectorAll('div, span')) {
    if (el.childElementCount || el.closest('.CodeMirror, nav, [role="navigation"], [role="tabpanel"]')) continue;
    const text = el.textContent.trim();
    if (!URL_TEXT.test(text)) continue;
    if (el.getClientRects().length) return text;
    hidden ??= text;
  }
  return hidden;
}

// More info › Page resources lists what Googlebot couldn't load, one row per resource: a
// part holding [icon, reason, type], then the URL. Console messages
// have three parts and are skipped. count: Search Console's own "3/167" count; resources is null
// when the rows don't match it (its filter can list the resources that did load, or the rows
// changed shape): never report "everything loaded" on a list we couldn't read.
const COUNT_TEXT = /^(\d+)\s*\/\s*(\d+)\b/;

export function readUnloaded(infoPanel) {
  const rows = readResourceRows(infoPanel);
  const count = unloadedCount(infoPanel) ?? rows.length;
  return { count, resources: count === rows.length ? rows : null };
}

// Every row Page resources shows, whatever its filter: [{ reason, type, url }].
export function readResourceRows(infoPanel) {
  const rows = [];
  for (const el of infoPanel?.querySelectorAll('div') ?? []) {
    if (el.childElementCount !== 2) continue;
    const [cells, last] = el.children;
    const url = last.textContent.trim();
    if (last.childElementCount || !URL_TEXT.test(url)) continue;
    // [icon, reason, type]: icons are icon-font glyphs (private-use characters), not text, and
    // the type can be empty (e.g. a web worker script).
    const texts = [...cells.children].map(cell => cell.textContent.replace(/\s+/g, ' ').trim());
    const start = texts.findIndex(text => /[\p{L}\p{N}]/u.test(text));
    const [reason, type = '', ...rest] = start < 0 ? [] : texts.slice(start);
    if (reason && !rest.length) rows.push({ reason, type, url });
  }
  return rows;
}

// Search Console's own "N/M couldn't be loaded" count (the summary and the list both show it),
// or null when More info has none yet.
export function unloadedCount(infoPanel) {
  const match = countMatch(infoPanel);
  return match ? Number(match[1]) : null;
}

// M in "N/M couldn't be loaded": how many resources Googlebot requested in all, or null.
export function resourceTotal(infoPanel) {
  const match = countMatch(infoPanel);
  return match ? Number(match[2]) : null;
}

function countMatch(infoPanel) {
  for (const leaf of infoPanel?.querySelectorAll('*') ?? []) {
    const match = !leaf.childElementCount && COUNT_TEXT.exec(leaf.textContent.trim());
    if (match) return match;
  }
  return null;
}

export function readPanel({ htmlPanel, shotPanel, infoPanel }, doc) {
  const editor = htmlPanel.querySelector('.CodeMirror')?.CodeMirror;
  const html = typeof editor?.getValue === 'function' ? editor.getValue() : null;
  const googleImg = shotPanel.querySelector('img[src^="data:image"]');
  const desktop = DESKTOP_CRAWLER.test(shotPanel.textContent);
  return {
    html: html && html.trim() ? html : null,
    editorFound: typeof editor?.getValue === 'function',
    kind: googleImg ? 'live' : 'crawled',
    width: googleImg?.naturalWidth || (desktop ? DEFAULT_WIDTH.desktop : DEFAULT_WIDTH.smartphone),
    inspectedUrl: findInspectedUrl(doc),
    unloaded: readUnloaded(infoPanel),
  };
}

// documentUrl: the page's own URL (which site it belongs to): canonical → og:url → inspected
// URL; baseUrl: what relative URLs resolve against, which differs when the page has a
// <base href> (e.g. pointing to a CDN); googlebotUrl: what they resolved against for Googlebot,
// which fetched the inspected URL.
export function pickUrls(doc, inspectedUrl) {
  const documentUrl =
    httpUrl(doc.querySelector('link[rel~="canonical"]')?.getAttribute('href'), inspectedUrl) ||
    httpUrl(doc.querySelector('meta[property="og:url"]')?.getAttribute('content'), inspectedUrl) ||
    httpUrl(inspectedUrl);
  const base = doc.querySelector('base[href]')?.getAttribute('href');
  const baseUrl = httpUrl(base, documentUrl) || documentUrl;
  const googlebotUrl = (httpUrl(inspectedUrl) && (httpUrl(base, inspectedUrl) || httpUrl(inspectedUrl))) || baseUrl;
  return { documentUrl, baseUrl, googlebotUrl };
}
