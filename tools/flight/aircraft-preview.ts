/** Browser-only isolated exterior inspector. Bundled by surface-smoke into ignored output. */
import { AmbientLight, Color, DirectionalLight, Group, MeshStandardMaterial, OrthographicCamera, Scene, WebGLRenderer } from 'three';
import { RetailAircraft, type RetailAircraftData } from '../../engine/src/flight/RetailAircraft';
import { configureAircraftHook } from '../../engine/src/flight/AircraftHook';
import { surfaceAngle, type SurfaceControls } from '../../engine/src/flight/ControlSurfaces';
import type { AircraftId } from '../../engine/src/flight/aircraft-catalog';
import type { Platform } from '../../engine/src/platform/Platform';

const scene = new Scene();
scene.background = new Color(0x9aabb7);
scene.add(new AmbientLight(0xffffff, 2));
const sun = new DirectionalLight(0xffffff, 3);
sun.position.set(8, 15, -10); scene.add(sun);
const camera = new OrthographicCamera(-12, 12, 6.75, -6.75, 0.1, 200);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setSize(2560, 1440);
renderer.domElement.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:10000';
document.body.appendChild(renderer.domElement);
let aircraft: RetailAircraft | undefined;
const hook = new Group();
const material = new MeshStandardMaterial({color: 0x20272c, roughness: 1});
Object.assign(window, {
  async aircraftPreview(data: RetailAircraftData, id: AircraftId, controls: SurfaceControls, hookFraction: number, view: string) {
    if (!aircraft) {
      aircraft = await RetailAircraft.load({ fs: { exists: () => Promise.resolve(true), readText: () => Promise.resolve(JSON.stringify(data)) } } as unknown as Platform, id);
      scene.add(aircraft!.group);
      configureAircraftHook(hook, id, true, material); scene.add(hook);
    }
    for (const part of aircraft!.data.parts ?? [])
      if (part.rotationAxis) aircraft!.setSurfaceAngle(part.name, surfaceAngle(part.name, controls));
    hook.rotation.x = hookFraction * Number(hook.userData.deployAngle);
    camera.up.set(0, 1, 0);
    if (view === 'top') { camera.position.set(0, 40, 0); camera.up.set(0, 0, -1); }
    else if (view === 'side') camera.position.set(40, 0, 0);
    else camera.position.set(20, 12, -25);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  },
});
