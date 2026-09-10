import { gunSight, type GunSightTarget } from './gun-sight';
import { configureAircraftHook } from './AircraftHook';
import { AIRCRAFT, aircraftId, validateAircraftProfile, type AircraftId } from './aircraft-catalog';
import {
  BoxGeometry,
  type BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Scene,
} from 'three';
import type { TheaterManifest } from '../data';
import type { AircraftDefinition } from '../data/aircraft';
import { parseRetailFlightProfile, type RetailFlightProfile } from '../data/retail-flight';
import type { FsRoot, Platform } from '../platform/Platform';
import { FixedStepClock } from '../sim/FixedStepClock';
import {
  createFlightState,
  stepFlight,
  sampleTelemetry,
  PLACEHOLDER_AIRCRAFT,
  type FlightEnvironment,
  type FlightState,
  type FlightTelemetry,
} from '../sim/flight';
import type { Environment } from '../sim/environment';
import {
  stepFlight as stepAssistedFlight,
  sampleTelemetry as sampleAssistedTelemetry,
} from '../sim/flight/assisted-flight';
import { GroundSampler, type PracticeStrip } from './GroundSampler';
import { preparePractice } from './practice';
import { FlightInput, type PilotControls } from './FlightInput';
import {
  autopilotCommand,
  captureHold,
  type AutopilotHold,
  type AutopilotMode,
} from '../sim/flight/autopilot';
import { bearingDegrees } from '../sim/flight';
import { flightCamera } from './FlightCamera';
import { createAircraftSystems, stepAircraftSystems } from './AircraftSystems';
import { FlightAudio } from './FlightAudio';
import { FlightGun } from './FlightGun';
import { createFuelState, setFuelFraction, stepFuel, type FuelState } from './FuelSystem';
import { RetailAircraft } from './RetailAircraft';
import { surfaceAngle } from './ControlSurfaces';
import { waypointDestination, type TeleportWaypoint } from '../terrain/teleport';
import { applyCloudShadow } from '../terrain/cloud-shadow';

export interface FlightDiagnostics {
  state: FlightState;
  telemetry: FlightTelemetry;
  controls: PilotControls;
  simSteps: number;
  status: string;
  reason: string;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  attitude: { x: number; y: number; z: number; w: number };
  airspeed: number;
  altitudeAGL: number | null;
  wind: { x: number; y: number; z: number };
  windBearingDeg: number;
  windSpeed: number;
  groundSpeed: number;
  throttle: number;
  alphaRad: number;
  loadFactor: number;
  stalled: boolean;
  steps: number;
  simTime: number;
  clampedFrames: number;
  groundCacheBytes: number;
  pendingGroundChunks: number;
  gamepadConnected: boolean;
  takeoffs: number;
  landings: number;
  runway: PracticeStrip;
  aircraftName: string;
  aircraftId: AircraftId;
  modelTriangles: number;
  flightModel: string;
  flightModelId: 'assisted' | 'retail-envelope' | 'recovered-envelope';
  nativeEnvelopeAvailable: boolean;
  retailProfileAvailable: boolean;
  massKg: number;
  fuelMassKg: number;
  fuelCapacityKg: number;
  fuelFraction: number;
  fuelBurnKgS: number;
  payloadMassKg: number;
  militaryThrustN: number;
  afterburnerThrustN: number;
  flightProfileSha256: string | null;
  cameraMode: string;
  viewYawRad: number;
  viewPitchRad: number;
  gun: ReturnType<FlightGun['diagnostics']>;
  gunSight?: ReturnType<typeof gunSight>;
  autopilot: AutopilotMode;
  /** Bearing the waypoint hold is steering to, or null when it is holding heading. */
  autopilotBearingDeg: number | null;
  waypointIndex: number;
  cameraUp: { x: number; y: number; z: number };
  engineRunning: boolean;
  afterburner: boolean;
  gearDown: boolean;
  hookDown: boolean;
  flapsDown: boolean;
  airbrakeDown: boolean;
  systems: ReturnType<typeof createAircraftSystems>;
  audio: ReturnType<FlightAudio['diagnostics']>;
  animation: Record<string, number>;
}
declare global {
  interface Window {
    __flightDiagnostics?: () => FlightDiagnostics;
  }
}

