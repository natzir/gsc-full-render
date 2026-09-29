// URL helpers: resolving, srcset and the URLs in CSS.

// Absolute URL of value against base, or null when it cannot be parsed.
export function resolveUrl(value, base) {
  try {
    return new URL(value.trim(), base ?? undefined).href;
  } catch {
    return null;
  }
}

export const isHttp = url => url.protocol === 'http:' || url.protocol === 'https:';

// Like resolveUrl, but only for http(s) URLs.
export function httpUrl(value, base) {
  if (!value) return null;
  const href = resolveUrl(value, base);
  return href && isHttp(new URL(href)) ? href : null;
}

// Candidates of a srcset, parsed as browsers do: a URL may itself contain commas.
function srcsetCandidates(srcset) {
  const candidates = [];
  let rest = srcset;
  while ((rest = rest.replace(/^[\s,]+/, ''))) {
    const url = rest.match(/^\S+/)[0];
    rest = rest.slice(url.length);
    if (url.endsWith(',')) candidates.push({ url: url.replace(/,+$/, ''), descriptor: '' });
    else {
      const descriptor = rest.match(/^[^,]*/)[0];
      rest = rest.slice(descriptor.length);
      candidates.push({ url, descriptor: descriptor.trim() });
    }
  }
  return candidates;
}

export function srcsetUrls(srcset) {
  return srcsetCandidates(srcset).map(candidate => candidate.url);
}

// fn(url) → replacement, or null to keep the URL.
export function mapSrcset(srcset, fn) {
  return srcsetCandidates(srcset)
    .map(({ url, descriptor }) => [fn(url) ?? url, descriptor].filter(Boolean).join(' '))
    .join(', ');
}

const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^'"()\s]*))\s*\)/gi;
const CSS_IMPORT = /@import\s+(?:"([^"]*)"|'([^']*)')/gi;
// image-set() also takes its images as plain strings; a string inside url() or type() is not one.
const CSS_IMAGE_SET = /(?:-webkit-)?image-set\((?:[^()]|\([^()]*\))*\)/gi;
const CSS_STRING = /(\b(?:url|type)\(\s*)?(?:"([^"]*)"|'([^']*)')/gi;

// Rewrites the url()s, image-set() strings and @import strings of CSS text. fn(url) →
// replacement, or null to keep the original text.
export function mapCssUrls(css, fn) {
  return css
    .replace(CSS_IMAGE_SET, set =>
      set.replace(CSS_STRING, (whole, inside, double, single) => {
        const next = inside ? null : fn(double ?? single);
        return next == null ? whole : `"${next}"`;
      }),
    )
    .replace(CSS_URL, (whole, double, single, bare) => {
      const next = fn(double ?? single ?? bare);
      return next == null ? whole : `url("${next}")`;
    })
    .replace(CSS_IMPORT, (whole, double, single) => {
      const next = fn(double ?? single);
      return next == null ? whole : `@import "${next}"`;
    });
}
