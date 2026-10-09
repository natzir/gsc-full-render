// @vitest-environment node
// esbuild refuses to run inside jsdom, so this file uses the node environment.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBookmarklet, buildExtension } from '../scripts/build.mjs';
import { pack } from '../scripts/pack.mjs';

const EXTENSION_DIR = fileURLToPath(new URL('../extension', import.meta.url));
const EXTENSION_FILES = [
  'auto.js',
  'background.js',
  'icons/128.png',
  'icons/16.png',
  'icons/32.png',
  'icons/48.png',
  'manifest.json',
  'toggle.js',
  'tokens.css',
  'welcome.css',
  'welcome.html',
];

const temp = prefix => mkdtemp(join(tmpdir(), prefix));
const listFiles = async dir =>
  (await readdir(dir, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name).slice(dir.length + 1))
    .sort();

describe('buildBookmarklet', () => {
  it('produces a javascript: URL under 48 KB whose code parses', async () => {
    const url = await buildBookmarklet();
    expect(url.startsWith('javascript:')).toBe(true);
    expect(url.length).toBeLessThan(48 * 1024);
    expect(() => new Function(decodeURIComponent(url.slice('javascript:'.length)))).not.toThrow();
  });
});

describe('buildExtension', () => {
  it('assembles the static files and three bundles that parse', async () => {
    const out = await temp('gfr-ext-');
    await buildExtension({ out });
    expect(await listFiles(out)).toEqual(EXTENSION_FILES);
    for (const name of ['auto.js', 'toggle.js', 'background.js']) {
      const code = await readFile(join(out, name), 'utf8');
      expect(() => new Function(code)).not.toThrow();
    }
  });

  it('keeps chrome.* out of the scripts that run in Search Console\'s own world', async () => {
    const out = await temp('gfr-ext-');
    await buildExtension({ out });
    for (const name of ['auto.js', 'toggle.js']) {
      expect(await readFile(join(out, name), 'utf8')).not.toMatch(/\bchrome\.[a-z]/);
    }
    expect(await readFile(join(out, 'background.js'), 'utf8')).toMatch(/chrome\.action\.onClicked/);
  });

  it('leaves dotfiles such as .DS_Store out', async () => {
    const from = await temp('gfr-src-');
    await cp(EXTENSION_DIR, from, { recursive: true });
    await writeFile(join(from, '.DS_Store'), 'x');
    await writeFile(join(from, 'icons', '.DS_Store'), 'x');
    const out = await temp('gfr-ext-');
    await buildExtension({ from, out });
    expect(await listFiles(out)).toEqual(EXTENSION_FILES);
  });
});

describe('pack', () => {
  it('zips exactly the built extension', async () => {
    const out = await temp('gfr-ext-');
    await buildExtension({ out });
    const zip = join(await temp('gfr-zip-'), 'extension.zip');
    pack(out, zip);
    const names = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' })
      .split('\n')
      .filter(name => name && !name.endsWith('/'))
      .sort();
    expect(names).toEqual(EXTENSION_FILES);
  });
});
