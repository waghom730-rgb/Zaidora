import Phaser from 'phaser';
import { DEPTH } from '../config';

/** Visual for a flying fireball: glowing core, flickering halo and a flame trail. */
export class FireballView {
  private readonly halo: Phaser.GameObjects.Image;
  private readonly core: Phaser.GameObjects.Image;
  private readonly trail: Phaser.GameObjects.Particles.ParticleEmitter;
  private t = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer | undefined,
    x: number,
    y: number,
    dir: number,
  ) {
    this.halo = scene.add
      .image(x, y, 'glow')
      .setTint(0xff6a1a)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1.9)
      .setDepth(DEPTH.effects);
    // The flame texture's tip points up; turn it so the tip trails behind the flight.
    this.core = scene.add
      .image(x, y, 'flame')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1.25)
      .setRotation(dir > 0 ? -Math.PI / 2 : Math.PI / 2)
      .setDepth(DEPTH.effects + 0.1);
    this.trail = scene.add
      .particles(x, y, 'flame', {
        lifespan: { min: 180, max: 360 },
        speed: { min: 20, max: 80 },
        angle: dir > 0 ? { min: 160, max: 200 } : { min: -20, max: 20 },
        scale: { start: 0.75, end: 0 },
        alpha: { start: 0.9, end: 0 },
        blendMode: Phaser.BlendModes.ADD,
        frequency: 18,
        quantity: 2,
      })
      .setDepth(DEPTH.effects - 0.1);
    layer?.add([this.trail, this.halo, this.core]);
  }

  update(x: number, y: number, dt: number): void {
    this.t += dt;
    this.halo.setPosition(x, y).setScale(1.8 + Math.sin(this.t / 55) * 0.18);
    this.core.setPosition(x, y).setScale(1.2 + Math.sin(this.t / 40) * 0.08, 1.25);
    this.trail.setPosition(x, y);
  }

  /** Removes the fireball; the trail is left to fade out naturally. */
  finish(): void {
    this.halo.destroy();
    this.core.destroy();
    this.trail.stop();
    this.scene.time.delayedCall(450, () => this.trail.destroy());
  }
}
