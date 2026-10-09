# GSC Full Fetch & Render as Googlebot by Natzir · Privacy policy

Last updated: 9 October 2026

GSC Full Fetch & Render is a Chrome extension by natzir.com that shows the whole page Google rendered in Search Console's URL Inspection. It has no accounts, no analytics, no ads and no server of its own. This page lists everything it reads, keeps and sends. The bookmarklet does the same, minus the setting.

## What it reads

Only on Search Console (search.google.com), and only what URL Inspection shows you:

- the HTML Google rendered for the inspected URL, from the *HTML* tab;
- Google's screenshot, to know the page's width and whether it is the live test or the crawled page;
- *More info › Page resources*, the list of what Google couldn't load and why;
- the inspected URL.

All of it is read and processed inside the Search Console page in your browser.

## What it keeps

One setting, whether it turns on by itself in URL Inspection, in `chrome.storage.local`, in this browser only. Nothing else is stored: the full render and the list of links are gone when you leave the page. A CSV of the links is saved to your computer only when you click its download button.

## What it sends

Nothing. The extension never sends what it reads to natzir.com or anyone else.

To draw the full page, your browser loads the inspected page's own images, styles and fonts straight from the site that serves them, without a referrer, as it would if you opened the page. Its scripts don't run.

## Permissions

- **Access to search.google.com**: to read URL Inspection and show the full page there, by itself when the automatic start is on.
- **activeTab** and **scripting**: when you click the icon, to turn the full render on or off in that tab; outside Search Console it only says to open a URL Inspection.
- **contextMenus**: the "Turn on automatically in URL Inspection" checkbox in the icon's right-click menu.
- **storage**: to keep that setting.

## Contact

Questions and reports: [github.com/natzir/gsc-full-render/issues](https://github.com/natzir/gsc-full-render/issues).
