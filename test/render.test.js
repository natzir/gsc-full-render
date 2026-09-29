import { describe, it, expect, vi } from 'vitest';
import { getPolicy, createFrame, fitFrame, measureScrollbar, estimateScrollbar, countFailedStylesheets, countFailedFonts, unlockScroll, whenDomReady } from '../src/render.js';

const passThrough = { createHTML: s => s };

describe('getPolicy', () => {
  it('returns a pass-through when Trusted Types is unavailable', () => {
    expect(getPolicy({}).createHTML('<p>x</p>')).toBe('<p>x</p>');
  });

  it('creates the policy once and reuses it', () => {
    const createPolicy = vi.fn((name, rules) => ({ name, createHTML: rules.createHTML }));
    const win = { trustedTypes: { createPolicy } };
    const first = getPolicy(win);
    expect(getPolicy(win)).toBe(first);
    expect(createPolicy).toHaveBeenCalledTimes(1);
    expect(createPolicy.mock.calls[0][0]).toMatch(/^gsc-full-render-/);
  });

  it('lets a blocked policy error propagate', () => {
    const win = { trustedTypes: { createPolicy() { throw new Error('blocked by CSP'); } } };
    expect(() => getPolicy(win)).toThrow('blocked by CSP');
  });
});

describe('createFrame', () => {
  it('builds a sandboxed iframe that cannot run scripts or open popups', () => {
    const policy = { createHTML: vi.fn(s => s) };
    const { frame, loaded } = createFrame({ html: '<p>x</p>', width: 412, policy });
    expect(frame.getAttribute('sandbox')).toBe('allow-same-origin');
    expect(frame.style.width).toBe('412px');
    expect(policy.createHTML).toHaveBeenCalledWith('<p>x</p>');
    expect(frame.srcdoc).toBe('<p>x</p>');
    expect(loaded).toBeInstanceOf(Promise);
  });

  it('keeps the frame out of the layout flow so a wide page cannot widen Search Console\'s panel', () => {
    const { frame } = createFrame({ html: '', width: 412, policy: passThrough });
    expect(frame.style.position).toBe('absolute');
    expect(frame.style.top).toBe('0px');
    expect(frame.style.left).toBe('0px');
  });
});

describe('fitFrame', () => {
  const frame = () => createFrame({ html: '', width: 412, policy: passThrough }).frame;

  it('scales the frame down to the box width and fills the box height', () => {
    const f = frame();
    const scale = fitFrame(f, 412, { width: 353, height: 579 });
    expect(scale).toBeCloseTo(353 / 412);
    expect(f.style.height).toBe(`${Math.floor(579 / (353 / 412))}px`);
  });

  it('never scales up', () => {
    const f = frame();
    expect(fitFrame(f, 412, { width: 800, height: 600 })).toBe(1);
    expect(f.style.height).toBe('600px');
  });

  it('widens the frame by its scrollbar so the page keeps its full viewport width', () => {
    const f = frame();
    const scale = fitFrame(f, 412, { width: 353, height: 500 }, 15);
    expect(f.style.width).toBe('427px');
    expect(scale).toBeCloseTo(353 / 427); // page + scrollbar fill the box, like Google's image + scrollbar
  });

  it('leaves the frame alone while the box is hidden (0×0)', () => {
    const f = frame();
    expect(fitFrame(f, 412, { width: 0, height: 0 })).toBeNull();
    expect(f.style.height).toBe('');
  });
});

describe('measureScrollbar', () => {
  it('returns the width the frame\'s scrollbar takes from the page', () => {
    const fake = { contentWindow: { innerWidth: 427 }, contentDocument: { documentElement: { clientWidth: 412 } } };
    expect(measureScrollbar(fake)).toBe(15);
  });

  it('returns 0 when the frame is not rendered', () => {
    expect(measureScrollbar({ contentWindow: null, contentDocument: null })).toBe(0);
  });
});

describe('unlockScroll', () => {
  // A document whose root reports the given sizes and either follows scrollTop or ignores it.
  function fakeDoc({ scrollHeight, clientHeight, scrolls }) {
    const doc = document.implementation.createHTMLDocument('');
    let top = 0;
    Object.defineProperties(doc.documentElement, {
      scrollHeight: { value: scrollHeight },
      clientHeight: { value: clientHeight },
      scrollTop: { get: () => top, set: value => { if (scrolls) top = value; } },
    });
    Object.defineProperty(doc, 'scrollingElement', { value: doc.documentElement });
    return doc;
  }

  it('unlocks a long page whose scrolling is blocked, and says so', () => {
    const doc = fakeDoc({ scrollHeight: 5000, clientHeight: 700, scrolls: false });
    expect(unlockScroll(doc)).toBe(true);
    expect(doc.getElementById('gfr-unlock').textContent).toContain('overflow-y:auto!important');
  });

  it('leaves pages that already scroll alone', () => {
    const doc = fakeDoc({ scrollHeight: 5000, clientHeight: 700, scrolls: true });
    expect(unlockScroll(doc)).toBe(false);
    expect(doc.getElementById('gfr-unlock')).toBeNull();
    expect(doc.documentElement.scrollTop).toBe(0);
  });

  it('leaves pages shorter than the viewport alone', () => {
    const doc = fakeDoc({ scrollHeight: 600, clientHeight: 700, scrolls: false });
    expect(unlockScroll(doc)).toBe(false);
  });
});

