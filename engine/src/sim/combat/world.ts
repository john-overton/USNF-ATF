/** Guns-only world. Authored pursuit/visual acquisition, not the retail AI host.
 * Absolute metres throughout; rendering and React never advance this state. */
import {
  attitudeFromEuler,
  createFlightState,
  flightEuler,
  type FlightState,
  type GroundSample,
  type Vec3,
  type Quaternion,
} from '../flight';
import { createGunState, stepGun, type GunState } from '../flight/gun';
import type { GunDefinition } from '../../data/retail-gun';
import { AIRCRAFT, type AircraftId } from '../../flight/aircraft-catalog';
import type { MissionParams } from '../mission/params';
import { spawnEntities } from '../world/entities';
import {
  applyDamage,
  createDamageState,
  damageEffects,
  damagePercent,
  destroy,
  type DamageState,
} from './damage';
import { aircraftCapsule, movingCapsuleHit } from './hits';
import { detect, forwardAxis, type Sensor, type WeatherCondition } from './sensors';

export const ORIGINAL_GUN: GunDefinition = {
  name: 'Original practice cannon',
  capacity: 600,
  muzzleSpeedMps: 1000,
  roundsPerSecond: 30,
  tracerEvery: 3,
  tracerColor: 'red',
  mounts: [[0, 0, -6]],
  damage: [10, 10, 10, 10, 10],
};
export interface CombatDefinition {
  gun: GunDefinition;
  hitPoints: number;
  /** Explicitly reported when a legacy/missing import needs original defaults. */
  source: 'retail' | 'original' | 'mixed';
}
export const ORIGINAL_COMBAT: CombatDefinition = {
  gun: ORIGINAL_GUN,
  hitPoints: 100,
  source: 'original',
};
const zone = {
  halfAngleHRad: Math.PI,
  halfAngleVRad: Math.PI / 2,
  minRangeM: 0,
  maxRangeM: 12000,
  minAltM: -10000,
  maxAltM: 100000,
};
/** Original visual sight. Radar/SEE loading and terrain LOS are separate from gun ranging. */
const VISUAL: Sensor = {
  name: 'Visual',
  kind: 'visual',
  lookDownPenaltyPercent: 0,
  search: zone,
  track: { ...zone, halfAngleHRad: Math.PI / 3, halfAngleVRad: Math.PI / 3, maxRangeM: 6000 },
};
export interface Combatant {
  ready: boolean;
  id: number;
  aircraft: AircraftId;
  team: 'player' | 'opponent';
  skill: number;
  state: FlightState;
  previous: FlightState;
  damage: DamageState;
  definition: CombatDefinition;
  gun: GunState;
  targetId: number | null;
  contacts: { id: number; rangeM: number; level: 'search' | 'track' }[];
  activity: 'holding' | 'search' | 'pursue' | 'firing' | 'destroyed';
  steps: number;
  hits: number;
  kills: number;
}
export interface CombatEvent {
  id: number;
  step: number;
  type: 'hit' | 'destroyed' | 'terrain';
  shooterId: number | null;
  targetId: number;
  point: Vec3;
  velocity: Vec3;
  attitude: Quaternion;
  cause: 'gun' | 'ground' | 'water';
}
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const delta = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const magnitude = (p: Vec3) => Math.hypot(p.x, p.y, p.z);
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});
const angle = (n: number) => Math.atan2(Math.sin(n), Math.cos(n));

