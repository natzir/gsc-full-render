// npm run build → dist/bookmarklet.txt (paste into a bookmark) and dist/install.html (drag it).
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { toBookmarkletUrl, installPage } from './bookmarklet-url.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

export async function buildBookmarklet() {
  const result = await build({
    entryPoints: [`${root}src/bookmarklet.js`],
    bundle: true,
    minify: true,
    format: 'iife',
    target: 'chrome120',
    charset: 'utf8',
    legalComments: 'none',
    write: false,
  });
  return toBookmarkletUrl(result.outputFiles[0].text.trim());
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const bookmarklet = await buildBookmarklet();
  await mkdir(`${root}dist`, { recursive: true });
  await writeFile(`${root}dist/bookmarklet.txt`, `${bookmarklet}\n`);
  await writeFile(`${root}dist/install.html`, installPage(bookmarklet));
  console.log(`bookmarklet: ${(bookmarklet.length / 1024).toFixed(1)} KB → dist/install.html`);
}
