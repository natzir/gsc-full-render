# Chrome Web Store listing

Everything the Developer Dashboard asks for, ready to paste.

Package: `npm run pack` → `dist/gsc-full-render-<version>.zip` (only the files the extension loads).

## Store listing

**Name:** GSC Full Fetch & Render as Googlebot by Natzir

**Summary** (132 characters max):

> See the whole page Google rendered in Search Console's URL Inspection, not just the first 1,750 px, and list its links.

**Category:** Developer Tools

**Language:** English

**Description:**

```
GSC Full Fetch & Render shows the whole page Google rendered in Search Console's URL Inspection. Google's screenshot stops at about 1,750 px, and crawled pages have none. The extension rebuilds the full page from the HTML Google rendered, right in the Screenshot tab, for both the live test and the crawled page.

It turns on by itself when you open View tested page or View crawled page. Click its icon to turn it off in that tab, or right-click the icon to switch the automatic start off and use the icon as an on/off button.

• The whole page, from Google's rendered HTML. Images, styles and fonts load from your browser, so the test's timeouts don't apply. What Google certainly couldn't load (blocked by robots.txt, HTTP errors, lazy images whose script never ran) is left out and outlined in amber, with the list and the reason.
• Open it larger, at real size.
• Every link on the page, with filters: internal or external; follow, nofollow, ugc or sponsored; crawlable or not, and why (javascript:, empty href, onclick…); visible on load, in a carousel, collapsed, invisible or hidden; and URL issues such as parameters, fragments, http, uppercase, spaces, relative without a slash, or a domain without https://. Click a row to jump to the link on the page, and download the list as CSV.

It's handy for finding where the odd URLs in the Pages report come from. Inspect the pages that may link to them and look for the link in the list.

It doesn't send data anywhere. Everything runs in your browser, inside Search Console. The only requests are for the inspected page's own images, styles and fonts, straight to the site and without a referrer.

Not affiliated with Google. Google and Google Search Console are trademarks of Google LLC.
```

**Images**

- Icon: `extension/icons/128.png`.
- Screenshots, 1280 × 800, from real inspections once the extension is installed: the full page in the Screenshot tab; the larger view; the list of links with its filters; the page outlining the links the list shows; the "not loaded" list with its reasons.
- Small promo tile, 440 × 280.

**Official URL:** natzir.com · **Homepage:** https://github.com/natzir/gsc-full-render · **Support:** https://github.com/natzir/gsc-full-render/issues

## Privacy practices

**Single purpose:**

> Show the full page Google rendered, and its links, in Search Console's URL Inspection.

**Permission justifications:**

- **activeTab:** When you click the icon, the extension turns the full render on or off in that tab. activeTab lets it run there only after your click; outside Search Console it just says to open a URL Inspection.
- **scripting:** Runs the full-render script in Search Console pages (registered while the automatic start is on, and in Search Console tabs already open when you turn it on) and in the tab whose icon you click.
- **contextMenus:** Adds the "Turn on automatically in URL Inspection" checkbox to the icon's right-click menu.
- **storage:** Keeps that one setting, on or off, in this browser.
- **Host permission (https://search.google.com/\*):** Search Console lives at search.google.com. The extension reads the URL Inspection panel (the rendered HTML, the screenshot and the list of resources Google couldn't load) to rebuild the page there. It asks for no other site.

**Remote code:** No, I am not using remote code. Every script is in the package.

**Data usage:** the extension collects none of the listed kinds of user data. Tick the three certifications (not sold to third parties, not used or transferred for purposes unrelated to the single purpose, not used to determine creditworthiness or for lending).

**Privacy policy URL:** https://github.com/natzir/gsc-full-render/blob/main/PRIVACY.md
