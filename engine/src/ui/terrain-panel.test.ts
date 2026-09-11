import { expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { moonPhaseIcon, TerrainViewer } from './TerrainViewer';
import { DEFAULT_MISSION, parseMissionQuery } from '../sim/mission/params';

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

test('the theater control is available in flight helpers as well as the explorer', () => {
  const markup = renderToStaticMarkup(
    createElement(TerrainViewer, {
      mission: {
        ...DEFAULT_MISSION,
        mode: 'free-flight',
        theater: 'salt-lake',
        manifestPath: 'terrains/salt-lake/manifest.json',
      },
      onMission: () => undefined,
    }),
  );
  expect(markup).toContain('id="terrain-theater"');
  expect(markup).toContain('value="salt-lake"');
  expect(markup).toContain('Salt Lake &amp; Front Range');
});

test('practice links preserve the active theater and selected aircraft/model', () => {
  const mission = {
    ...DEFAULT_MISSION,
    theater: 'salt-lake',
    manifestPath: 'terrains/salt-lake/manifest.json',
    aircraft: 'a4e' as const,
    flightModel: 'assisted' as const,
  };
  const markup = renderToStaticMarkup(createElement(TerrainViewer, { mission }));
  const links = [...markup.matchAll(/href="([^"]+)"/g)]
    .map((m) => m[1]!.replaceAll('&amp;', '&'))
    .filter((href) => !href.includes('probe'));
  expect(links).toHaveLength(4);
  for (const link of links)
    expect(parseMissionQuery(link)).toMatchObject({
      theater: mission.theater,
      manifestPath: mission.manifestPath,
      aircraft: mission.aircraft,
      flightModel: mission.flightModel,
    });
  expect(links.slice(0, 3).map((link) => parseMissionQuery(link).start)).toEqual([
    'runway',
    'approach',
    'airborne',
  ]);
});

test('moon date icon covers all eight conventional phases', () => {
  expect(moonPhaseIcon(0, true)).toEqual({ icon: '🌑', label: 'New moon' });
  expect(moonPhaseIcon(0.25, true)).toEqual({ icon: '🌒', label: 'Waxing crescent' });
  expect(moonPhaseIcon(0.5, true)).toEqual({ icon: '🌓', label: 'First quarter' });
  expect(moonPhaseIcon(0.75, true)).toEqual({ icon: '🌔', label: 'Waxing gibbous' });
  expect(moonPhaseIcon(1, true)).toEqual({ icon: '🌕', label: 'Full moon' });
  expect(moonPhaseIcon(0.75, false)).toEqual({ icon: '🌖', label: 'Waning gibbous' });
  expect(moonPhaseIcon(0.5, false)).toEqual({ icon: '🌗', label: 'Last quarter' });
  expect(moonPhaseIcon(0.25, false)).toEqual({ icon: '🌘', label: 'Waning crescent' });
});
