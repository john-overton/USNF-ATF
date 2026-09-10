import { Shell } from './Shell';

/** The mount point's only job is to hand the shell the URL it was launched with. */
export function App({ search }: { search: string }) {
  return <Shell search={search} />;
}
