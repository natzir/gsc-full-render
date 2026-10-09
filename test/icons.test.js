// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { artPixel, iconPixel } from '../scripts/make-icons.mjs';

const TILE = [23, 34, 36, 255];
const BLUE = [138, 180, 248, 255];
const CLEAR = [0, 0, 0, 0];

describe('artPixel', () => {
  it('draws the dark tools tile with rounded corners', () => {
    expect(artPixel(0, 0, 128)[3]).toBe(0); // outside the rounded corner
    expect(artPixel(64, 6, 128)).toEqual(TILE);
  });

  it('shows the top of the page, then a dashed line where Google\'s screenshot stops', () => {
    expect(artPixel(40, 24, 128)).toEqual([236, 237, 237, 255]); // white bar at 92 % over the tile
    expect(artPixel(24, 53, 128)).toEqual([162, 167, 167, 255]); // a dash: white at 60 %
    expect(artPixel(32, 53, 128)).toEqual(TILE); // the gap between two dashes
  });

  it('continues the page below the cut in blue, still readable at 16 px', () => {
    expect(artPixel(40, 68, 128)).toEqual(BLUE);
    expect(artPixel(5, 8, 16)).toEqual(BLUE);
  });
});

describe('iconPixel', () => {
  it('gives the 128 px store icon 16 px of transparent padding around 96 px of artwork', () => {
    for (const [x, y] of [[8, 64], [64, 8], [119, 64], [64, 119], [15, 15], [112, 112]]) expect(iconPixel(x, y, 128)).toEqual(CLEAR);
    expect(iconPixel(64, 20, 128)).toEqual(artPixel(48, 4, 96));
    expect(iconPixel(64, 20, 128)).toEqual(TILE);
  });

  it('uses the whole square at the toolbar sizes', () => {
    for (const size of [16, 32, 48]) expect(iconPixel(size / 2, 1, size)).toEqual(artPixel(size / 2, 1, size));
  });
});
