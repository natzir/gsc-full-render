import { describe, it, expect } from 'vitest';
import { resolveUrl, srcsetUrls, mapSrcset, mapCssUrls } from '../src/urls.js';

const BASE = 'https://shop.example.com/cat/page';

describe('resolveUrl', () => {
  it('resolves against the base and returns null for what cannot be parsed', () => {
    expect(resolveUrl('../img/a.jpg', BASE)).toBe('https://shop.example.com/img/a.jpg');
    expect(resolveUrl('https://cdn.example/x.css', BASE)).toBe('https://cdn.example/x.css');
    expect(resolveUrl('/x', null)).toBeNull();
  });
});

describe('srcsetUrls / mapSrcset', () => {
  it('parses candidates as browsers do: a URL may itself contain commas', () => {
    expect(srcsetUrls('https://res.cloudinary.com/x/c_fill,w_400/a.jpg 1x,https://res.cloudinary.com/x/c_fill,w_800/a.jpg 2x')).toEqual([
      'https://res.cloudinary.com/x/c_fill,w_400/a.jpg',
      'https://res.cloudinary.com/x/c_fill,w_800/a.jpg',
    ]);
  });

  it('rewrites each URL and keeps its descriptor', () => {
    expect(mapSrcset('/i/a.webp 1x, i/b.webp 640w,c.webp', url => resolveUrl(url, BASE))).toBe(
      'https://shop.example.com/i/a.webp 1x, https://shop.example.com/cat/i/b.webp 640w, https://shop.example.com/cat/c.webp',
    );
  });
});

describe('mapCssUrls', () => {
  const absolute = url => resolveUrl(url, BASE);

  it('rewrites url() in every quoting style, and @import strings', () => {
    const css = `@import "print.css"; @import url(theme.css); .a{background:url(../img/a.jpg)} .b{background:url('/b (1).png')} .c{background:url("it's.png")}`;
    expect(mapCssUrls(css, absolute)).toBe(
      '@import "https://shop.example.com/cat/print.css"; @import url("https://shop.example.com/cat/theme.css"); ' +
        '.a{background:url("https://shop.example.com/img/a.jpg")} .b{background:url("https://shop.example.com/b%20(1).png")} ' +
        '.c{background:url("https://shop.example.com/cat/it\'s.png")}',
    );
  });

  it('rewrites the candidates of image-set(), which can be plain strings, but not their type()', () => {
    const css = `.a{background-image:image-set("a.avif" type("image/avif") 1x, url(a.jpg) 1x)} .b{background:-webkit-image-set('b.png' 1x, 'b@2x.png' 2x)}`;
    expect(mapCssUrls(css, absolute)).toBe(
      '.a{background-image:image-set("https://shop.example.com/cat/a.avif" type("image/avif") 1x, url("https://shop.example.com/cat/a.jpg") 1x)} ' +
        '.b{background:-webkit-image-set("https://shop.example.com/cat/b.png" 1x, "https://shop.example.com/cat/b@2x.png" 2x)}',
    );
    const seen = [];
    mapCssUrls(css, url => void seen.push(url));
    expect(seen.sort()).toEqual(['a.avif', 'a.jpg', 'b.png', 'b@2x.png']);
  });

  it('keeps what the callback does not replace', () => {
    expect(mapCssUrls('.a{background:url(data:image/png;base64,AA)} .b{color:red}', () => null)).toBe(
      '.a{background:url(data:image/png;base64,AA)} .b{color:red}',
    );
  });
});
