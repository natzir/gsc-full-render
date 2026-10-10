// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = read('../extension/manifest.json');
const pkg = read('../package.json');

describe('manifest', () => {
  it('asks for these permissions and only Search Console\'s host', () => {
    expect(manifest.permissions).toEqual(['activeTab', 'contextMenus', 'scripting', 'storage']);
    expect(manifest.host_permissions).toEqual(['https://search.google.com/*']);
    expect(manifest.optional_permissions).toBeUndefined();
    // The automatic start is registered at run time, so the setting can turn it off.
    expect(manifest.content_scripts).toBeUndefined();
  });

  it('has the store name, a description that fits the store, and the package\'s version', () => {
    expect(manifest.name).toBe('GSC Full Fetch & Render as Googlebot by Natzir');
    expect(manifest.description.length).toBeLessThanOrEqual(132);
    expect(manifest.version).toBe('1.0.1');
    expect(pkg.version).toBe(manifest.version);
  });

  it('has no popup, so a click on the icon reaches the toggle', () => {
    expect(manifest.action.default_popup).toBeUndefined();
    expect(manifest.background).toEqual({ service_worker: 'background.js' });
  });

  it('points at icons that exist', () => {
    const paths = [...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)];
    for (const path of paths) expect(existsSync(new URL(`../extension/${path}`, import.meta.url))).toBe(true);
  });

  it('needs the Chrome the bundles are built for', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.minimum_chrome_version).toBe('120');
  });
});
