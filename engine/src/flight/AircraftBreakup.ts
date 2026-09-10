import { Euler, Quaternion, Vector3, type Group, type Scene } from 'three';
import type { CombatEvent, CombatWorld } from '../sim/combat/world';
import type { GroundSample } from '../sim/flight';
import { seededUnit } from '../sim/world/entities';
import { splitAirframe, disposeFragments, type AirframeFragment } from './AircraftDamage';

interface Piece extends AirframeFragment {
  position: Vector3;
  velocity: Vector3;
  spin: Vector3;
  settled: boolean;
}
interface Wreck {
  event: CombatEvent;
  pieces: Piece[];
  step: number;
}
/** Original fracture zones with event-seeded motion, integrated at the sim's 120 Hz. */
export class AircraftBreakup {
  private wrecks: Wreck[] = [];
  private lastEvent = 0;
  constructor(private scene: Scene) {}
  render(
    world: CombatWorld,
    origin: { x: number; z: number },
    source: (id: number) => Group | undefined,
    ground: (x: number, z: number) => GroundSample | undefined,
  ): void {
    for (const event of world.events) {
      if (event.id <= this.lastEvent) continue;
      this.lastEvent = event.id;
      if (event.type !== 'destroyed') continue;
      const model = source(event.targetId);
      if (!model) continue;
      if (this.wrecks.length === 4) disposeFragments(this.wrecks.shift()!.pieces);
      const attitude = new Quaternion(
        event.attitude.x,
        event.attitude.y,
        event.attitude.z,
        event.attitude.w,
      );
      const pieces = splitAirframe(model).map((fragment, index): Piece => {
        const rand = (n: number) => seededUnit(event.id * 17 + event.targetId, index * 8 + n);
        const position = fragment.center
          .clone()
          .applyQuaternion(attitude)
          .add(new Vector3(event.point.x, event.point.y, event.point.z));
        fragment.group.quaternion.copy(attitude);
        this.scene.add(fragment.group);
        return {
          ...fragment,
          position,
          velocity: new Vector3(
            event.velocity.x * 0.65 + (rand(0) - 0.5) * 40,
            event.velocity.y * 0.35 + 10 + rand(1) * 20,
            event.velocity.z * 0.65 + (rand(2) - 0.5) * 40,
          ),
          spin: new Vector3(rand(3) - 0.5, rand(4) - 0.5, rand(5) - 0.5).multiplyScalar(4),
          settled: false,
        };
      });
      this.wrecks.push({ event, pieces, step: event.step });
    }
    for (const wreck of [...this.wrecks]) {
      if (world.steps - wreck.event.step > 2400) {
        disposeFragments(wreck.pieces);
        this.wrecks.splice(this.wrecks.indexOf(wreck), 1);
        continue;
      }
      while (wreck.step < world.steps) {
        wreck.step++;
        for (const piece of wreck.pieces) {
          if (piece.settled) continue;
          piece.velocity.multiplyScalar(Math.exp(-0.18 / 120));
          piece.velocity.y -= 9.80665 / 120;
          piece.position.addScaledVector(piece.velocity, 1 / 120);
          piece.group.quaternion.multiply(
            new Quaternion().setFromEuler(
              new Euler(piece.spin.x / 120, piece.spin.y / 120, piece.spin.z / 120),
            ),
          );
          const surface = ground(piece.position.x, piece.position.z);
          if (surface && piece.position.y <= surface.height + 0.4) {
            piece.position.y = surface.height + (surface.kind === 'water' ? -1 : 0.4);
            piece.settled = true;
          }
        }
      }
      for (const piece of wreck.pieces)
        piece.group.position.set(
          piece.position.x - origin.x,
          piece.position.y,
          piece.position.z - origin.z,
        );
    }
  }
  burningPieces(steps: number) {
    return this.wrecks.flatMap((w) =>
      w.event.cause !== 'water' && steps - w.event.step < 1200
        ? w.pieces
            .filter((p) => p.group.children.length)
            .map((p) => ({ position: p.position, age: (steps - w.event.step) / 120 }))
        : [],
    );
  }
  diagnostics() {
    return {
      wrecks: this.wrecks.length,
      fragments: this.wrecks.reduce(
        (n, w) => n + w.pieces.filter((p) => p.group.children.length).length,
        0,
      ),
    };
  }
  reset(): void {
    for (const wreck of this.wrecks) disposeFragments(wreck.pieces);
    this.wrecks = [];
    this.lastEvent = 0;
  }
  dispose(): void {
    this.reset();
  }
}
