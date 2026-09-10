import { Vector3, type PerspectiveCamera } from 'three';
import type { FlightDiagnostics } from './FlightLayer';
import type { GunSightSolution } from './gun-sight';
import { cockpitHudRect } from './cockpit-layout';
import { cockpitLook } from './RetailCockpit';

export const GUN_RETICLE_RADIUS = 22;
/** Closing range: hidden at >=1000 m; fills W → S → E as range falls to zero. */
export function gunRangeArc(rangeM: number, radius = GUN_RETICLE_RADIUS): string {
  if (!Number.isFinite(rangeM) || rangeM >= 1000 || rangeM < 0) return '';
  const angle = (rangeM / 1000) * Math.PI;
  return `M${-radius} 0 A${radius} ${radius} 0 0 0 ${radius * Math.cos(angle)} ${radius * Math.sin(angle)}`;
}
export function gunReticleEnabled(flight: FlightDiagnostics): boolean {
  return (
    flight.cameraMode === 'cockpit' &&
    !!flight.gun?.available &&
    !flight.gun.safe &&
    flight.gun.remaining > 0 &&
    flight.status !== 'crashed'
  );
}
/** Camera must already have this frame's pose/matrices; input point is absolute world SI. */
export function projectGunSight(
  sight: GunSightSolution,
  camera: PerspectiveCamera,
  origin: { x: number; z: number },
  width: number,
  height: number,
): { x: number; y: number; visible: boolean } | undefined {
  if (!sight.point) return;
  const point = new Vector3(sight.point.x - origin.x, sight.point.y, sight.point.z - origin.z);
  const view = point.clone().applyMatrix4(camera.matrixWorldInverse);
  point.project(camera);
  return {
    x: ((point.x + 1) * width) / 2,
    y: ((1 - point.y) * height) / 2,
    visible:
      view.z < -camera.near &&
      point.z >= -1 &&
      point.z <= 1 &&
      Math.abs(point.x) <= 1 &&
      Math.abs(point.y) <= 1,
  };
}
/** Renderer-owned so camera look, resize and origin changes update on the same frame,
 * independently of React's 30 Hz instrument snapshots and the artwork's SVG scale. */
export class GunSightOverlay {
  private svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private cue = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  private arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  constructor(parent: HTMLElement) {
    this.svg.dataset.gunSightOverlay = 'true';
    this.svg.setAttribute(
      'aria-label',
      'Gun reticle; lower range arc: left 1000 metres, bottom 500, right zero',
    );
    Object.assign(this.svg.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      color: '#66ff66',
      display: 'none',
    });
    this.svg.setAttribute('fill', 'none');
    this.svg.setAttribute('stroke', 'currentColor');
    this.svg.setAttribute('stroke-width', '1.5');
    this.cue.dataset.gunReticle = 'true';
    const ring = document.createElementNS(this.svg.namespaceURI, 'circle');
    ring.setAttribute('r', String(GUN_RETICLE_RADIUS));
    const dot = document.createElementNS(this.svg.namespaceURI, 'circle');
    dot.setAttribute('r', '1.5');
    dot.setAttribute('fill', 'currentColor');
    const ticks = document.createElementNS(this.svg.namespaceURI, 'path');
    ticks.setAttribute('d', 'M-28 0h6 M22 0h6 M0 22v6 M0-28v6');
    this.arc.dataset.gunRangeArc = 'true';
    this.arc.setAttribute('stroke-width', '5');
    this.cue.append(ring, dot, ticks, this.arc);
    this.svg.append(this.cue);
    parent.append(this.svg);
  }
  update(
    flight: FlightDiagnostics | undefined,
    camera: PerspectiveCamera,
    origin: { x: number; z: number },
    width: number,
    height: number,
  ): void {
    this.svg.style.display = 'none';
    if (!flight || !gunReticleEnabled(flight) || !flight.gunSight) return;
    const point = projectGunSight(flight.gunSight, camera, origin, width, height);
    if (!point?.visible) return;
    const rect = cockpitHudRect(flight.aircraftId, flight.viewYawRad, flight.viewPitchRad);
    const look = cockpitLook(flight.viewYawRad, flight.viewPitchRad);
    // Hide outside the combiner instead of pinning a false aimpoint to its edge.
    if (
      look.opacity === 0 ||
      point.x < rect.x * width ||
      point.x > (rect.x + rect.width) * width ||
      point.y < rect.y * height ||
      point.y > (rect.y + rect.height) * height
    )
      return;
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.svg.style.clipPath = `inset(${Math.max(0, rect.y * height)}px ${Math.max(0, (1 - rect.x - rect.width) * width)}px ${Math.max(0, (1 - rect.y - rect.height) * height)}px ${Math.max(0, rect.x * width)}px)`;
    this.svg.style.opacity = String(look.opacity);
    this.cue.setAttribute('transform', `translate(${point.x} ${point.y})`);
    this.arc.setAttribute(
      'd',
      flight.gunSight.rangeSource === 'base' ? '' : gunRangeArc(flight.gunSight.rangeM ?? NaN),
    );
    this.arc.dataset.rangeM = String(flight.gunSight.rangeM);
    this.svg.style.display = 'block';
  }
  dispose(): void {
    this.svg.remove();
  }
}
