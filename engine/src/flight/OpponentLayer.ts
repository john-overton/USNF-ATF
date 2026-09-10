import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Scene,
} from 'three';
import { AIRCRAFT, type AircraftId } from './aircraft-catalog';
import type { Platform } from '../platform/Platform';
import { RetailAircraft } from './RetailAircraft';
import {
  spawnEntities,
  stepEntities,
  type Vector3Like,
  type WorldEntity,
} from '../sim/world/entities';
import type { MissionParams } from '../sim/mission/params';

/**
 * The rendering and asset half of the mocked quick fight. The flying itself is
 * `sim/world/entities.ts`, which is pure and knows nothing about three.js; this
 * adapter owns the models and the scene graph, exactly as `FlightLayer` does for
 * the player.
 *
 * Two constraints from AGENTS.md are load-bearing here. Every opponent is placed
 * relative to the terrain's floating origin, never in absolute world metres, or it
 * would lose precision at theater scale. And every entity advances inside the
 * player's own 120 Hz clock, so adding aircraft cannot change what the simulation
 * does per step.
 */
export class OpponentLayer {
  private entities: WorldEntity[] = [];
  private readonly groups = new Map<number, Group>();
  private readonly models: RetailAircraft[] = [];
  private disposed = false;

  private constructor(
    private readonly scene: Scene,
    private readonly loaded: Map<AircraftId, RetailAircraft | undefined>,
  ) {}

  static async create(
    scene: Scene,
    platform: Platform,
    mission: MissionParams,
  ): Promise<OpponentLayer> {
    const loaded = new Map<AircraftId, RetailAircraft | undefined>();
    const layer = new OpponentLayer(scene, loaded);
    try {
      for (const id of new Set(mission.opponents.map((slot) => slot.aircraft))) {
        const model = await RetailAircraft.load(platform, id);
        loaded.set(id, model);
        if (model) layer.models.push(model);
      }
    } catch (error) {
      layer.dispose();
      throw error;
    }
    return layer;
  }

  /** Deterministic from the mission seed and where the player actually started. */
  spawn(mission: MissionParams, player: { position: Vector3Like; headingRad: number }): void {
    for (const group of this.groups.values()) this.scene.remove(group);
    this.groups.clear();
    this.entities = spawnEntities(mission, player);
    for (const entity of this.entities) {
      const group = new Group();
      const model = this.loaded.get(entity.aircraft);
      // The same placeholder shape the player falls back to, so a missing import
      // is visibly a placeholder rather than an invisible aircraft.
      group.add(model ? model.group.clone(true) : placeholder(entity.aircraft));
      this.scene.add(group);
      this.groups.set(entity.id, group);
    }
  }

  /** One fixed step, called from the player's clock so the rate cannot drift. */
  advance(dt: number): void {
    if (this.disposed || this.entities.length === 0) return;
    this.entities = stepEntities(this.entities, dt);
  }

  render(origin: { x: number; z: number }): void {
    for (const entity of this.entities) {
      const group = this.groups.get(entity.id);
      if (!group) continue;
      group.position.set(
        entity.position.x - origin.x,
        entity.position.y,
        entity.position.z - origin.z,
      );
      group.quaternion.copy(
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), entity.profile.headingRad),
      );
    }
  }

  diagnostics(): {
    id: number;
    aircraft: AircraftId;
    skill: number;
    steps: number;
    position: Vector3Like;
    speedMps: number;
    modelLoaded: boolean;
  }[] {
    return this.entities.map((entity) => ({
      id: entity.id,
      aircraft: entity.aircraft,
      skill: entity.skill,
      steps: entity.steps,
      position: { ...entity.position },
      speedMps: entity.profile.speedMps,
      modelLoaded: !!this.loaded.get(entity.aircraft),
    }));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const group of this.groups.values()) this.scene.remove(group);
    this.groups.clear();
    for (const model of this.models) model.dispose();
    this.models.length = 0;
    this.entities = [];
  }
}

/** Original placeholder airframe, scaled by the aircraft's own length. */
function placeholder(id: AircraftId): Group {
  const group = new Group();
  const skin = new MeshStandardMaterial({ color: 0xb9c2cc, roughness: 0.7 });
  const trim = new MeshStandardMaterial({ color: 0x6d3b3b, roughness: 0.8 });
  const body = new Mesh(new CylinderGeometry(0.8, 0.6, 9, 10), skin);
  body.rotation.x = Math.PI / 2;
  const nose = new Mesh(new ConeGeometry(0.8, 2, 10), trim);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -5.5;
  const wing = new Mesh(new BoxGeometry(11, 0.2, 2.4), trim);
  const fin = new Mesh(new BoxGeometry(0.16, 2, 1.8), trim);
  fin.position.set(0, 1, 3.3);
  group.add(body, nose, wing, fin);
  group.scale.setScalar(AIRCRAFT[id].length / 19.1);
  return group;
}
