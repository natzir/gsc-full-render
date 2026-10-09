// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { iconPixel } from '../scripts/make-icons.mjs';

const TILE = [23, 34, 36, 255];
const BLUE = [138, 180, 248, 255];

describe('iconPixel', () => {
  it('draws the dark tools tile with rounded corners', () => {
    expect(iconPixel(0, 0, 128)[3]).toBe(0); // outside the rounded corner
    expect(iconPixel(64, 6, 128)).toEqual(TILE);
  });

  it('shows the top of the page, then a dashed line where Google\'s screenshot stops', () => {
    expect(iconPixel(40, 24, 128)).toEqual([236, 237, 237, 255]); // white bar at 92 % over the tile
    expect(iconPixel(24, 53, 128)).toEqual([162, 167, 167, 255]); // a dash: white at 60 %
    expect(iconPixel(32, 53, 128)).toEqual(TILE); // the gap between two dashes
  });

  it('continues the page below the cut in blue, still readable at 16 px', () => {
    expect(iconPixel(40, 68, 128)).toEqual(BLUE);
    expect(iconPixel(5, 8, 16)).toEqual(BLUE);
  });
});
