import { RendererProbe } from './RendererProbe';
import { TerrainViewer } from './TerrainViewer';

export function App() {
  return new URLSearchParams(window.location.search).get('view') === 'probe' ? (
    <RendererProbe />
  ) : (
    <TerrainViewer />
  );
}
