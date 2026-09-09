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
import type { FsRoot, Platform } from '../platform/Platform';
import { FixedStepClock } from '../sim/FixedStepClock';
import {
  createFlightState,
  stepFlight,
  sampleTelemetry,
  PLACEHOLDER_AIRCRAFT,
  type FlightState,
  type FlightTelemetry,
} from '../sim/flight';
import { GroundSampler, type PracticeStrip } from './GroundSampler';
import { preparePractice } from './practice';
import { FlightInput, type PilotControls } from './FlightInput';
import { flightCamera } from './FlightCamera';
import { createAircraftSystems, stepAircraftSystems } from './AircraftSystems';
import { FlightAudio } from './FlightAudio';
import { RetailAircraft } from './RetailAircraft';

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
  modelTriangles: number;
  cameraMode: string;
  cameraUp: { x: number; y: number; z: number };
  engineRunning: boolean;
  afterburner: boolean;
  gearDown: boolean;
  hookDown: boolean;
  systems: ReturnType<typeof createAircraftSystems>;
  audio: ReturnType<FlightAudio['diagnostics']>;
  animation: Record<string, number>;
}
declare global {
  interface Window {
    __flightDiagnostics?: () => FlightDiagnostics;
  }
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
  private readonly audio = new FlightAudio();
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
  private airborneArmed = this.approach || this.airborneStart;
  private readonly environment;
  private readonly snapshot = (): FlightDiagnostics => this.diagnostics();

  static async create(
    scene: Scene,
    manifest: TheaterManifest,
    platform: Platform,
    root: FsRoot,
    folder: string,
  ): Promise<FlightLayer> {
    const ground = new GroundSampler(manifest, platform, root, folder);
    try {
      const strip = await preparePractice(ground);
      const model = await RetailAircraft.load(platform);
      return new FlightLayer(scene, ground, strip, model);
    } catch (error) {
      ground.dispose();
      throw error;
    }
  }
  private constructor(
    private scene: Scene,
    readonly ground: GroundSampler,
    readonly strip: PracticeStrip,
    private readonly model?: RetailAircraft,
  ) {
    this.environment = { sampleGround: (x: number, z: number) => ground.sample(x, z) };
    this.state = this.initialState();
    this.previous = this.state;
    if (this.approach || this.airborneStart) this.input.throttle = 0.2;
    this.systems = createAircraftSystems(this.input.throttle);
    this.telemetry = sampleTelemetry(this.state, this.environment);
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
    for (const [x, z] of [
      [-1.7, 1.2],
      [1.7, 1.2],
      [0, model ? -5 : -3],
    ]) {
      const pivot = new Group();
      pivot.position.set(x!, -0.65, z);
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
    const hookArm = new Mesh(new BoxGeometry(0.12, 0.12, 2.4), dark);
    hookArm.position.z = 1.2;
    this.hook.position.set(0, -0.6, model ? 6 : 3);
    this.hook.add(hookArm);
    this.aircraft.add(this.hook);
    for (const x of model ? [-1.483, 1.424] : [-1.2, 1.2]) {
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
      flame.position.set(x, model ? -0.297 : -0.2, model ? 9.075 : 4);
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
    scene.add(this.aircraft, this.deck);
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
  advance(seconds: number): void {
    if (this.input.resetRequested) {
      this.state = this.initialState();
      this.previous = this.state;
      this.clock.reset();
      this.input.reset();
      this.systems = createAircraftSystems(this.approach || this.airborneStart ? 0.2 : 0);
      this.takeoffs = 0;
      this.landings = 0;
      this.airborneArmed = this.approach || this.airborneStart;
      if (this.approach || this.airborneStart) this.input.throttle = 0.2;
      this.telemetry = sampleTelemetry(this.state, this.environment);
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
    if (this.waiting || this.ground.error) return;
    const result = this.clock.advance(seconds, (dt) => {
      this.previous = this.state;
      this.controls = this.input.sample(dt);
      this.systems = stepAircraftSystems(this.systems, this.input, dt);
      const next = stepFlight(
        this.state,
        {
          ...this.controls,
          throttle: this.systems.effectiveThrottle,
          thrustMultiplier: this.systems.thrustMultiplier,
          gearDown: this.systems.gearFraction >= 0.99,
        },
        this.environment,
        PLACEHOLDER_AIRCRAFT,
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
    const { camera, look, up } = flightCamera(position, attitude, this.input.cameraMode);
    // Keep the chase camera above known ground, even when the aircraft rolls.
    if (this.input.cameraMode === 'world-up')
      camera.y = Math.max(
        camera.y,
        (this.ground.sample(camera.x, camera.z)?.height ?? position.y - 10) + 4,
      );
    return { position, attitude, camera, look, up };
  }
  render(origin: { x: number; z: number }): void {
    const pose = this.pose();
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
    this.model?.setAfterburner(this.input.engineRunning && this.systems.afterburnerFraction > 0.1);
    this.hook.rotation.x = (this.systems.hookFraction * Math.PI) / 4;
    for (const burner of this.burners) {
      burner.visible = this.systems.afterburnerFraction > 0.01 && this.input.engineRunning;
      burner.scale.y = Math.max(0.01, this.systems.afterburnerFraction);
    }
    this.deck.position.set(this.strip.x - origin.x, this.strip.elevation, this.strip.z - origin.z);
  }
  private wingSweep(): number {
    // Original visual schedule, held extended for landing. Not recovered retail animation.
    return (
      (1 - this.systems.gearFraction) *
      Math.max(0, Math.min(1, (this.telemetry.airspeed - 160) / 180)) *
      0.7
    );
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
      aircraftName: this.model?.data.name ?? 'Peregrine original placeholder (F-14 not installed)',
      modelTriangles: this.model?.triangles ?? 0,
      cameraMode: this.input.cameraMode,
      cameraUp: { ...this.pose().up },
      engineRunning: this.input.engineRunning,
      afterburner: this.input.afterburner,
      gearDown: this.input.gearDown,
      hookDown: this.input.hookDown,
      systems: { ...this.systems },
      audio: this.audio.diagnostics(),
      animation: {
        gear: this.systems.gearFraction,
        hook: this.systems.hookFraction,
        afterburner: this.systems.afterburnerFraction,
        wingSweepRad: this.wingSweep(),
        gearRotation: this.gearParts[0]?.rotation.z ?? 0,
        gearVisible: Number(this.gearParts[0]?.visible),
        hookRotation: this.hook.rotation.x,
        burnerVisible: Number(this.burners[0]?.visible),
        wingLeftRotation: this.model?.parts.get('wing-left-color')?.rotation.y ?? 0,
      },
    };
  }
  dispose(): void {
    this.input.dispose();
    this.audio.dispose();
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
