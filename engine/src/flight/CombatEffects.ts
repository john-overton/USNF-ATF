import {
  AdditiveBlending,
  NormalBlending,
  DataTexture,
  RGBAFormat,
  Sprite,
  SpriteMaterial,
  type Scene,
} from 'three';
import type { CombatWorld } from '../sim/combat/world';
import type { Vector3 } from 'three';

/** Original impact flashes and airframe smoke; no retail effect artwork. */
export class CombatEffects {
  private texture: DataTexture;
  private sprites: Sprite[] = [];
  constructor(private scene: Scene) {
    const pixels = new Uint8Array(32 * 32 * 4);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const i = (y * 32 + x) * 4;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
        pixels[i + 3] = Math.round(255 * Math.max(0, 1 - Math.hypot(x - 15.5, y - 15.5) / 16) ** 2);
      }
    this.texture = new DataTexture(pixels, 32, 32, RGBAFormat);
    this.texture.needsUpdate = true;
  }
  render(
    world: CombatWorld,
    origin: { x: number; z: number },
    burning: readonly { position: Vector3; age: number }[] = [],
  ): void {
    let index = 0;
    const draw = (
      position: { x: number; y: number; z: number },
      size: number,
      opacity: number,
      smoke: boolean,
      color = smoke ? 0x202020 : 0xffa530,
    ) => {
      if (index >= 256) return;
      let sprite = this.sprites[index++];
      if (!sprite) {
        sprite = new Sprite(
          new SpriteMaterial({ map: this.texture, depthWrite: false, toneMapped: false }),
        );
        this.sprites.push(sprite);
        this.scene.add(sprite);
      }
      sprite.visible = true;
      sprite.position.set(position.x - origin.x, position.y, position.z - origin.z);
      sprite.scale.setScalar(size);
      sprite.material.color.setHex(color);
      sprite.material.opacity = opacity;
      sprite.material.blending = smoke ? NormalBlending : AdditiveBlending;
    };
    for (const event of world.events.slice(-32)) {
      const age = (world.steps - event.step) / 120;
      const duration = event.type === 'destroyed' ? 12 : 0.25;
      if (age > duration) continue;
      if (event.type === 'destroyed') {
        const water = event.cause === 'water';
        if (age < 2)
          for (let j = 0; j < 5; j++)
            draw(
              {
                x: event.point.x + Math.sin(j * 1.26) * age * 10,
                y: event.point.y + 3 + j * 1.5 + age * 5,
                z: event.point.z + Math.cos(j * 1.26) * age * 10,
              },
              14 + age * 25,
              (1 - age / 2) * 0.9,
              water,
              water ? 0xcde7ed : j % 2 ? 0xff630a : 0xffdc65,
            );
        for (let j = 0; j < 6; j++)
          draw(
            {
              x: event.point.x + Math.sin(j * 2) * age * 2,
              y: event.point.y + 5 + age * (3 + j),
              z: event.point.z + Math.cos(j * 2) * age * 2,
            },
            12 + age * 6 + j * 2,
            (1 - age / 12) * 0.65,
            true,
            water ? 0xb8cbd1 : 0x242321,
          );
        continue;
      }
      draw(event.point, 4 + age * 8, 1 - age / duration, false);
    }
    for (const { position, age } of burning) {
      draw(position, 4 + Math.sin(age * 17) * 0.5, (1 - age / 10) * 0.8, false, 0xff7008);
      draw({ x: position.x, y: position.y + 4, z: position.z }, 8, (1 - age / 10) * 0.7, true);
    }
    for (const e of world.entities)
      if (e.damage.accumulated > e.damage.hitPointsMax * 0.2 && !e.damage.destroyed) {
        if (e.damage.accumulated > e.damage.hitPointsMax * 0.65)
          draw(e.state.position, 4, 0.8, false);
        for (let i = 1; i <= 6; i++)
          draw(
            {
              x: e.state.position.x - e.state.velocity.x * i * 0.07,
              y: e.state.position.y - e.state.velocity.y * i * 0.07 + i,
              z: e.state.position.z - e.state.velocity.z * i * 0.07,
            },
            4 + i * 2,
            0.65 - i * 0.07,
            true,
          );
      }
    for (; index < this.sprites.length; index++) this.sprites[index]!.visible = false;
  }
  reset(): void {
    for (const sprite of this.sprites) sprite.visible = false;
  }
  dispose(): void {
    for (const sprite of this.sprites) {
      sprite.removeFromParent();
      sprite.material.dispose();
    }
    this.texture.dispose();
    this.sprites = [];
  }
}