describe('estimateScrollbar', () => {
  it('measures this browser\'s scrollbar width with a throwaway element', () => {
    const offset = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100);
    const client = vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(85);
    const before = document.body.innerHTML;
    expect(estimateScrollbar(document)).toBe(15);
    expect(document.body.innerHTML).toBe(before);
    offset.mockRestore();
    client.mockRestore();
  });
});

describe('whenDomReady', () => {
  it('resolves once the render\'s own document is parsed, before images finish loading', async () => {
    vi.useFakeTimers();
    const frame = { isConnected: true, contentDocument: { URL: 'about:blank', readyState: 'complete' } };
    let resolved = null;
    whenDomReady(frame, 50).then(doc => (resolved = doc));
    await vi.advanceTimersByTimeAsync(100);
    expect(resolved).toBeNull(); // the initial about:blank does not count
    frame.contentDocument = { URL: 'about:srcdoc', readyState: 'loading' };
    await vi.advanceTimersByTimeAsync(100);
    expect(resolved).toBeNull();
    frame.contentDocument = { URL: 'about:srcdoc', readyState: 'interactive' };
    await vi.advanceTimersByTimeAsync(100);
    expect(resolved).toBe(frame.contentDocument);
    vi.useRealTimers();
  });

  it('stops waiting when the frame is removed', async () => {
    vi.useFakeTimers();
    const frame = { isConnected: true, contentDocument: { URL: 'about:blank', readyState: 'complete' } };
    const spy = vi.fn();
    whenDomReady(frame, 50).then(spy);
    frame.isConnected = false;
    await vi.advanceTimersByTimeAsync(200);
    expect(vi.getTimerCount()).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('countFailedFonts', () => {
  it('counts web fonts that failed to load (e.g. blocked by CORS on the render\'s origin)', () => {
    expect(countFailedFonts({ fonts: [{ status: 'error' }, { status: 'loaded' }, { status: 'error' }] })).toBe(2);
    expect(countFailedFonts({})).toBe(0);
  });

  it('does not count the faces the full page left out on purpose: Google couldn\'t load them either', () => {
    const doc = new DOMParser().parseFromString(
      '<style>@font-face{font-family:"Brand Sans";src:url("data:,") format("woff2")} @media screen{@font-face{font-family:Icons;src:url("data:,")}} @font-face{font-family:Other;src:url(https://x.example/o.woff2)}</style>',
      'text/html',
    );
    const fonts = [{ family: '"Brand Sans"', status: 'error' }, { family: 'Icons', status: 'error' }, { family: 'Other', status: 'error' }];
    Object.defineProperty(doc, 'fonts', { value: fonts });
    expect(countFailedFonts(doc)).toBe(1);
  });
});

describe('countFailedStylesheets', () => {
  it('counts stylesheet links that produced no sheet', () => {
    const doc = new DOMParser().parseFromString(
      '<head><link rel="stylesheet" href="a.css"><link rel="stylesheet" href="b.css"><link rel="icon" href="i.png"><style>p{}</style></head>',
      'text/html',
    );
    Object.defineProperty(doc.querySelector('link'), 'sheet', { value: {} });
    expect(countFailedStylesheets(doc)).toBe(1);
  });

  it('ignores stylesheet links without an href, which scripts fill in later (e.g. themes on github.com)', () => {
    const doc = new DOMParser().parseFromString(
      '<head><link rel="stylesheet" data-href="https://x.example/dark.css"><link rel="stylesheet" href=""><link rel="stylesheet" href="https://x.example/a.css"></head>',
      'text/html',
    );
    expect(countFailedStylesheets(doc)).toBe(1);
  });

  it('also counts stylesheets that came back with an error status: the browser keeps an empty sheet', () => {
    const doc = new DOMParser().parseFromString(
      '<head><link rel="stylesheet" href="https://x.example/a.css"><link rel="stylesheet" href="https://x.example/b.css"></head>',
      'text/html',
    );
    for (const link of doc.querySelectorAll('link')) Object.defineProperty(link, 'sheet', { value: {} });
    const entries = [
      { name: 'https://x.example/a.css', responseStatus: 404 },
      { name: 'https://x.example/b.css', responseStatus: 200 },
    ];
    Object.defineProperty(doc, 'defaultView', { value: { performance: { getEntriesByType: () => entries } } });
    expect(countFailedStylesheets(doc)).toBe(1);
  });
});
