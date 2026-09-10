import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Mfd } from './Mfd';
import { TerrainMap, type NavigationMapState } from './TerrainMap';

/** Component tests only: the bezel receives snapshots, never the renderer. */
const labels = (markup: string) =>
  [...markup.matchAll(/aria-label="([^"]*)"/g)].map((match) => match[1]);

describe('MFD bezel', () => {
  test('fills every unassigned position with an inert button', () => {
    const markup = renderToStaticMarkup(
      createElement(Mfd, {
        label: 'Test MFD',
        top: [{ label: 'Page one', pressed: true }],
        children: 'screen',
      }),
    );
    // Four banks of five, so twenty buttons regardless of how many are assigned.
    expect([...markup.matchAll(/<button/g)]).toHaveLength(20);
    expect([...markup.matchAll(/mfd-unused/g)]).toHaveLength(19);
    expect(markup).toContain('aria-label="Page one"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-label="Unused top MFD button 2"');
    expect(markup).toContain('aria-label="Unused bottom MFD button 5"');
    expect(markup).toContain('screen');
  });

  test('keeps the screen between the side banks and the bottom bank', () => {
    const markup = renderToStaticMarkup(createElement(Mfd, { label: 'Order', children: 'PAGE' }));
    const order = ['mfd-top-buttons', 'mfd-left-buttons', 'mfd-right-buttons', 'mfd-screen'];
    let at = -1;
    for (const className of order) {
      const next = markup.indexOf(className);
      expect(next).toBeGreaterThan(at);
      at = next;
    }
    expect(markup.indexOf('mfd-bottom-buttons')).toBeGreaterThan(markup.indexOf('mfd-screen'));
  });
});

describe('navigation map page', () => {
  const aircraft = { x: 0, z: 0, headingDegrees: 0 };
  const render = (map: NavigationMapState) =>
    renderToStaticMarkup(createElement(TerrainMap, { map, aircraft, selectedWaypointId: 1 }));

  test('keeps the orientation buttons and zoom buttons on the retained bezel', () => {
    const markup = render({ status: 'loading' });
    const rendered = labels(markup);
    for (const label of [
      'Regional navigation map',
      'North-up map',
      'Heading-up map',
      'Zoom map out',
      'Zoom map in',
      'Waypoint teleport',
    ])
      expect(rendered).toContain(label);
    // Zoom starts at 1x, so only zoom-out is unavailable.
    expect([...markup.matchAll(/disabled/g)].length).toBeGreaterThan(0);
    expect(markup).toContain('data-terrain-map="loading"');
    expect(markup).toContain('data-map-orientation="north-up"');
    expect(markup).toContain('data-map-rotation="0"');
  });

  test('reports an unavailable map on the screen rather than throwing', () => {
    expect(render({ status: 'error', error: 'no manifest' })).toContain('Map unavailable');
  });
});
