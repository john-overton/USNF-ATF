import { RendererProbe } from './RendererProbe';
import { TerrainViewer } from './TerrainViewer';
import { isProbeQuery } from '../sim/mission/params';

/**
 * The whole routing story, for now: the renderer diagnostic or the game. The search
 * string is read once, in main.tsx, and handed down; step 2 of the game shell plan
 * replaces this with a screen state machine that still honours the same deep links.
 */
export function App({ search }: { search: string }) {
  return isProbeQuery(search) ? <RendererProbe /> : <TerrainViewer search={search} />;
}
