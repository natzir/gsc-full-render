# Google Search Console Full Fetch & Render

GSC Full Render for short. A bookmarklet for Search Console's URL Inspection. Google's screenshot
stops at about 1,750 px and crawled pages don't have one. This rebuilds the whole page from the
HTML Google rendered, right in the *Screenshot* tab, and lists all its links.

![Scrolling through the full page in the Screenshot tab](docs/images/demo.gif)

## Why

- It uses the HTML Google rendered for that URL. Headless Chrome tools, and my own
  [Puppeteer Colab (2020)](https://x.com/natzir9/status/1321441105800503296), can only imitate it.
- You find odd URLs in the Pages report: inspect the pages that may link to them and look for the
  link in the list. You'll see where it is on the page and whether users can see it.
- Audits: check that a link is in the rendered HTML, and whether it's nofollow, not crawlable,
  has parameters or is relative without a slash.
- It shows what Search Console couldn't load, and why.

## Install

1. Open [`dist/install.html`](dist/install.html) and download it with the *Download raw file*
   button (⬇).
2. Open the downloaded file in your browser.
3. Drag the **GSC Full Render** button to your bookmarks bar. If you can't see the bar, show it
   with Ctrl+Shift+B (⌘+Shift+B on a Mac).

## Use

1. In URL Inspection, open *View tested page* or *View crawled page*.
2. Click the bookmark. The *Screenshot* tab shows the full page. Click it again to turn it off.

   ![The full page in the Screenshot tab](docs/images/panel.png)

3. `⤢` opens the page larger. **Links** shows the list with its filters, outlines the links on
   the page and lets you download them as CSV.

   ![The full page at real size](docs/images/larger.png)
   ![Filtering the links and jumping from a row to its link on the page](docs/images/links.gif)
   ![The page outlines the links the list shows](docs/images/links-outlines.png)

## What the full page leaves out

Images, styles and fonts load from your browser, so the test's timeouts don't apply. It only
leaves out what Google certainly can't load, with an amber outline where it was:

- resources blocked by robots.txt
- resources that return an HTTP error (404, 5xx)
- lazy images whose script never ran (the HTML still has the placeholder)

"Other error" is loaded anyway: Search Console doesn't say what happened, and it's often the
test's own time limit. `⚠ N not loaded` lists everything with its reason.

## Link filters and CSV

- **Destination**: internal or external.
- **Rel**: follow, nofollow, ugc, sponsored.
- **Crawlable**, and why not (`javascript:`, empty `href`, `onclick`…).
- **On load**: visible, in a carousel, collapsed (menu, tab, "see more"), invisible (opacity 0,
  hidden until a scroll or a click) or hidden (screen-reader only, or moved off the page).
- **URL**: parameters, fragment, link to the same page, http, uppercase, spaces or non-ASCII,
  over 115 characters, absolute or relative, relative without `/`, `//`, and a domain without
  `https://` (the browser reads `www.site.com/page` as a path).

The CSV has a column for each.

## Limits

- Scripts don't run, so content that only appears when you scroll may stay hidden.
- It can't check status codes or redirects: from Search Console the browser can't read other
  sites' responses.
- Resources are loaded now by your browser. If a server serves Googlebot something different,
  the result can differ.

## Disclaimer

Not affiliated with Google. Google and Google Search Console are trademarks of Google LLC.

It doesn't send data anywhere: everything runs in your browser. The only requests are for the
page's own images, styles and fonts, straight to the site and without a referrer.

## Develop

`npm install`, `npm test`, and `npm run build` to update `dist/`, which is what people install.
