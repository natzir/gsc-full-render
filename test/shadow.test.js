import { describe, it, expect } from 'vitest';
import { scopeShadowStyles } from '../src/shadow.js';

const parse = body => new DOMParser().parseFromString(`<!DOCTYPE html><body>${body}</body>`, 'text/html');
const scoped = (n, css) => `@scope ([data-gfr-shadow="${n}"]) to (slot, [data-gfr-shadow] > *) {\n${css}\n}`;

describe('scopeShadowStyles', () => {
  it('keeps the styles of a flattened custom element inside it', () => {
    const doc = parse('<p>page</p><x-card><style>p { color: red; }</style><p>card</p><slot><span>light</span></slot></x-card>');
    scopeShadowStyles(doc);
    expect(doc.querySelector('x-card').getAttribute('data-gfr-shadow')).toBe('1');
    expect(doc.querySelector('x-card > style').textContent).toBe(scoped(1, 'p { color: red; }'));
  });

  it('turns :host into the scope root, with or without a selector', () => {
    const doc = parse('<x-card><style>:host { display: block; } :host(.open:not(.x)) p { color: red; }</style></x-card>');
    scopeShadowStyles(doc);
    expect(doc.querySelector('style').textContent).toBe(
      scoped(1, ':scope { display: block; } :scope:is(.open:not(.x)) p { color: red; }'),
    );
  });

  it('keeps the styles of a plain element whose shadow root had a slot', () => {
    const doc = parse('<div><style>p { color: red; }</style><p>shadow</p><slot></slot></div>');
    scopeShadowStyles(doc);
    expect(doc.querySelector('div').getAttribute('data-gfr-shadow')).toBe('1');
  });

  it('leaves a plain element with a style and no slot alone, as Elementor writes its widgets', () => {
    const html = '<div class="elementor-widget-container"><style>.elementor-heading-title { margin: 0; }</style><h2 class="elementor-heading-title">x</h2></div>';
    const doc = parse(html);
    scopeShadowStyles(doc);
    expect(doc.body.innerHTML).toBe(html);
  });

  it('leaves a container alone when the slot belongs to a component inside it', () => {
    const doc = parse('<main><style>.page { margin: 0; }</style><x-card><style>p { color: red; }</style><slot></slot></x-card></main>');
    scopeShadowStyles(doc);
    expect(doc.querySelector('main').hasAttribute('data-gfr-shadow')).toBe(false);
    expect(doc.querySelector('main > style').textContent).toBe('.page { margin: 0; }');
    expect(doc.querySelector('x-card').getAttribute('data-gfr-shadow')).toBe('1');
  });

  it('leaves the body alone, and a custom element without a style of its own', () => {
    const html = '<style>p { margin: 0; }</style><x-card><div><style>.a { color: red; }</style></div><slot></slot></x-card>';
    const doc = parse(html);
    scopeShadowStyles(doc);
    expect(doc.body.innerHTML).toBe(html);
  });

  it('numbers nested components apart, each style scoped to its own', () => {
    const doc = parse('<x-outer><style>a { color: red; }</style><x-inner><style>b { color: blue; }</style></x-inner></x-outer>');
    scopeShadowStyles(doc);
    expect(doc.querySelector('x-outer > style').textContent).toBe(scoped(1, 'a { color: red; }'));
    expect(doc.querySelector('x-inner > style').textContent).toBe(scoped(2, 'b { color: blue; }'));
  });
});
