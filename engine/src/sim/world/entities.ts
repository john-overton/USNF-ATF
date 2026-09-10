/**
 * Deterministic spawn layouts and the preserved straight-course test fixture.
 * Runtime opponents now live in sim/combat/world.ts. The mock stepping helpers
 * below remain useful for checking spawn/clock behavior independently of combat.
 *
 * This is a **mock**, and the plan it comes from says so plainly: what is real is
 * the entity list, the deterministic spawn, and the fact that everything steps
 * inside the same 120 Hz clock as the player. What is not real is the flying. Each
 * opponent holds a heading, a speed and an altitude. The AI virtual machine in
 * `sim/ai/` is not bound to aircraft state yet, and calling this combat would
 * misreport phases 6 and 7.
 *
 * It is shaped so that landing the AI replaces one function — `stepEntity` — rather
 * than a system: the entity already carries the position, velocity and attitude a
 * real flight model would produce, and the renderer only reads those.
 *
 * Determinism is a hard requirement. Spawns come from `MissionParams.seed` through
 * a small counter-based generator, and stepping is a pure function of the fixed
 * timestep, so a run at 30 Hz and a run at 144 Hz produce bit-identical results.
 */
import type { AircraftId } from '../../flight/aircraft-catalog';
import type { AiSkill, MissionParams } from '../mission/params';

export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

export interface EntityProfile {
  /** Radians, north-referenced the way the rest of the sim measures heading. */
  headingRad: number;
  speedMps: number;
  altitudeM: number;
}

export interface WorldEntity {
  id: number;
  aircraft: AircraftId;
  skill: AiSkill;
  profile: EntityProfile;
  position: Vector3Like;
  velocity: Vector3Like;
  /** Whole fixed steps this entity has taken; the liveness probe reads it. */
  steps: number;
}

/** Where the opponents are put relative to the player, in metres. */
export const SPAWN_RANGE_M = 6000;
export const SPAWN_SPREAD_M = 1200;
export const MIN_ALTITUDE_M = 300;

/**
 * A counter-based generator: `seed` and an index in, one number in 0..1 out, with
 * no hidden state. Two runs of the same mission spawn the same aircraft in the same
 * places whatever the frame rate did.
 */
export function seededUnit(seed: number, index: number): number {
  let hash = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 15), 0x2545f491) >>> 0;
  hash = (hash ^ (hash >>> 13)) >>> 0;
  return hash / 0x100000000;
}

const velocityFor = (profile: EntityProfile): Vector3Like => ({
  // The sim's own convention: a bearing b points along (-sin b, cos b), so an
  // identity attitude is heading 180 and flies -Z. See sim/flight bearingDegrees.
  x: -Math.sin(profile.headingRad) * profile.speedMps,
  y: 0,
  z: Math.cos(profile.headingRad) * profile.speedMps,
});

/**
 * Configurable encounter geometry, relative to the player's initial bearing.
 * Wingmen have deterministic lateral spacing; the selected range/altitude apply
 * exactly to the formation leader. Terrain clearance is checked by the world.
 */
export function spawnEntities(
  mission: MissionParams,
  player: { position: Vector3Like; headingRad: number },
): WorldEntity[] {
  return mission.opponents.map((slot, index) => {
    const encounter = mission.encounter;
    const spread =
      index === 0 ? 0 : (index % 2 ? 1 : -1) * (400 + seededUnit(mission.seed, index) * 800);
    const altitude = Math.max(MIN_ALTITUDE_M, player.position.y + encounter.altitudeOffsetM);
    const heading =
      player.headingRad +
      (encounter.orientation === 'head-on'
        ? Math.PI
        : encounter.orientation === 'crossing'
          ? -Math.PI / 2
          : 0);
    const bearing =
      player.headingRad +
      (encounter.orientation === 'behind'
        ? Math.PI
        : encounter.orientation === 'crossing'
          ? Math.PI / 2
          : 0);
    const ahead = {
      x: player.position.x - Math.sin(bearing) * encounter.distanceM,
      z: player.position.z + Math.cos(bearing) * encounter.distanceM,
    };
    // Offset across the player's track, so the spread is lateral at any heading.
    const across = { x: Math.cos(player.headingRad), z: Math.sin(player.headingRad) };
    const profile: EntityProfile = {
      headingRad: heading,
      speedMps: 180 + Math.round(seededUnit(mission.seed, index + 128) * 60),
      altitudeM: altitude,
    };
    return {
      id: index + 1,
      aircraft: slot.aircraft,
      skill: slot.skill,
      profile,
      position: {
        x: ahead.x + across.x * spread,
        y: altitude,
        z: ahead.z + across.z * spread,
      },
      velocity: velocityFor(profile),
      steps: 0,
    };
  });
}

/**
 * One fixed step for one opponent. This is the seam: when the AI host is bound to
 * aircraft state it replaces the body of this function, and nothing else changes.
 */
export function stepEntity(entity: WorldEntity, dt: number): WorldEntity {
  const velocity = velocityFor(entity.profile);
  return {
    ...entity,
    velocity,
    position: {
      x: entity.position.x + velocity.x * dt,
      y: entity.profile.altitudeM,
      z: entity.position.z + velocity.z * dt,
    },
    steps: entity.steps + 1,
  };
}

export function stepEntities(entities: readonly WorldEntity[], dt: number): WorldEntity[] {
  return entities.map((entity) => stepEntity(entity, dt));
}

/** The heading an entity presents, for a marker or a future sensor. */
export function entityHeadingRad(entity: WorldEntity): number {
  return entity.profile.headingRad;
}
