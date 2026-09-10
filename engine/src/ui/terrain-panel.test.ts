import { expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TerrainViewer } from './TerrainViewer';
import { DEFAULT_MISSION } from '../sim/mission/params';

test('quick missions start with terrain tools collapsed; practice and explorer remain expanded', () => {
  for (const mode of ['quick-fight', 'free-flight', 'explorer'] as const) {
    const markup = renderToStaticMarkup(
      createElement(TerrainViewer, {
        mission: { ...DEFAULT_MISSION, mode },
      }),
    );
    expect(markup.includes('id="flight-helper-content" hidden=""')).toBe(mode === 'quick-fight');
    if (mode === 'quick-fight') {
      expect(markup).toContain('Restore quick mission tools');
      expect(markup).toContain('aria-expanded="false"');
    }
  }
});
