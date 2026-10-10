// Turns bundled code into a bookmark URL, and the install page that carries it.

// Browsers percent-decode a javascript: URL before running it, so a literal % must be
// escaped. URL parsing also strips tabs and newlines, so those are escaped too.
export function toBookmarkletUrl(code) {
  return `javascript:${code.replace(/[%\t\n\r]/g, ch => encodeURIComponent(ch))}`;
}

const escapeAttribute = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function installPage(bookmarkletUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Google Search Console Full Fetch &amp; Render</title>
<style>
  body { font: 16px/1.5 Roboto, Arial, sans-serif; color: #202124; max-width: 640px; margin: 48px auto; padding: 0 16px; }
  a.bm { display: inline-block; padding: 10px 18px; border-radius: 20px; background: #1a73e8; color: #fff; text-decoration: none; font-weight: 500; cursor: grab; }
  code { background: #f1f3f4; padding: 1px 4px; border-radius: 3px; }
</style>
</head>
<body>
<h1>Google Search Console Full Fetch &amp; Render</h1>
<p>Drag this button to your bookmarks bar (show it with <code>⌘ Shift B</code>):</p>
<p><a class="bm" href="${escapeAttribute(bookmarkletUrl)}">GSC Full Render</a></p>
<ol>
  <li>In Search Console, open URL Inspection → <em>View tested page</em> or <em>View crawled page</em>.</li>
  <li>Click the bookmark once. The <em>Screenshot</em> tab now shows the full page.</li>
  <li>Click it again to turn it off.</li>
</ol>
<p>Prefer an extension that turns on by itself? Install <a href="https://chromewebstore.google.com/detail/gsc-full-fetch-render-as/ljlijkonoghompcadbfihdjnkbcmbpan">GSC Full Fetch &amp; Render as Googlebot by Natzir</a> from the Chrome Web Store.</p>
</body>
</html>
`;
}
