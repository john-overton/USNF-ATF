import type { Platform } from '../platform/Platform';
import { parseRetailGun, type GunDefinition } from '../data/retail-gun';
import { parseRetailLoadout } from '../data/retail-loadout';
import { ORIGINAL_COMBAT, ORIGINAL_GUN, type CombatDefinition } from '../sim/combat/world';
import type { AircraftId } from './aircraft-catalog';

/** Existing local port outputs supply HP and JT damage; legacy ports remain usable. */
export async function loadCombatDefinition(
  platform: Platform,
  id: AircraftId,
): Promise<CombatDefinition> {
  const read = async (file: string) => {
    if (!(await platform.fs.exists('appData', file))) return undefined;
    const text = await platform.fs.readText('appData', file);
    if (text.length > 5000000) throw new Error('Combat manifest exceeds 5 MB');
    return JSON.parse(text) as unknown;
  };
  const source = { f14: 'F14.PT', a4e: 'A4E.PT', x31: 'F31.PT' }[id];
  const rawGun = await read(`aircraft/${id}-gun.json`);
  const importedGun = rawGun === undefined ? undefined : parseRetailGun(rawGun);
  const rawLoadout = await read(`aircraft/${id}-loadout.json`);
  const loadout = rawLoadout === undefined ? undefined : parseRetailLoadout(rawLoadout);
  if (
    (importedGun && importedGun.aircraftSource !== source) ||
    (loadout && loadout.aircraftSource !== source)
  )
    throw new Error('Combat aircraft mismatch');
  if (importedGun && loadout && importedGun.aircraftSha256 !== loadout.aircraftSha256)
    throw new Error('Combat gun and loadout disagree about source PT');
  const gunStore = loadout && Object.values(loadout.stores).find((s) => s.internalGun);
  const damage = importedGun?.damage ?? gunStore?.damage;
  const gun: GunDefinition = {
    ...(importedGun ?? ORIGINAL_GUN),
    damage: damage ?? [...ORIGINAL_GUN.damage!],
  };
  return {
    gun,
    hitPoints: loadout?.hitPoints ?? ORIGINAL_COMBAT.hitPoints,
    source:
      importedGun && damage && loadout ? 'retail' : importedGun || loadout ? 'mixed' : 'original',
  };
}