/** Wind is reported the way it is named: the bearing it blows *from*. */
function windReadout(wind: { x: number; y: number; z: number } | undefined) {
  const v = wind ?? { x: 0, y: 0, z: 0 };
  const speed = Math.hypot(v.x, v.z);
  // Air moving toward (-sin t, cos t) comes from the reciprocal bearing.
  const toward = (Math.atan2(-v.x, v.z) * 180) / Math.PI;
  return {
    wind: { ...v },
    windSpeed: speed,
    windBearingDeg: speed < 1e-6 ? 0 : (toward + 540) % 360,
  };
}

/** A thin rendering/input adapter; all forces and state evolution live in the pure sim. */
export class FlightLayer {
  private controls: PilotControls = { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: false };
  private readonly approach =
    new URLSearchParams(window.location.search).get('flightStart') === 'approach';
  private readonly airborneStart =
    new URLSearchParams(window.location.search).get('flightStart') === 'airborne';
  private readonly clock = new FixedStepClock();
  private readonly input = new FlightInput();
  private readonly aircraft = new Group();
  private readonly deck = new Group();

  private systems = createAircraftSystems();
  private readonly gearParts: Group[] = [];
  private readonly hook = new Group();
  private readonly burners: Mesh[] = [];
  private state: FlightState;
  private previous: FlightState;
  private telemetry: FlightTelemetry;
  private alpha = 0;
  private clampedFrames = 0;
  private takeoffs = 0;
  private landings = 0;
  private waiting = false;
  private disposed = false;
  private teleportRequest = 0;
  private autopilotHold: AutopilotHold | undefined;
  private autopilotEngaged: AutopilotMode = 'off';
  private navigationTarget: { id: number; x: number; z: number } | undefined;
  private airborneArmed = this.approach || this.airborneStart;
  private readonly environment: FlightEnvironment;
  /** The theater clock and wind field; the terrain viewer owns and advances it. */
  environmentModel: Environment | undefined;
  private readonly snapshot = (): FlightDiagnostics => this.diagnostics();

