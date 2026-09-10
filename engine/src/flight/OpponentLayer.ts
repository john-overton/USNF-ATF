import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  type BufferGeometry,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  type Scene,
} from 'three';
import { AIRCRAFT, type AircraftId } from './aircraft-catalog';
import type { Platform } from '../platform/Platform';
import { RetailAircraft } from './RetailAircraft';
import type { CombatWorld } from '../sim/combat/world';
import { damagePercent } from '../sim/combat/damage';
import { FlightGun } from './FlightGun';
import type { MissionParams } from '../sim/mission/params';
import { AircraftDamage } from './AircraftDamage';

/**
 * The rendering and asset half of the guns-only quick fight. The flying itself is
 * `sim/combat/world.ts`, which is pure and knows nothing about three.js; this
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
  private world?: CombatWorld;
  private readonly guns = new Map<number, FlightGun>();
  private readonly groups = new Map<number, Group>();
  private readonly models: RetailAircraft[] = [];
  private readonly skins = new Map<number, AircraftDamage>();
  private readonly placeholderGroups: Group[] = [];
  private clearPlaceholders(): void {
    for (const group of this.placeholderGroups)
      group.traverse((object) => {
        if (object instanceof Mesh) {
          (object.geometry as BufferGeometry).dispose();
          (object.material as MeshStandardMaterial).dispose();
        }
      });
    this.placeholderGroups.length = 0;
  }
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

  /** The simulation owns poses, damage and ammunition; this adapter only draws them. */
  bind(world: CombatWorld): void {
    this.world = world;
    for (const skin of this.skins.values()) skin.dispose();
    this.skins.clear();
    this.clearPlaceholders();
    for (const group of this.groups.values()) this.scene.remove(group);
    this.groups.clear();
    for (const gun of this.guns.values()) gun.dispose();
    this.guns.clear();
    for (const entity of world.entities.slice(1)) {
      const group = new Group();
      const model = this.loaded.get(entity.aircraft);
      // The same placeholder shape the player falls back to, so a missing import
      // is visibly a placeholder rather than an invisible aircraft.
      const airframe = model ? model.group.clone(true) : placeholder(entity.aircraft);
      if (!model) this.placeholderGroups.push(airframe);
      group.add(airframe);
      this.scene.add(group);
      this.groups.set(entity.id, group);
      this.skins.set(entity.id, new AircraftDamage(group));
      const gun = FlightGun.combat(entity.definition.gun, entity.gun);
      this.guns.set(entity.id, gun);
      this.scene.add(gun.lines);
    }
  }

  render(origin: { x: number; z: number }): void {
    for (const entity of this.world?.entities.slice(1) ?? []) {
      const group = this.groups.get(entity.id);
      if (!group) continue;
      this.guns.get(entity.id)?.render(origin);
      group.visible = entity.ready && !entity.damage.destroyed && !this.world?.departureProtected;
      this.skins.get(entity.id)?.update(damagePercent(entity.damage));
      group.position.set(
        entity.state.position.x - origin.x,
        entity.state.position.y,
        entity.state.position.z - origin.z,
      );
      group.quaternion.copy(
        new Quaternion(
          entity.state.attitude.x,
          entity.state.attitude.y,
          entity.state.attitude.z,
          entity.state.attitude.w,
        ),
      );
    }
  }
  source(id: number): Group | undefined {
    return this.groups.get(id);
  }

  diagnostics() {
    return (this.world?.entities.slice(1) ?? []).map((entity) => ({
      id: entity.id,
      aircraft: entity.aircraft,
      skill: entity.skill,
      steps: entity.steps,
      position: { ...entity.state.position },
      attitude: { ...entity.state.attitude },
      speedMps: Math.hypot(
        entity.state.velocity.x,
        entity.state.velocity.y,
        entity.state.velocity.z,
      ),
      modelLoaded: !!this.loaded.get(entity.aircraft),
      damagePercent: damagePercent(entity.damage),
      destroyed: entity.damage.destroyed,
      activity: entity.activity,
      targetId: entity.targetId,
      roundsFired: entity.gun.fired,
      remaining: entity.gun.remaining,
      hits: entity.hits,
      kills: entity.kills,
    }));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const skin of this.skins.values()) skin.dispose();
    this.skins.clear();
    this.clearPlaceholders();
    for (const group of this.groups.values()) this.scene.remove(group);
    this.groups.clear();
    for (const gun of this.guns.values()) gun.dispose();
    this.guns.clear();
    for (const model of this.models) {
      model.group.traverse((object) => {
        if (object instanceof Mesh) {
          (object.geometry as BufferGeometry).dispose();
          (object.material as MeshStandardMaterial).dispose();
        }
      });
      model.dispose();
    }
    this.models.length = 0;
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