export class CombatWorld {
  readonly entities: Combatant[];
  readonly events: CombatEvent[] = [];
  steps = 0;
  private eventId = 0;
  private departureTicks = 0;
  private readonly mission: MissionParams;
  departureProtected: boolean;
  outcome: 'active' | 'victory' | 'defeat' | 'practice' = 'active';
  constructor(
    mission: MissionParams,
    player: FlightState,
    definitions: ReadonlyMap<AircraftId, CombatDefinition>,
    playerGun?: GunState,
  ) {
    this.mission = mission;
    this.departureProtected =
      mission.mode === 'quick-fight' &&
      mission.start === 'runway' &&
      mission.encounter.departureGraceSeconds > 0;
    const make = (
      id: number,
      aircraft: AircraftId,
      state: FlightState,
      skill: number,
    ): Combatant => {
      const definition = definitions.get(aircraft) ?? ORIGINAL_COMBAT;
      return {
        ready: id === 0,
        id,
        aircraft,
        team: id === 0 ? 'player' : 'opponent',
        skill,
        state,
        previous: state,
        damage: createDamageState(definition.hitPoints),
        definition,
        gun: createGunState(definition.gun),
        targetId: null,
        contacts: [],
        activity: 'search',
        steps: 0,
        hits: 0,
        kills: 0,
      };
    };
    const nose = forwardAxis(player.attitude);
    this.entities = [
      make(0, mission.aircraft, player, 3),
      ...spawnEntities(mission, {
        position: player.position,
        headingRad: Math.atan2(-nose.x, nose.z),
      }).map((e) =>
        make(
          e.id,
          e.aircraft,
          createFlightState({
            position: e.position,
            yawRad: Math.PI - e.profile.headingRad,
            airspeed: e.profile.speedMps,
          }),
          e.skill,
        ),
      ),
    ];
    if (playerGun) this.player.gun = playerGun;
    if (this.entities.length === 1) this.outcome = 'practice';
  }
  get player(): Combatant {
    return this.entities[0]!;
  }
  get target(): Combatant | undefined {
    return this.entities.find((e) => e.id === this.player.targetId && !e.damage.destroyed);
  }
  private event(event: Omit<CombatEvent, 'step' | 'id' | 'velocity' | 'attitude'>): void {
    const target = this.entities.find((e) => e.id === event.targetId);
    this.events.push({
      ...event,
      id: ++this.eventId,
      step: this.steps,
      velocity: { ...(target?.previous.velocity ?? { x: 0, y: 0, z: 0 }) },
      attitude: { ...(target?.state.attitude ?? { x: 0, y: 0, z: 0, w: 1 }) },
    });
    if (this.events.length > 128) this.events.shift();
  }
  private kill(
    target: Combatant,
    shooter: Combatant | undefined,
    point: Vec3,
    cause: CombatEvent['cause'] = 'gun',
  ): void {
    if (target.damage.destroyed) return;
    target.damage = destroy(target.damage);
    target.state = { ...target.state, status: 'crashed' };
    target.activity = 'destroyed';
    target.targetId = null;
    if (shooter && shooter.team !== target.team) shooter.kills++;
    this.event({
      type: 'destroyed',
      shooterId: shooter?.id ?? null,
      targetId: target.id,
      point: { ...point },
      cause,
    });
  }
  private acquire(
    weather: WeatherCondition,
    sampleGround: (x: number, z: number) => GroundSample | undefined,
  ): void {
    for (const observer of this.entities) {
      observer.contacts = [];
      if (observer.damage.destroyed || !observer.ready) {
        observer.targetId = null;
        continue;
      }
      for (const target of this.entities) {
        if (target.team === observer.team || target.damage.destroyed || !target.ready) continue;
        const result = detect(
          observer.state,
          VISUAL,
          { ...target.state, signatures: { visual: 100, radar: 100, laser: 100, infrared: 100 } },
          weather,
        );
        if (result.level === 'none') continue;
        let occluded = false;
        const samples = Math.max(1, Math.ceil(result.rangeM / 250));
        for (let i = 1; i < samples; i++) {
          const p = lerp(observer.state.position, target.state.position, i / samples);
          const surface = sampleGround(p.x, p.z);
          if (!surface || surface.height >= p.y) {
            occluded = true;
            break;
          }
        }
        if (!occluded)
          observer.contacts.push({ id: target.id, rangeM: result.rangeM, level: result.level });
      }
      observer.contacts.sort((a, b) => a.rangeM - b.rangeM || a.id - b.id);
      if (!observer.contacts.some((c) => c.id === observer.targetId))
        observer.targetId = observer.contacts[0]?.id ?? null;
    }
  }
  cycleTarget(): void {
    const contacts = this.player.contacts;
    const index = contacts.findIndex((c) => c.id === this.player.targetId);
    this.player.targetId = contacts[(index + 1) % contacts.length]?.id ?? null;
  }
  /** Both target motion and bullets use the same [start,end] interval. */
  step(
    nextPlayer: FlightState,
    trigger: boolean,
    safe: boolean,
    dt: number,
    sampleGround: (x: number, z: number) => GroundSample | undefined,
    weather: WeatherCondition = 'day',
  ): void {
    if (dt !== 1 / 120) throw new Error('Combat requires a 1/120 second step');
    this.steps++;
    if (this.departureProtected) {
      const ground = sampleGround(nextPlayer.position.x, nextPlayer.position.z);
      if (
        nextPlayer.status === 'airborne' &&
        ground &&
        nextPlayer.position.y - ground.height >= 100
      )
        this.departureTicks++;
      else this.departureTicks = 0;
      if (this.departureTicks >= this.mission.encounter.departureGraceSeconds * 120) {
        this.departureProtected = false;
        const nose = forwardAxis(nextPlayer.attitude);
        const spawns = spawnEntities(this.mission, {
          position: nextPlayer.position,
          headingRad: Math.atan2(-nose.x, nose.z),
        });
        for (const spawn of spawns) {
          const entity = this.entities.find((e) => e.id === spawn.id)!;
          entity.state = createFlightState({
            position: spawn.position,
            yawRad: Math.PI - spawn.profile.headingRad,
            airspeed: spawn.profile.speedMps,
          });
          entity.ready = false;
        }
      }
    }
    for (const e of this.entities) {
      if (!e.ready && !this.departureProtected) {
        const surface = sampleGround(e.state.position.x, e.state.position.z);
        if (surface) {
          e.state = {
            ...e.state,
            position: {
              ...e.state.position,
              y: Math.max(e.state.position.y, surface.height + 200),
            },
          };
          e.ready = true;
        }
      }
      e.previous = e.state;
      e.steps++;
    }
    if (!this.departureProtected && this.steps % 12 === 1) this.acquire(weather, sampleGround);
    const firing = new Map<number, boolean>([
      [0, trigger && !safe && !this.player.damage.destroyed && !this.departureProtected],
    ]);
    const terrainImpacts: { target: Combatant; t: number; point: Vec3 }[] = [];
    for (const e of this.entities.slice(1)) {
      if (e.damage.destroyed) continue;
      if (this.departureProtected || !e.ready) {
        e.activity = 'holding';
        continue;
      }
      const target = this.entities.find((t) => t.id === e.targetId);
      const pose = flightEuler(e.state.attitude);
      const health = damageEffects(e.damage);
      const speed = magnitude(e.state.velocity);
      let yaw = pose.yawRad,
        pitch = pose.pitchRad,
        bank = 0;
      e.activity = target ? 'pursue' : 'search';
      if (target) {
        const offset = delta(target.state.position, e.state.position);
        const range = magnitude(offset);
        const relativeVelocity = delta(target.state.velocity, e.state.velocity);
        const aimAt = (time: number) => ({
          x: offset.x + relativeVelocity.x * time,
          y: offset.y + relativeVelocity.y * time + 4.903325 * time ** 2,
          z: offset.z + relativeVelocity.z * time,
        });
        let leadTime = range / e.definition.gun.muzzleSpeedMps;
        for (let i = 0; i < 8; i++)
          leadTime = magnitude(aimAt(leadTime)) / e.definition.gun.muzzleSpeedMps;
        const aim = aimAt(leadTime);
        const yawError = angle(Math.atan2(-aim.x, -aim.z) - yaw);
        const pitchError = Math.atan2(aim.y, Math.hypot(aim.x, aim.z)) - pitch;
        const rate = ((3 + e.skill) * 9.80665 * health.gScale) / Math.max(80, speed);
        const turn = clamp(yawError, -rate * dt, rate * dt);
        yaw += turn;
        pitch += clamp(pitchError, -rate * dt, rate * dt);
        pitch = clamp(pitch, -0.75, 0.75);
        bank = clamp(((turn / dt) * speed) / 9.80665, -1, 1) * 0.9;
        const nose = forwardAxis(e.state.attitude);
        const alignment =
          (nose.x * aim.x + nose.y * aim.y + nose.z * aim.z) / Math.max(1, magnitude(aim));
        const fire =
          range < 1000 &&
          range > 40 &&
          alignment > Math.cos(0.0015 + (3 - e.skill) * 0.0005) &&
          e.state.timeSeconds % 2 < 0.65 + e.skill * 0.1;
        firing.set(e.id, fire);
        if (fire) e.activity = 'firing';
      }
      const desiredSpeed =
        (target ? clamp(magnitude(target.state.velocity) + 35, 180, 320) : 210) *
        Math.max(0.35, health.speedScale);
      const nextSpeed = speed + clamp(desiredSpeed - speed, -15 * dt, 8 * dt);
      const attitude = attitudeFromEuler(pitch, yaw, bank);
      const nose = forwardAxis(attitude);
      const velocity = { x: nose.x * nextSpeed, y: nose.y * nextSpeed, z: nose.z * nextSpeed };
      const position = {
        x: e.state.position.x + velocity.x * dt,
        y: e.state.position.y + velocity.y * dt,
        z: e.state.position.z + velocity.z * dt,
      };
      const ground = sampleGround(position.x, position.z);
      if (!ground) {
        firing.set(e.id, false);
        continue;
      }
      e.state = { ...e.state, position, velocity, attitude, timeSeconds: e.state.timeSeconds + dt };
      if (position.y <= ground.height + 2) {
        const t = clamp(
          (e.previous.position.y - ground.height - 2) /
            Math.max(1e-12, e.previous.position.y - position.y),
          0,
          1,
        );
        terrainImpacts.push({ target: e, t, point: lerp(e.previous.position, position, t) });
      }
    }
    this.player.state = nextPlayer;
    if (nextPlayer.status === 'crashed' && !this.player.damage.destroyed)
      terrainImpacts.push({ target: this.player, t: 1, point: nextPlayer.position });
    for (const shooter of this.entities) {
      stepGun(
        shooter.gun,
        shooter.definition.gun,
        shooter.previous,
        firing.get(shooter.id) === true && !shooter.damage.destroyed,
        false,
        dt,
      );
    }
    this.resolveRounds(sampleGround, terrainImpacts);
    if (this.player.damage.destroyed) this.outcome = 'defeat';
    else if (this.entities.length > 1 && this.entities.slice(1).every((e) => e.damage.destroyed))
      this.outcome = 'victory';
    // Death/lock loss must clear the sight in this same step.
    for (const e of this.entities) {
      if (e.damage.destroyed) e.contacts = [];
      e.contacts = e.contacts.filter(
        (c) => !this.entities.find((t) => t.id === c.id)?.damage.destroyed,
      );
      if (e.damage.destroyed || !e.contacts.some((c) => c.id === e.targetId)) e.targetId = null;
    }
  }
  private resolveRounds(
    sampleGround: (x: number, z: number) => GroundSample | undefined,
    terrainImpacts: { target: Combatant; t: number; point: Vec3 }[],
  ): void {
    const hits: {
      t: number;
      shooter: Combatant;
      target: Combatant;
      round: GunState['rounds'][number];
      point: Vec3;
    }[] = [];
    const consumed = new Set<GunState['rounds'][number]>();
    for (const shooter of this.entities)
      for (const round of shooter.gun.rounds) {
        let terrainT = Infinity;
        const distance = magnitude(delta(round.position, round.previousPosition));
        // Never invent sea level for unloaded terrain. Bound samples to 5 m.
        const count = Math.max(1, Math.ceil(distance / 5));
        for (let i = 0; i <= count; i++) {
          const p = lerp(round.previousPosition, round.position, i / count);
          const ground = sampleGround(p.x, p.z);
          if (ground && p.y <= ground.height) {
            terrainT = i / count;
            break;
          }
        }
        let first: (typeof hits)[number] | undefined;
        for (const target of this.entities) {
          if (target.id === shooter.id || target.damage.destroyed) continue;
          const hit = movingCapsuleHit(
            { from: round.previousPosition, to: round.position },
            {
              previousPosition: lerp(
                target.previous.position,
                target.state.position,
                round.emittedAt,
              ),
              capsule: aircraftCapsule(target.state, AIRCRAFT[target.aircraft].length),
            },
            true,
          );
          if (
            hit &&
            hit.t < terrainT &&
            (!first || hit.t < first.t || (hit.t === first.t && target.id < first.target.id))
          )
            first = { t: hit.t, shooter, target, round, point: hit.point };
        }
        if (first) {
          first.t = round.emittedAt + first.t * (1 - round.emittedAt);
          hits.push(first);
        } else if (terrainT !== Infinity) {
          consumed.add(round);
          const point = lerp(round.previousPosition, round.position, terrainT);
          this.event({
            type: 'terrain',
            shooterId: shooter.id,
            targetId: -1,
            point,
            cause: sampleGround(point.x, point.z)?.kind === 'water' ? 'water' : 'ground',
          });
        }
      }
    hits.sort((a, b) => a.t - b.t || a.shooter.id - b.shooter.id || a.target.id - b.target.id);
    terrainImpacts.sort((a, b) => a.t - b.t || a.target.id - b.target.id);
    let terrainIndex = 0;
    const finishTerrain = (until: number) => {
      while (terrainIndex < terrainImpacts.length && terrainImpacts[terrainIndex]!.t <= until) {
        const impact = terrainImpacts[terrainIndex++]!;
        const surface = sampleGround(impact.point.x, impact.point.z);
        this.kill(
          impact.target,
          undefined,
          impact.point,
          surface?.kind === 'water' ? 'water' : 'ground',
        );
      }
    };
    for (const hit of hits) {
      finishTerrain(hit.t);
      consumed.add(hit.round);
      if (hit.target.damage.destroyed) continue;
      // Aircraft use soft-target slot 0: explicit authored mapping until native class dispatch is recovered.
      const amount = hit.shooter.definition.gun.damage?.[0] ?? 10;
      const damaged = applyDamage(hit.target.damage, amount);
      if (damaged.accumulated === hit.target.damage.accumulated) continue;
      hit.shooter.hits++;
      this.event({
        type: 'hit',
        shooterId: hit.shooter.id,
        targetId: hit.target.id,
        point: hit.point,
        cause: 'gun',
      });
      if (damaged.destroyed) this.kill(hit.target, hit.shooter, hit.point);
      hit.target.damage = damaged;
    }
    finishTerrain(1);
    for (const e of this.entities) e.gun.rounds = e.gun.rounds.filter((r) => !consumed.has(r));
  }
  snapshot() {
    return {
      outcome: this.outcome,
      departureProtected: this.departureProtected,
      departureSecondsRemaining: this.departureProtected
        ? Math.max(0, this.mission.encounter.departureGraceSeconds - this.departureTicks / 120)
        : 0,
      steps: this.steps,
      hits: this.player.hits,
      kills: this.player.kills,
      damagePercent: damagePercent(this.player.damage),
      destroyed: this.player.damage.destroyed,
      dataSource: this.player.definition.source,
      controller: 'original-pursuit' as const,
      target: this.target
        ? {
            id: this.target.id,
            aircraft: this.target.aircraft,
            position: { ...this.target.state.position },
            rangeM: magnitude(delta(this.target.state.position, this.player.state.position)),
            damagePercent: damagePercent(this.target.damage),
          }
        : null,
      contacts: this.player.contacts.map((c) => ({ ...c })),
      events: this.events.map((e) => ({ ...e, point: { ...e.point } })),
    };
  }
}