  static async create(
    scene: Scene,
    manifest: TheaterManifest,
    platform: Platform,
    root: FsRoot,
    folder: string,
  ): Promise<FlightLayer> {
    const ground = new GroundSampler(manifest, platform, root, folder);
    let model: RetailAircraft | undefined;
    let audio: FlightAudio | undefined;
    let gun: FlightGun | undefined;
    try {
      const strip = await preparePractice(ground);
      const id = aircraftId(new URLSearchParams(window.location.search).get('aircraft'));
      model = await RetailAircraft.load(platform, id);
      audio = await FlightAudio.create(platform, id);
      gun = await FlightGun.load(platform, id);
      let profile: RetailFlightProfile | undefined;
      if (await platform.fs.exists('appData', `aircraft/${id}-flight.json`)) {
        const text = await platform.fs.readText('appData', `aircraft/${id}-flight.json`);
        if (text.length > 1000000) throw new Error('Flight profile exceeds 1 MB');
        profile = parseRetailFlightProfile(JSON.parse(text));
        validateAircraftProfile(id, profile);
      }
      return new FlightLayer(scene, ground, strip, audio, gun, id, model, profile);
    } catch (error) {
      model?.dispose();
      audio?.dispose();
      gun?.dispose();
      ground.dispose();
      throw error;
    }
  }
  private readonly useRetail: boolean;
  private readonly useNativeEnvelope: boolean;
  private readonly definition: AircraftDefinition;
  private fuel: FuelState;
  private resetFuelFraction: number;
  private readonly payloadMassKg: number;
  private constructor(
    private scene: Scene,
    readonly ground: GroundSampler,
    readonly strip: PracticeStrip,
    private readonly audio: FlightAudio,
    private readonly gun: FlightGun,
    readonly aircraftId: AircraftId,
    private readonly model?: RetailAircraft,
    private readonly profile?: RetailFlightProfile,
  ) {
    const query = new URLSearchParams(window.location.search);
    this.useNativeEnvelope = query.get('flightModel') === 'recovered-envelope' && !!profile?.native;
    this.useRetail = query.get('flightModel') !== 'assisted' && !!profile;
    const finite = (key: string, fallback: number) => {
      const value = Number(query.get(key) ?? fallback);
      return Number.isFinite(value) ? value : fallback;
    };
    this.resetFuelFraction = Math.max(0, Math.min(1, finite('flightFuel', 1)));
    this.fuel = createFuelState(profile?.fuelCapacityKg ?? 1500, this.resetFuelFraction);
    this.payloadMassKg =
      this.useRetail && profile
        ? Math.max(
            0,
            Math.min(
              profile.maxTakeoffMassKg - profile.emptyMassKg - this.fuel.fuelKg,
              finite('flightPayload', 0),
            ),
          )
        : 0;
    this.definition =
      this.useRetail && profile
        ? {
            ...PLACEHOLDER_AIRCRAFT,
            id: `${this.aircraftId}-retail-envelope`,
            name: profile.name,
            massKg: profile.emptyMassKg + this.fuel.fuelKg + this.payloadMassKg,
            // Reference area only: the envelope fit normalizes lift/drag to PT forces.
            wingAreaM2: 52.5,
            retail: profile,
            nativeEnvelope: this.useNativeEnvelope,
          }
        : PLACEHOLDER_AIRCRAFT;
    this.environment = { sampleGround: (x: number, z: number) => ground.sample(x, z) };
    this.state = this.initialState();
    this.previous = this.state;
    if (this.approach || this.airborneStart) this.input.throttle = 0.2;
    this.systems = createAircraftSystems(this.input.throttle);
    this.telemetry = (this.useRetail ? sampleTelemetry : sampleAssistedTelemetry)(
      this.state,
      this.environment,
      this.definition,
    );
    const fuselage = new MeshStandardMaterial({ color: 0xe4e8ed, roughness: 0.6 });
    const blue = new MeshStandardMaterial({ color: 0x244d77, roughness: 0.7 });
    const dark = new MeshStandardMaterial({ color: 0x20272c, roughness: 1 });
    if (!model) {
      const body = new Mesh(new CylinderGeometry(0.8, 0.6, 9, 12), fuselage);
      body.rotation.x = Math.PI / 2;
      this.aircraft.add(body);
      const nose = new Mesh(new ConeGeometry(0.8, 2, 12), blue);
      nose.rotation.x = -Math.PI / 2;
      nose.position.z = -5.5;
      this.aircraft.add(nose);
      const wing = new Mesh(new BoxGeometry(12, 0.2, 2.4), blue);
      wing.position.z = 0.3;
      this.aircraft.add(wing);
      const tail = new Mesh(new BoxGeometry(4.3, 0.18, 1.3), blue);
      tail.position.z = 3.5;
      this.aircraft.add(tail);
      const fin = new Mesh(new BoxGeometry(0.16, 2, 1.8), blue);
      fin.position.set(0, 1, 3.3);
      this.aircraft.add(fin);
    } else this.aircraft.add(model.group);
    const presentationScale = model ? AIRCRAFT[this.aircraftId].length / 19.1 : 1;
    for (const [x, z] of [
      [-1.7, 1.2],
      [1.7, 1.2],
      [0, model ? -5 : -3],
    ]) {
      const pivot = new Group();
      pivot.position.set(x! * presentationScale, -0.65, z! * presentationScale);
      const strut = new Mesh(new BoxGeometry(0.15, 1.25, 0.15), fuselage);
      strut.position.y = -0.6;
      const wheel = new Mesh(new CylinderGeometry(0.3, 0.3, 0.3, 12), dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.y = -1.25;
      pivot.add(strut, wheel);
      this.gearParts.push(pivot);
      this.aircraft.add(pivot);
    }
    // Original moving hook and burner effects supplement imported geometry when needed.
    configureAircraftHook(this.hook, this.aircraftId, !!model, dark);
    this.aircraft.add(this.hook);
    for (const x of !AIRCRAFT[this.aircraftId].afterburner
      ? []
      : this.aircraftId === 'x31'
        ? [0]
        : model
          ? [-1.483, 1.424]
          : [-1.2, 1.2]) {
      const flame = new Mesh(
        new ConeGeometry(0.55, 4, 12).translate(0, 2, 0),
        new MeshStandardMaterial({
          color: 0xffaa44,
          emissive: 0xff6600,
          emissiveIntensity: 2,
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
        }),
      );
      flame.rotation.x = Math.PI / 2;
      flame.position.set(x, model ? -0.297 : -0.2, model ? 9.075 * presentationScale : 4);
      this.burners.push(flame);
      this.aircraft.add(flame);
    }
    const runway = new Mesh(new BoxGeometry(strip.width, 0.1, strip.length), dark);
    runway.position.y = -0.05;
    this.deck.add(runway);
    for (let z = -strip.length / 2 + 80; z < strip.length / 2 - 80; z += 90) {
      const stripe = new Mesh(new BoxGeometry(2, 0.015, 35), fuselage);
      stripe.position.set(0, 0.012, z);
      this.deck.add(stripe);
    }
    // Only the aircraft casts: the depth pass stays a few hundred triangles.
    this.aircraft.traverse((object) => {
      object.castShadow = true;
    });
    this.deck.traverse((object) => {
      object.receiveShadow = true;
    });
    // Cloud shadows are the same material patch the terrain uses, so the aircraft
    // and the deck darken with the ground under the same cloud.
    const shadowed = new Set<MeshStandardMaterial>();
    for (const group of [this.aircraft, this.deck])
      group.traverse((object) => {
        if (object instanceof Mesh && object.material instanceof MeshStandardMaterial)
          shadowed.add(object.material);
      });
    for (const material of shadowed) applyCloudShadow(material, 'aircraft-cloud-shadow-v1');
    scene.add(this.aircraft, this.deck, this.gun.lines);
  }
  /** Publish only after the viewer accepts this asynchronous result. */
  activate(): void {
    window.__flightDiagnostics = this.snapshot;
  }
  private initialState(): FlightState {
    if (this.airborneStart)
      return createFlightState({
        position: { x: this.strip.x, y: 3000, z: this.strip.z },
        airspeed: 150,
      });
    if (this.approach)
      return createFlightState({
        position: { x: this.strip.x, y: 240, z: this.strip.z + 2800 },
        airspeed: 100,
        pitchRad: -0.035,
        yawRad: 0,
      });
    return createFlightState({
      position: {
        x: this.strip.x,
        y: this.strip.elevation + PLACEHOLDER_AIRCRAFT.gearHeightM,
        z: this.strip.z + this.strip.length / 2 - 150,
      },
      airspeed: 0,
      yawRad: 0,
    });
  }
  setFuelFraction(fraction: number): void {
    this.fuel = setFuelFraction(this.fuel, fraction);
    this.resetFuelFraction = this.fuel.fuelKg / this.fuel.capacityKg;
    this.updateFuelMass();
  }
  /**
   * The selected waypoint, in theater metres, for the waypoint autopilot. The map
   * overlay owns the waypoint list, so it pushes the selection down here rather than
   * the flight layer reaching up into React state.
   */
  setNavigationTarget(point: { id: number; x: number; z: number } | undefined): void {
    this.navigationTarget =
      point && [point.x, point.z].every(Number.isFinite) ? { ...point } : undefined;
  }
  /** Bearing to the selected waypoint, or undefined when there is nothing to steer to. */
  private navigationBearing(): number | undefined {
    const point = this.navigationTarget;
    if (!point) return undefined;
    const dx = point.x - this.state.position.x;
    const dz = point.z - this.state.position.z;
    // On top of the waypoint the bearing swings wildly; hold heading instead.
    return Math.hypot(dx, dz) < 500 ? undefined : bearingDegrees(dx, dz);
  }
  private autopilotControls(controls: PilotControls): PilotControls {
    const mode = this.input.autopilot;
    if (mode === 'off' || this.state.status !== 'airborne') {
      if (this.state.status !== 'airborne') this.input.autopilot = 'off';
      this.autopilotEngaged = this.input.autopilot;
      this.autopilotHold = undefined;
      return controls;
    }
    // Engaging captures the current heading and altitude; switching between the two
    // modes keeps that capture, so Ctrl-A from a level hold does not step the altitude.
    if (this.autopilotEngaged === 'off' || !this.autopilotHold)
      this.autopilotHold = captureHold(this.state);
    this.autopilotEngaged = mode;
    return {
      ...controls,
      ...autopilotCommand(
        mode,
        this.autopilotHold,
        this.state,
        this.telemetry,
        this.definition,
        this.navigationBearing(),
      ),
    };
  }
  async teleportToWaypoint(point: TeleportWaypoint): Promise<void> {
    const request = ++this.teleportRequest;
    if (this.disposed) throw new Error('Flight has been closed');
    const destination = waypointDestination(this.ground.manifest, point);
    // A failed optional jump must not poison contact at the current flight position.
    await this.ground.ensure(point.x, point.z, false);
    if (this.disposed || request !== this.teleportRequest)
      throw new Error('Waypoint teleport was superseded');
    const surface = this.ground.sample(point.x, point.z);
    if (!surface) throw new Error('Waypoint ground contact data is unavailable');
    destination.position.y = Math.max(destination.position.y, surface.height + 1000);
    this.state = createFlightState({
      position: destination.position,
      yawRad: destination.yaw,
      airspeed: Math.max(150, Math.min(250, this.telemetry.airspeed)),
    });
    this.previous = this.state;
    this.clock.reset();
    this.gun.reset();
    this.gunTarget = undefined;
    this.input.gunSafe = true;
    this.alpha = 0;
    this.waiting = false;
    this.airborneArmed = true;
    this.input.waypointIndex = point.id - 1;
    this.telemetry = (this.useRetail ? sampleTelemetry : sampleAssistedTelemetry)(
      this.state,
      this.environment,
      this.definition,
    );
    this.ground.prefetch(point.x, point.z, this.state.velocity.x, this.state.velocity.z);
  }
  private updateFuelMass(): void {
    if (this.useRetail && this.profile) {
      // Fuel refilling respects maximum takeoff weight with the selected payload.
      this.fuel.fuelKg = Math.min(
        this.fuel.fuelKg,
        this.profile.maxTakeoffMassKg - this.profile.emptyMassKg - this.payloadMassKg,
      );
      this.definition.massKg = this.profile.emptyMassKg + this.fuel.fuelKg + this.payloadMassKg;
    }
  }
  advance(seconds: number): void {
    if (this.input.resetRequested) {
      this.teleportRequest++;
      this.fuel = createFuelState(this.fuel.capacityKg, this.resetFuelFraction);
      this.updateFuelMass();
      this.state = this.initialState();
      this.previous = this.state;
      this.clock.reset();
      this.input.reset();
      this.gun.reset();
      this.gunTarget = undefined;
      this.systems = createAircraftSystems(this.approach || this.airborneStart ? 0.2 : 0);
      this.takeoffs = 0;
      this.landings = 0;
      this.airborneArmed = this.approach || this.airborneStart;
      if (this.approach || this.airborneStart) this.input.throttle = 0.2;
      this.telemetry = (this.useRetail ? sampleTelemetry : sampleAssistedTelemetry)(
        this.state,
        this.environment,
        this.definition,
      );
      this.waiting = false;
      this.alpha = 0;
      this.clampedFrames = 0;
      this.controls = { pitch: 0, roll: 0, yaw: 0, throttle: this.input.throttle, brake: false };
    }
    const p = this.state.position,
      v = this.state.velocity;
    this.ground.prefetch(p.x, p.z, v.x, v.z);
    this.waiting =
      !this.ground.sample(p.x, p.z) || !this.ground.sample(p.x + v.x * 0.25, p.z + v.z * 0.25);
    if (this.waiting || this.ground.error) {
      this.gun.audioUpdate(this.audio.diagnostics().muted);
      return;
    }
    const result = this.clock.advance(seconds, (dt) => {
      this.previous = this.state;
      // The flight clock, not the render clock, drives the field so headless
      // harness runs and the app evaluate exactly the same wind.
      const wind = this.environmentModel?.windAt(this.state.position, this.state.timeSeconds);
      // exactOptionalPropertyTypes: an absent field, not an undefined one, is
      // what the zero-wind identity in the harness compares against.
      if (wind) this.environment.wind = wind;
      else delete this.environment.wind;
      if (this.fuel.fuelKg === 0) this.input.engineRunning = false;
      this.controls = this.autopilotControls(this.input.sample(dt));
      if (!AIRCRAFT[this.aircraftId].afterburner) this.input.afterburner = false;
      if (!AIRCRAFT[this.aircraftId].hook) this.input.hookDown = false;
      this.systems = stepAircraftSystems(this.systems, this.input, dt);
      if (this.useRetail && this.profile)
        this.systems.thrustMultiplier =
          1 +
          ((this.systems.thrustMultiplier - 1) / 0.5) *
            (this.profile.afterburnerThrustN / this.profile.militaryThrustN - 1);
      const rawRate = (name: string, fallback: number) => {
        const raw = this.profile?.rawFields[name] as { value?: unknown } | undefined;
        return typeof raw?.value === 'number' &&
          Number.isInteger(raw.value) &&
          raw.value >= 0 &&
          raw.value <= 32767
          ? raw.value
          : fallback;
      };
      this.fuel = stepFuel(
        this.fuel,
        {
          engineRunning: this.input.engineRunning,
          throttle: this.systems.effectiveThrottle,
          afterburner: this.input.afterburner,
          militaryRateKgS: 0.90718474,
          afterburnerRateKgS: 4.5359237,
          ...(this.profile
            ? {
                nativeConsumption: {
                  military: rawRate('fuelConsumption', 2),
                  afterburner: rawRate('aftFuelConsumption', 10),
                  kilogramsPerUnitSecond: 0.45359237,
                },
              }
            : {}),
        },
        dt,
      );
      this.updateFuelMass();
      if (this.fuel.fuelKg === 0) {
        this.input.engineRunning = false;
        this.systems.effectiveThrottle = 0;
        this.systems.thrustMultiplier = 1;
      }
      this.gun.step(this.state, this.input.gunTrigger, this.input.gunSafe, dt);
      const next = (this.useRetail ? stepFlight : stepAssistedFlight)(
        this.state,
        {
          ...this.controls,
          throttle: this.systems.effectiveThrottle,
          thrustMultiplier: this.systems.thrustMultiplier,
          gearDown: this.systems.gearFraction >= 0.99,
          gearFraction: this.systems.gearFraction,
          flaps: this.systems.flapFraction,
          airbrake: this.systems.airbrakeFraction,
        },
        this.environment,
        this.definition,
        dt,
      );
      if (
        !this.airborneArmed &&
        next.state.status === 'airborne' &&
        (next.telemetry.groundClearance ?? 0) > 2
      ) {
        this.takeoffs++;
        this.airborneArmed = true;
      }
      if (this.airborneArmed && next.state.status === 'grounded') {
        this.landings++;
        this.airborneArmed = false;
      }
      this.state = next.state;
      this.telemetry = next.telemetry;
    });
    this.gun.audioUpdate(this.audio.diagnostics().muted);
    this.alpha = result.alpha;
    if (result.clamped) this.clampedFrames++;
    this.audio.update(
      {
        engineRunning: this.input.engineRunning,
        spool: this.systems.engineSpool,
        throttle: this.input.throttle,
        afterburner: this.systems.afterburnerFraction > 0.1 && this.input.engineRunning,
        airspeed: this.telemetry.airspeed,
        gear: this.systems.gearFraction,
        hook: this.systems.hookFraction,
        status: this.state.status,
      },
      seconds,
    );
  }
  pose(): { position: Vector3; attitude: Quaternion; camera: Vector3; look: Vector3; up: Vector3 } {
    const a = this.previous.position,
      b = this.state.position;
    const position = new Vector3(a.x, a.y, a.z).lerp(new Vector3(b.x, b.y, b.z), this.alpha);
    const qa = this.previous.attitude,
      qb = this.state.attitude;
    const attitude = new Quaternion(qa.x, qa.y, qa.z, qa.w).slerp(
      new Quaternion(qb.x, qb.y, qb.z, qb.w),
      this.alpha,
    );
    const { camera, look, up } = flightCamera(position, attitude, this.input.cameraMode, {
      yaw: this.input.cameraYaw,
      pitch: this.input.cameraPitch,
    });
    // Keep the chase camera above known ground, even when the aircraft rolls.
    if (this.input.cameraMode === 'world-up')
      camera.y = Math.max(
        camera.y,
        (this.ground.sample(camera.x, camera.z)?.height ?? position.y - 10) + 4,
      );
    return { position, attitude, camera, look, up };
  }
  /** Rear mirrors see the airframe; restore primary cockpit visibility even on render errors. */
  withAircraftVisible(render: () => void): void {
    const visible = this.aircraft.visible;
    this.aircraft.visible = true;
    try {
      render();
    } finally {
      this.aircraft.visible = visible;
    }
  }
  render(origin: { x: number; z: number }): void {
    const pose = this.pose();
    this.aircraft.visible = this.input.cameraMode !== 'cockpit';
    this.gun.render(origin);
    this.aircraft.position.set(
      pose.position.x - origin.x,
      pose.position.y,
      pose.position.z - origin.z,
    );
    this.aircraft.quaternion.copy(pose.attitude);
    for (const gear of this.gearParts) {
      gear.rotation.z =
        ((Math.sign(gear.position.x) || 1) * ((1 - this.systems.gearFraction) * Math.PI)) / 2;
      gear.visible = this.systems.gearFraction > 0.01;
    }
    for (const [name, part] of this.model?.parts ?? []) {
      if (name.startsWith('wing-left')) part.rotation.y = this.wingSweep();
      if (name.startsWith('wing-right')) part.rotation.y = -this.wingSweep();
    }
    for (const part of this.model?.data.parts ?? []) {
      if (part.rotationAxis)
        this.model?.setSurfaceAngle(
          part.name,
          surfaceAngle(part.name, {
            ...this.controls,
            flap: this.systems.flapFraction,
            airbrake: this.systems.airbrakeFraction,
          }),
        );
    }
    this.model?.setAfterburner(this.input.engineRunning && this.systems.afterburnerFraction > 0.1);
    this.hook.rotation.x =
      Number(this.hook.userData.stowedAngle) +
      this.systems.hookFraction *
        (Number(this.hook.userData.deployAngle) - Number(this.hook.userData.stowedAngle));
    for (const burner of this.burners) {
      burner.visible = this.systems.afterburnerFraction > 0.01 && this.input.engineRunning;
      burner.scale.y = Math.max(0.01, this.systems.afterburnerFraction);
    }
    this.deck.position.set(this.strip.x - origin.x, this.strip.elevation, this.strip.z - origin.z);
  }
  private wingSweep(): number {
    if (this.aircraftId !== 'f14') return 0;
    // Original visual schedule, held extended for landing. Not recovered retail animation.
    return (
      (1 - Math.max(this.systems.gearFraction, this.systems.flapFraction)) *
      Math.max(0, Math.min(1, (this.telemetry.airspeed - 160) / 180)) *
      0.7
    );
  }
  private gunTarget: GunSightTarget | undefined;
  /** World coordinates in metres / m/s. Call each sensor update; clear on lock loss. */
  setGunTarget(target: GunSightTarget | undefined): void {
    this.gunTarget = target && {
      position: { ...target.position },
      velocity: { ...target.velocity },
    };
  }
  diagnostics(): FlightDiagnostics {
    return {
      state: {
        ...this.state,
        position: { ...this.state.position },
        velocity: { ...this.state.velocity },
        attitude: { ...this.state.attitude },
        angularVelocity: { ...this.state.angularVelocity },
      },
      telemetry: { ...this.telemetry },
      controls: { ...this.controls },
      simSteps: this.clock.steps,
      status: this.ground.error ? 'error' : this.waiting ? 'waiting-terrain' : this.state.status,
      reason:
        this.ground.error || (this.waiting ? 'Loading ground contact data' : this.telemetry.reason),
      position: { ...this.state.position },
      velocity: { ...this.state.velocity },
      attitude: { ...this.state.attitude },
      airspeed: this.telemetry.airspeed,
      altitudeAGL: this.telemetry.groundClearance ?? null,
      ...windReadout(this.environment.wind),
      groundSpeed: Math.hypot(this.state.velocity.x, this.state.velocity.y, this.state.velocity.z),
      throttle: this.input.throttle,
      alphaRad: this.telemetry.alphaRad,
      loadFactor: this.telemetry.loadFactor,
      stalled: this.telemetry.stalled,
      steps: this.clock.steps,
      simTime: this.state.timeSeconds,
      clampedFrames: this.clampedFrames,
      groundCacheBytes: this.ground.bytes,
      pendingGroundChunks: this.ground.loading,
      gamepadConnected: this.input.gamepadConnected,
      takeoffs: this.takeoffs,
      landings: this.landings,
      runway: { ...this.strip },
      aircraftId: this.aircraftId,
      aircraftName:
        this.model?.data.name ??
        `Peregrine placeholder (${AIRCRAFT[this.aircraftId].name} not installed)`,
      flightModelId: this.useNativeEnvelope
        ? 'recovered-envelope'
        : this.useRetail
          ? 'retail-envelope'
          : 'assisted',
      nativeEnvelopeAvailable: !!this.profile?.native,
      retailProfileAvailable: !!this.profile,
      flightModel: this.useNativeEnvelope
        ? 'Recovered USNF envelope · hybrid forces'
        : this.useRetail
          ? `${this.profile!.source.game === 'atf-gold' ? 'ATF-GOLD' : 'USNF ’97'} PT envelope fit`
          : 'Preserved assisted model',
      massKg: this.definition.massKg,
      fuelMassKg: this.fuel.fuelKg,
      fuelCapacityKg: this.fuel.capacityKg,
      fuelFraction: this.fuel.fuelKg / this.fuel.capacityKg,
      fuelBurnKgS: this.fuel.burnRateKgS,
      payloadMassKg: this.payloadMassKg,
      militaryThrustN: this.useRetail ? this.profile!.militaryThrustN : 70000,
      afterburnerThrustN: this.useRetail
        ? this.profile!.afterburnerThrustN
        : AIRCRAFT[this.aircraftId].afterburner
          ? 105000
          : 70000,
      flightProfileSha256: this.useRetail ? this.profile!.source.sha256 : null,
      modelTriangles: this.model?.triangles ?? 0,
      cameraMode: this.input.cameraMode,
      viewYawRad: this.input.cameraYaw,
      viewPitchRad: this.input.cameraPitch,
      gun: this.gun.diagnostics(this.input.gunSafe),
      gunSight: gunSight(
        this.state,
        this.gun.data,
        (x, z) => {
          const surface = this.ground.sample(x, z);
          if (!surface && this.ground.sourceAt(x, z))
            void this.ground.ensure(x, z, false).catch(() => undefined);
          return surface;
        },
        this.gunTarget,
      ),
      autopilot: this.input.autopilot,
      autopilotBearingDeg:
        this.input.autopilot === 'waypoint' ? (this.navigationBearing() ?? null) : null,
      waypointIndex: this.input.waypointIndex,
      cameraUp: { ...this.pose().up },
      engineRunning: this.input.engineRunning,
      afterburner: this.input.afterburner,
      gearDown: this.input.gearDown,
      hookDown: this.input.hookDown,
      flapsDown: this.input.flapsDown,
      airbrakeDown: this.input.airbrakeDown,
      systems: { ...this.systems },
      audio: this.audio.diagnostics(),
      animation: {
        gear: this.systems.gearFraction,
        hook: this.systems.hookFraction,
        afterburner: this.systems.afterburnerFraction,
        wingSweepRad: this.wingSweep(),
        ...(this.model?.surfaceDiagnostics() ?? {}),
        gearRotation: this.gearParts[0]?.rotation.z ?? 0,
        gearVisible: Number(this.gearParts[0]?.visible),
        hookRotation: this.hook.rotation.x,
        hookPivotY: this.hook.position.y,
        hookPivotZ: this.hook.position.z,
        hookArmLength: Number(this.hook.userData.armLength),
        burnerVisible: Number(this.burners[0]?.visible),
        wingLeftRotation: this.model?.parts.get('wing-left-color')?.rotation.y ?? 0,
      },
    };
  }
  dispose(): void {
    this.disposed = true;
    this.teleportRequest++;
    this.input.dispose();
    this.audio.dispose();
    this.gun.dispose();
    this.model?.dispose();
    this.ground.dispose();
    const materials = new Set<MeshStandardMaterial>();
    for (const group of [this.aircraft, this.deck]) {
      this.scene.remove(group);
      group.traverse((object) => {
        if (object instanceof Mesh) {
          const mesh = object as Mesh<BufferGeometry, MeshStandardMaterial>;
          mesh.geometry.dispose();
          materials.add(mesh.material);
        }
      });
    }
    for (const material of materials) material.dispose();
    if (window.__flightDiagnostics === this.snapshot) delete window.__flightDiagnostics;
  }
}
