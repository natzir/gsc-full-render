// Every text shown on Search Console, in English, and the reasons in plain words.

// The HTML is Google's; its styles, images and fonts are not: the browser loads them now, so they
// may differ from what Google loaded (and the test's timeouts don't apply).
const NOTE = "Google's rendered HTML · styles and images loaded now by your browser, not by Google";

export const TEXT = {
  on: 'Full render ON · click the bookmarklet again to turn it off',
  onNoPanel: 'Full render ON · open View tested page or View crawled page',
  off: 'Full render OFF',
  notSearchConsole: 'Open a URL Inspection in Search Console first',
  blocked: 'Search Console blocked the bookmarklet: ',
  loading: 'Loading full render…',
  waiting: "Waiting for Search Console's HTML…",
  noHtml: "Couldn't find this page's HTML — Search Console may have changed. Google's screenshot is still available.",
  failed: "Couldn't build the full render: ",
  note: NOTE,
  // The two views of the Screenshot tab: button tooltips, then the note above the render.
  views: {
    google: "Google's own screenshot",
    full: "The whole page: Google's rendered HTML, with the styles, images and fonts your browser loads now from the site, not the ones Google loaded, and no timeouts",
    leftOut: "minus what Google can't load (see ⚠)",
  },
  notes: { leftOut: `${NOTE} · minus what Google can't load (⚠)` },
  openLabel: 'Open larger',
  openTitle: 'Open larger, at real size: with the list of links, filters and CSV',
  modalTitle: 'Full page',
  googleDisabled: 'Google only captures screenshots in the live test',
  unloadedTitle: "What Search Console couldn't load, and why",
  unloadedIntro: count => `Search Console couldn't load ${count} of this page's resources:`,
  unloadedUnread: count =>
    `Search Console couldn't load ${count} resources, but their list couldn't be read here: see More info › Page resources.`,
  lazyIntro: count =>
    `${count} lazy-loaded image${count === 1 ? '' : 's'} never loaded: the lazy-load script didn't run, so the page kept a placeholder. Search Console doesn't list them.`,
  notRequestedIntro: count =>
    `${count} image${count === 1 ? '' : 's'} with loading="lazy" Google never requested: Googlebot doesn't scroll, so what lies outside its viewport (far down the page, or off-screen in a carousel) isn't loaded. Search Console doesn't list ${count === 1 ? 'it' : 'them'}.`,
  reasons: {
    robots: 'Blocked by robots.txt: Google may not fetch it',
    other: "Other error: Search Console doesn't say why (often a time limit of the test)",
    lazy: "Never loaded: its lazy-load script didn't run",
    notRequested: 'Never requested: loading="lazy", outside its viewport',
  },
  effects: {
    shown: 'Left out of the full page',
    'no-visual': 'No visual difference: the rendered HTML already reflects it',
    'not-found': "Not left out: the HTML doesn't refer to it (a stylesheet may)",
    loaded: 'Loaded in the full page: no certain reason to leave it out',
    lazy: 'The full page shows the placeholder',
  },
  csv: 'Download the links as CSV',
  onLoadLabels: { visible: 'Visible', carousel: 'Carousel', collapsed: 'Collapsed', invisible: 'Invisible', visually_hidden: 'Hidden' },
  onLoadTitles: {
    carousel: 'Cut off in a carousel: visible after scrolling it',
    collapsed: 'Collapsed until a click (see more, tab, menu)',
    invisible: 'Invisible on load (opacity 0 or visibility hidden): a click, a scroll or an animation reveals it',
    visually_hidden: 'Never shown on screen: screen-reader only, or moved off the page (a skip link)',
  },
  unlocked: 'page scroll lock removed',
};

// The extension's icon does what the bookmark does: only the words that name it differ.
export const EXTENSION_TEXT = {
  ...TEXT,
  on: 'Full render ON · click the extension icon again to turn it off',
  blocked: 'Search Console blocked the extension: ',
};

// Search Console's reason, in plain words when it is one we can explain.
export function explainReason(reason) {
  if (/robots\.txt/i.test(reason)) return TEXT.reasons.robots;
  if (/^other error$/i.test(reason.trim())) return TEXT.reasons.other;
  return reason;
}
