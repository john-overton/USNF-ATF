import { BoxGeometry, type Group, Mesh, type MeshStandardMaterial } from 'three';
import type { AircraftId } from './aircraft-catalog';

/** Original visual hook; no arresting force or recovered retail animation. */
export function configureAircraftHook(
  hook: Group,
  id: AircraftId,
  imported: boolean,
  material: MeshStandardMaterial,
): void {
  const skyhawk = imported && id === 'a4e';
  // Skyhawk mount is beneath the aft wing root, with the shoe under the tail.
  // Keep the F-14/placeholder presentation exactly as before.
  const length = skyhawk ? 3.15 : 2.4;
  hook.position.set(0, skyhawk ? -0.86 : -0.6, imported ? (skyhawk ? 2.24 : 6) : 3);
  const arm = new Mesh(new BoxGeometry(skyhawk ? 0.075 : 0.12, 0.12, length), material);
  arm.position.z = length / 2;
  hook.add(arm);
  if (skyhawk) {
    const shoe = new Mesh(new BoxGeometry(0.18, 0.16, 0.25), material);
    shoe.position.set(0, -0.08, length - 0.1);
    hook.add(shoe);
  }
  hook.visible = id !== 'x31';
  hook.userData.armLength = length;
  hook.userData.stowedAngle = skyhawk ? -0.18 : 0;
  hook.userData.deployAngle = skyhawk ? 0.4 : Math.PI / 4;
}
