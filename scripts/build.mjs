// npm run build → dist/bookmarklet.txt (paste into a bookmark), dist/install.html (drag it) and
// dist/extension/ (the Chrome extension, ready for Load unpacked; npm run pack zips it).
import { build } from 'esbuild';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toBookmarkletUrl, installPage } from './bookmarklet-url.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

const BUNDLE = {
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'chrome120',
  charset: 'utf8',
  legalComments: 'none',
};

export async function buildBookmarklet() {
  const result = await build({ entryPoints: [`${root}src/bookmarklet.js`], ...BUNDLE, write: false });
  return toBookmarkletUrl(result.outputFiles[0].text.trim());
}

// The extension's static files (no dotfiles, such as macOS's .DS_Store) and three bundles:
// auto.js and toggle.js run in Search Console's own world, like the bookmarklet; background.js
// is the service worker.
export async function buildExtension({ from = `${root}extension`, out = `${root}dist/extension` } = {}) {
  await rm(out, { recursive: true, force: true });
  await cp(from, out, { recursive: true, filter: source => !basename(source).startsWith('.') });
  await build({
    entryPoints: {
      auto: `${root}src/extension/auto.js`,
      toggle: `${root}src/extension/toggle.js`,
      background: `${root}src/extension/background.js`,
    },
    outdir: out,
    ...BUNDLE,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const bookmarklet = await buildBookmarklet();
  await mkdir(`${root}dist`, { recursive: true });
  await writeFile(`${root}dist/bookmarklet.txt`, `${bookmarklet}\n`);
  await writeFile(`${root}dist/install.html`, installPage(bookmarklet));
  console.log(`bookmarklet: ${(bookmarklet.length / 1024).toFixed(1)} KB → dist/install.html`);
  await buildExtension();
  console.log('extension → dist/extension/');
}
