import { connectMixer } from './AudioMixer';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  LineBasicMaterial,
  LineSegments,
  Points,
  PointsMaterial,
  RGBAFormat,
  InstancedMesh,
  MeshBasicMaterial,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import type { Platform } from '../platform/Platform';
import { parseRetailGun, type RetailGun, type GunDefinition } from '../data/retail-gun';
import { createGunState, MAX_GUN_ROUNDS, stepGun, type GunState } from '../sim/flight/gun';
import type { FlightState } from '../sim/flight';
import type { AircraftId } from './aircraft-catalog';
import { flightPcm, resampleFlightPcm } from './FlightAudio';

export class FlightGun {
  private disconnectMixer?: () => void;
  readonly state;
  private geometry = new BufferGeometry();
  private positions = new Float32Array(MAX_GUN_ROUNDS * 6);
  readonly lines: LineSegments;
  private glowGeometry = new BufferGeometry();
  private glowPositions = new Float32Array(MAX_GUN_ROUNDS * 3);
  private glowTexture: DataTexture;
  private glow: Points;
  private diamonds?: InstancedMesh;
  private context?: AudioContext;
  private source?: AudioBufferSourceNode;
  private gain?: GainNode;
  private firing = false;
  private lastFired = 0;
  private disposed = false;
  private paused = false;
  setPaused(value: boolean): void {
    this.paused = value;
    this.firing = false;
    const context = this.context;
    if (!context || context.state === 'closed') return;
    if (this.gain) {
      this.gain.gain.cancelScheduledValues(context.currentTime);
      this.gain.gain.setValueAtTime(0, context.currentTime);
    }
    void (value ? context.suspend() : context.resume()).catch(() => undefined);
  }
  private wake = (): void => {
    if (!this.disposed && !this.paused)
      void this.context?.resume().catch(() => {
        /* A closed audio context can race scene disposal. */
      });
  };
  private constructor(
    readonly data?: GunDefinition,
    state?: GunState,
    audio = true,
  ) {
    this.state = state ?? createGunState(data);
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setDrawRange(0, 0);
    this.lines = new LineSegments(
      this.geometry,
      new LineBasicMaterial({
        color: data?.tracerColor === 'green' ? 0x30ff50 : 0xff3030,
        toneMapped: false,
        transparent: true,
        opacity: 1,
      }),
    );
    this.lines.frustumCulled = false;
    // A small screen-space luminous head stays readable in the dark without changing
    // renderer exposure or requiring bloom. The streak still conveys actual travel.
    const pixels = new Uint8Array(16 * 16 * 4);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const radius = Math.hypot((x - 7.5) / 7.5, (y - 7.5) / 7.5);
        const i = (y * 16 + x) * 4;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
        pixels[i + 3] = Math.round(255 * Math.max(0, 1 - radius) ** 2);
      }
    this.glowTexture = new DataTexture(pixels, 16, 16, RGBAFormat);
    this.glowTexture.needsUpdate = true;
    this.glowGeometry.setAttribute('position', new BufferAttribute(this.glowPositions, 3));
    this.glowGeometry.setDrawRange(0, 0);
    this.glow = new Points(
      this.glowGeometry,
      new PointsMaterial({
        color: data?.tracerColor === 'green' ? 0x60ff80 : 0xff7060,
        size: 7,
        sizeAttenuation: false,
        map: this.glowTexture,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.glow.frustumCulled = false;
    this.lines.add(this.glow);
    if (data?.bulletGeometry) {
      const source = data.bulletGeometry;
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(source.vertices), 3));
      geometry.setAttribute('color', new BufferAttribute(new Float32Array(source.colors), 3));
      geometry.setIndex(source.indices);
      this.diamonds = new InstancedMesh(
        geometry,
        new MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
        MAX_GUN_ROUNDS,
      );
      this.diamonds.count = 0;
      this.diamonds.frustumCulled = false;
      this.lines.add(this.diamonds);
    }
    if (audio && data && 'clip' in data && typeof AudioContext !== 'undefined') {
      const clip = (data as RetailGun).clip;
      this.context = new AudioContext();
      const pcm = resampleFlightPcm(
        flightPcm(clip, true),
        clip.sampleRate,
        Math.max(8000, clip.sampleRate),
      );
      const buffer = this.context.createBuffer(1, pcm.length, Math.max(8000, clip.sampleRate));
      buffer.copyToChannel(new Float32Array(pcm), 0);
      this.source = this.context.createBufferSource();
      this.source.buffer = buffer;
      this.source.loop = true;
      this.gain = this.context.createGain();
      this.gain.gain.value = 0;
      this.source.connect(this.gain);
      this.disconnectMixer = connectMixer(this.context, this.gain, 'weapons');
      this.source.start();
      window.addEventListener('keydown', this.wake);
      window.addEventListener('pointerdown', this.wake);
    }
  }
  static combat(data: GunDefinition, state?: GunState, audio = false): FlightGun {
    return new FlightGun(data, state, audio);
  }
  static async load(platform: Platform, id: AircraftId): Promise<FlightGun> {
    const path = `aircraft/${id}-gun.json`;
    if (!(await platform.fs.exists('appData', path))) return new FlightGun();
    const text = await platform.fs.readText('appData', path);
    if (text.length > 5000000) throw new Error('Gun manifest exceeds 5 MB');
    const data = parseRetailGun(JSON.parse(text));
    if (data.aircraftSource !== { f14: 'F14.PT', a4e: 'A4E.PT', x31: 'F31.PT' }[id])
      throw new Error('Gun aircraft mismatch');
    return new FlightGun(data);
  }
  step(aircraft: FlightState, trigger: boolean, safe: boolean, dt: number): void {
    const before = this.state.fired;
    stepGun(this.state, this.data, aircraft, trigger, safe, dt);
    this.firing ||= before !== this.state.fired;
  }
  audioUpdate(muted = false): void {
    this.firing ||= this.state.fired > this.lastFired;
    this.lastFired = this.state.fired;
    if (this.context && this.gain)
      this.gain.gain.setTargetAtTime(
        this.firing && !muted ? 0.18 : 0,
        this.context.currentTime,
        0.012,
      );
    this.firing = false;
  }
  reset(): void {
    Object.assign(this.state, createGunState(this.data, this.state.mode));
    this.firing = false;
    this.lastFired = 0;
    this.audioUpdate();
  }
  render(origin: { x: number; z: number }): void {
    let n = 0;
    const retail = this.state.mode === 'retail' && !!this.data?.native;
    const diamonds = retail ? this.diamonds : undefined;
    if (this.diamonds) this.diamonds.count = 0;
    const matrix = new Matrix4();
    const rotation = new Quaternion();
    const direction = new Vector3();
    for (const r of this.state.rounds) {
      if (!r.tracer) continue;
      if (diamonds) {
        const facing = r.nativeMotion?.direction ?? r.velocity;
        direction.set(facing.x, facing.y, facing.z).normalize();
        rotation.setFromUnitVectors(new Vector3(0, 0, -1), direction);
        matrix.compose(
          new Vector3(r.position.x - origin.x, r.position.y, r.position.z - origin.z),
          rotation,
          new Vector3(1, 1, 1),
        );
        diamonds.setMatrixAt(n++, matrix);
        continue;
      }
      const length = 0.008;
      this.positions.set(
        [
          r.position.x - origin.x,
          r.position.y,
          r.position.z - origin.z,
          r.position.x - origin.x - r.velocity.x * length,
          r.position.y - r.velocity.y * length,
          r.position.z - origin.z - r.velocity.z * length,
        ],
        n * 6,
      );
      this.glowPositions.set(
        [r.position.x - origin.x, r.position.y, r.position.z - origin.z],
        n * 3,
      );
      n++;
    }
    if (diamonds) {
      diamonds.count = n;
      diamonds.instanceMatrix.needsUpdate = true;
    }
    this.geometry.setDrawRange(0, diamonds ? 0 : n * 2);
    this.geometry.getAttribute('position').needsUpdate = true;
    this.glowGeometry.setDrawRange(0, diamonds ? 0 : n);
    this.glowGeometry.getAttribute('position').needsUpdate = true;
  }
  diagnostics(safe: boolean) {
    const native = this.state.mode === 'retail' ? this.data?.native : undefined;
    return {
      available: !!this.data,
      mode: this.state.mode,
      effectiveMode: this.state.mode === 'retail' && this.data?.native ? 'retail' : 'remake',
      modeNote:
        this.state.mode === 'retail' && !this.data?.native
          ? 'Retail gun data missing; using remake mechanics. Re-import aircraft guns.'
          : 'Native-derived parameters; authored 120Hz integration, collisions and AI.',
      bulletArtwork:
        this.state.mode === 'retail' && this.data?.native && this.diamonds
          ? 'retail-geometry'
          : 'remake-tracers',
      renderedDiamonds: this.diamonds?.count ?? 0,
      name: this.data?.name ?? 'Gun not installed',
      safe,
      remaining: this.state.remaining,
      fired: this.state.fired,
      activeRounds: this.state.rounds.length,
      tracers: this.state.rounds.filter((r) => r.tracer).length,
      muzzleSpeedMps: native ? native.initialSpeedFps * 0.3048 : (this.data?.muzzleSpeedMps ?? 0),
      roundsPerSecond: native ? 1 / native.intervalSeconds : (this.data?.roundsPerSecond ?? 0),
      ammunitionPerProjectile: native?.actualRoundsPerProjectile ?? 1,
      tracerColor: native && this.diamonds ? 'retail-yellow' : (this.data?.tracerColor ?? 'red'),
      audioLoaded: !!this.source,
      contextState: this.context?.state ?? 'unavailable',
    };
  }
  dispose(): void {
    this.disconnectMixer?.();
    this.disposed = true;
    window.removeEventListener('keydown', this.wake);
    window.removeEventListener('pointerdown', this.wake);
    this.source?.stop();
    void this.context?.close();
    this.lines.removeFromParent();
    this.geometry.dispose();
    this.glowGeometry.dispose();
    this.glowTexture.dispose();
    this.diamonds?.geometry.dispose();
    (this.diamonds?.material as MeshBasicMaterial | undefined)?.dispose();
    (this.glow.material as PointsMaterial).dispose();
    (this.lines.material as LineBasicMaterial).dispose();
  }
}
