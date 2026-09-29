// @vitest-environment node
// esbuild refuses to run inside jsdom, so this file uses the node environment.
import { describe, it, expect } from 'vitest';
import { buildBookmarklet } from '../scripts/build.mjs';

describe('buildBookmarklet', () => {
  it('produces a javascript: URL under 48 KB whose code parses', async () => {
    const url = await buildBookmarklet();
    expect(url.startsWith('javascript:')).toBe(true);
    expect(url.length).toBeLessThan(48 * 1024);
    expect(() => new Function(decodeURIComponent(url.slice('javascript:'.length)))).not.toThrow();
  });
});
