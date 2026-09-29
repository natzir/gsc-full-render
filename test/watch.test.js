import { describe, it, expect, vi, afterEach } from 'vitest';
import { watch } from '../src/watch.js';
import { buildScPage, moreInfo } from './helpers/sc-page.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const fakeMount = vi.fn(panel => {
  panel.shotPanel.querySelector(':scope > [data-gfr-host]')?.remove();
  const host = document.createElement('div');
  host.setAttribute('data-gfr-host', '');
  panel.shotPanel.prepend(host);
});
let stop = null;

afterEach(() => {
  stop?.();
  stop = null;
  fakeMount.mockClear();
  document.body.innerHTML = '';
});

describe('watch', () => {
  it('mounts panels that are already open', () => {
    buildScPage();
    stop = watch(document, fakeMount, 10);
    expect(fakeMount).toHaveBeenCalledTimes(1);
  });

  it('mounts only open panels: Search Console keeps closed ones in the page', async () => {
    buildScPage({ open: false });
    stop = watch(document, fakeMount, 10);
    expect(fakeMount).not.toHaveBeenCalled();
    document.querySelector('[role="tablist"]').getClientRects = () => [{ width: 400, height: 48 }];
    document.body.append(document.createElement('p'));
    await wait(30);
    expect(fakeMount).toHaveBeenCalledTimes(1);
  });

  it('is not woken by its own elements (toasts, the larger view, probes)', async () => {
    buildScPage();
    stop = watch(document, fakeMount, 10);
    const rects = vi.fn(() => [{ width: 400, height: 48 }]);
    document.querySelector('[role="tablist"]').getClientRects = rects;
    const toast = document.createElement('div');
    toast.setAttribute('data-gfr-toast', '');
    document.body.append(toast);
    toast.remove();
    await wait(30);
    expect(rects).not.toHaveBeenCalled(); // no scan at all
    document.body.append(document.createElement('p'));
    await wait(30);
    expect(rects).toHaveBeenCalled();
  });

  it('ignores unrelated mutations once mounted', async () => {
    buildScPage();
    stop = watch(document, fakeMount, 10);
    document.body.append(document.createElement('p'));
    await wait(30);
    expect(fakeMount).toHaveBeenCalledTimes(1);
  });

  it('remounts when More info reports what Googlebot couldn\'t load after the panel opened', async () => {
    const page = buildScPage();
    stop = watch(document, fakeMount, 10);
    const [row] = [{ reason: 'Googlebot blocked by robots.txt', type: 'Image', url: 'https://maps.example/a.png' }];
    page.infoPanel.replaceChildren(document.createRange().createContextualFragment(moreInfo([row])));
    await wait(30);
    expect(fakeMount).toHaveBeenCalledTimes(2);
  });

  it('remounts when Search Console loads a new page into the same panel', async () => {
    const page = buildScPage();
    stop = watch(document, fakeMount, 10);
    page.editor.setValue('<!DOCTYPE html>\n<p>new</p>');
    document.body.append(document.createElement('p')); // the editor re-renders its lines
    await wait(30);
    expect(fakeMount).toHaveBeenCalledTimes(2);
  });

  it('remounts when Search Console swaps in a new document with the same number of lines', async () => {
    const page = buildScPage({ html: '<p>old</p>' });
    stop = watch(document, fakeMount, 10);
    page.editor.swapDoc('<p>new</p>');
    document.body.append(document.createElement('p'));
    await wait(30);
    expect(fakeMount).toHaveBeenCalledTimes(2);
  });

  it('remounts when Search Console re-renders the panel and drops our view', async () => {
    const { shotPanel } = buildScPage();
    stop = watch(document, fakeMount, 10);
    shotPanel.querySelector('[data-gfr-host]').remove();
    await wait(30);
    expect(fakeMount).toHaveBeenCalledTimes(2);
  });

  it('remounts when the live screenshot arrives after the HTML', async () => {
    const { shotPanel } = buildScPage({ screenshot: false });
    stop = watch(document, fakeMount, 10);
    const img = document.createElement('img');
    img.src = 'data:image/png;base64,AAAA';
    shotPanel.querySelector('.shot').append(img);
    await wait(30);
    expect(fakeMount).toHaveBeenCalledTimes(2);
  });

  it('mounts panels that open later', async () => {
    stop = watch(document, fakeMount, 10);
    expect(fakeMount).not.toHaveBeenCalled();
    buildScPage();
    await wait(30);
    expect(fakeMount).toHaveBeenCalledTimes(1);
  });

  it('does not retry a panel whose mount failed until the panel changes', async () => {
    const page = buildScPage();
    const failingMount = vi.fn(() => {
      throw new Error('mount failed');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stop = watch(document, failingMount, 10);
    document.body.append(document.createElement('p'));
    await wait(30);
    expect(failingMount).toHaveBeenCalledTimes(1);
    page.editor.setValue('<!DOCTYPE html>\n<p>new</p>');
    document.body.append(document.createElement('p'));
    await wait(30);
    expect(failingMount).toHaveBeenCalledTimes(2);
  });

  it('stops watching', async () => {
    buildScPage();
    watch(document, fakeMount, 10)();
    buildScPage();
    await wait(30);
    expect(fakeMount).toHaveBeenCalledTimes(1);
  });
});
