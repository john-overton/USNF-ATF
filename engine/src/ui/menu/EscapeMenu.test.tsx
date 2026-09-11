import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { EscapeMenu, type EscapePage } from './EscapeMenu';
import { DEFAULT_MIXER } from '../../flight/AudioMixer';
const render = (page: EscapePage) =>
  renderToStaticMarkup(
    <EscapeMenu
      page={page}
      onPage={() => undefined}
      onCommand={() => undefined}
      levels={DEFAULT_MIXER}
      onLevel={() => undefined}
      muted={false}
      onMute={() => undefined}
      settingsHost={() => undefined}
      error=""
    />,
  );
test('classic escape bar offers resume, settings, mixer, briefing and confirmed exits', () => {
  const page = render('flight');
  for (const text of [
    'Resume · Esc',
    'Settings',
    'Volume mixer',
    'Mission brief',
    'Debrief',
    'Main menu',
    'Quit game',
  ])
    expect(page).toContain(text);
  expect(page).toContain('aria-modal="true"');
  expect(page).not.toContain('There is no in-flight save');
  expect(render('quit')).toContain('There is no in-flight save');
  expect(render('leave')).toContain('End flight and return to menu');
});
test('volume mixer exposes six labeled real groups and a mute control', () => {
  const page = render('mixer');
  expect([...page.matchAll(/type="range"/g)]).toHaveLength(6);
  expect(page).toContain('Engines &amp; environment');
  expect(page).toContain('Explosions, radio &amp; warnings');
  expect(page).toContain('Mute all');
});
