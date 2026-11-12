import Phaser from 'phaser';
import { DEPTH } from '../config';
import type { FxStyle } from '../entities/fighterDefs';

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;

const PALETTE: Record<FxStyle, { core: number; edge: number; ring: number; sparks: number[] }> = {
  fire: { core: 0xfffbe6, edge: 0xff6a00, ring: 0xffc04d, sparks: [0xfff1a8, 0xffa53d, 0xff5a1f] },
  shadow: { core: 0xf4efff, edge: 0x7b4dff, ring: 0x9fe9ff, sparks: [0xe6dcff, 0x9a6bff, 0x6fd8f5] },
};

/** Hit sparks, block flashes, dust, auras — short-lived, fire-and-forget visuals. */
export class Effects {
  private readonly sparks: Record<FxStyle, Emitter>;
  private readonly blockSparks: Emitter;
  private readonly dustPuffs: Emitter;
  private readonly flames: Emitter;
  private readonly wisps: Emitter;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer?: Phaser.GameObjects.Layer,
  ) {
    const spark = (tint: number[]) =>
      this.track(
        scene.add.particles(0, 0, 'glow', {
          speed: { min: 180, max: 560 },
          angle: { min: 0, max: 360 },
          lifespan: { min: 160, max: 320 },
          scale: { start: 0.5, end: 0 },
          blendMode: Phaser.BlendModes.ADD,
          tint,
          emitting: false,
        }),
      ).setDepth(DEPTH.effects);

    this.sparks = { fire: spark(PALETTE.fire.sparks), shadow: spark(PALETTE.shadow.sparks) };
    this.blockSparks = spark([0xbff6ff, 0x5fd8ff, 0x3d7bff]);

    this.dustPuffs = this.track(
      scene.add.particles(0, 0, 'dust', {
        speed: { min: 30, max: 140 },
        angle: { min: 190, max: 350 },
        lifespan: { min: 350, max: 600 },
        scale: { start: 0.7, end: 1.8 },
        alpha: { start: 0.55, end: 0 },
        emitting: false,
      }),
    ).setDepth(DEPTH.shadow);

    this.flames = this.track(
      scene.add.particles(0, 0, 'flame', {
        speedX: { min: -50, max: 50 },
        speedY: { min: -260, max: -90 },
        lifespan: { min: 320, max: 640 },
        scale: { start: 0.9, end: 0.15 },
        alpha: { start: 1, end: 0 },
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      }),
    ).setDepth(DEPTH.effects);

    this.wisps = this.track(
      scene.add.particles(0, 0, 'glow', {
        speedX: { min: -40, max: 40 },
        speedY: { min: -140, max: -40 },
        lifespan: { min: 500, max: 900 },
        scale: { start: 0.65, end: 0 },
        alpha: { start: 0.85, end: 0 },
        tint: [0x9a6bff, 0x6fd8f5, 0x5a2fd0],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      }),
    ).setDepth(DEPTH.effects);
  }

  private track<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.layer?.add(o);
    return o;
  }

  hit(x: number, y: number, heavy: boolean, style: FxStyle): void {
    const p = PALETTE[style];
    this.starBurst(x, y, heavy ? 76 : 48, p.core, p.edge, heavy ? 260 : 170);
    this.ring(x, y, p.ring, heavy ? 4.2 : 2.6, heavy ? 320 : 200);
    this.sparks[style].explode(heavy ? 24 : 12, x, y);
    if (style === 'fire') this.burst(this.flames, x, y, heavy ? 12 : 5, 18);
    else this.slash(x, y, heavy ? 120 : 80, p.edge);
  }

  block(x: number, y: number): void {
    this.ring(x, y, 0x7fe8ff, 2.2, 180);
    this.starBurst(x, y, 34, 0xe8fbff, 0x4cc3ff, 140);
    this.blockSparks.explode(10, x, y);
  }

  dust(x: number, y: number, amount: number): void {
    this.dustPuffs.explode(amount, x, y);
  }

  /** Power-up burst around a fighter standing at (x, feetY). */
  aura(x: number, feetY: number, style: FxStyle, amount = 28): void {
    const emitter = style === 'fire' ? this.flames : this.wisps;
    for (let i = 0; i < amount; i++) {
      emitter.explode(1, x + Phaser.Math.Between(-45, 45), feetY - Phaser.Math.Between(0, 190));
    }
    this.ring(x, feetY - 95, style === 'fire' ? 0xff8a2a : 0x9a6bff, 6, 420);
  }

  private burst(emitter: Emitter, x: number, y: number, count: number, spread: number): void {
    for (let i = 0; i < count; i++) emitter.explode(1, x + Phaser.Math.Between(-spread, spread), y + Phaser.Math.Between(-spread, spread));
  }

  private starBurst(x: number, y: number, radius: number, fill: number, edge: number, duration: number): void {
    const g = this.track(this.scene.add.graphics({ x, y })).setDepth(DEPTH.effects);
    const n = 9;
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 === 0 ? radius * (0.75 + Math.random() * 0.35) : radius * 0.3;
      const a = (i / (n * 2)) * Math.PI * 2;
      pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    g.fillStyle(edge, 0.95);
    g.fillPoints(
      pts.map((p) => ({ x: p.x * 1.18, y: p.y * 1.18 })),
      true,
    );
    g.fillStyle(fill, 1);
    g.fillPoints(pts, true);
    g.setScale(0.35).setRotation(Math.random() * Math.PI);
    this.scene.tweens.add({
      targets: g,
      scale: 1.25,
      alpha: 0,
      duration,
      ease: 'Cubic.easeOut',
      onComplete: () => g.destroy(),
    });
  }

  private ring(x: number, y: number, color: number, scaleTo: number, duration: number): void {
    const g = this.track(this.scene.add.graphics({ x, y })).setDepth(DEPTH.effects);
    g.lineStyle(5, color, 1);
    g.strokeCircle(0, 0, 18);
    g.setScale(0.6);
    this.scene.tweens.add({
      targets: g,
      scale: scaleTo,
      alpha: 0,
      duration,
      ease: 'Quad.easeOut',
      onComplete: () => g.destroy(),
    });
  }

  /** A sharp diagonal slash line — the shadow style's impact signature. */
  private slash(x: number, y: number, length: number, edge: number): void {
    const g = this.track(this.scene.add.graphics({ x, y })).setDepth(DEPTH.effects + 1);
    const h = length / 2;
    const blade = (w: number) => [
      { x: -h, y: 0 },
      { x: 0, y: -w },
      { x: h, y: 0 },
      { x: 0, y: w },
    ];
    g.fillStyle(edge, 0.9);
    g.fillPoints(blade(7), true);
    g.fillStyle(0xffffff, 1);
    g.fillPoints(blade(3), true);
    g.setRotation(Phaser.Math.FloatBetween(-0.9, -0.4)).setScale(0.2, 1);
    this.scene.tweens.add({
      targets: g,
      scaleX: 1.2,
      alpha: 0,
      duration: 240,
      ease: 'Expo.easeOut',
      onComplete: () => g.destroy(),
    });
  }
}
