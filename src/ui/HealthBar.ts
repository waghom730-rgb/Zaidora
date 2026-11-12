import Phaser from 'phaser';
import { DEPTH } from '../config';

const SKEW = 14;

/**
 * Slanted health bar. The yellow bar drops immediately; a red "damage trail"
 * lingers behind it and drains after a short delay so big combos read clearly.
 * The left bar is anchored at its outer edge; the right bar is its mirror image.
 */
export class HealthBar {
  private readonly g: Phaser.GameObjects.Graphics;
  private target = 1;
  private shown = 1;
  private trail = 1;
  private trailDelay = 0;
  private time = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly x: number,
    private readonly y: number,
    private readonly w: number,
    private readonly h: number,
    private readonly side: 'left' | 'right',
    layer?: Phaser.GameObjects.Layer,
  ) {
    this.g = scene.add.graphics().setDepth(DEPTH.hud);
    layer?.add(this.g);
  }

  set(ratio: number): void {
    const r = Phaser.Math.Clamp(ratio, 0, 1);
    if (r < this.target) this.trailDelay = 450;
    this.target = r;
  }

  reset(): void {
    this.target = 1;
    this.shown = 1;
    this.trail = 1;
    this.trailDelay = 0;
  }

  update(dt: number): void {
    this.time += dt;
    this.shown += (this.target - this.shown) * Math.min(1, dt / 40);
    if (this.trailDelay > 0) this.trailDelay -= dt;
    else this.trail = Math.max(this.target, this.trail - dt * 0.0006);
    if (this.trail < this.target) this.trail = this.target;
    this.draw();
  }

  /** Parallelogram covering `ratio` of the bar between vertical fractions t0..t1. */
  private shape(ratio: number, t0 = 0, t1 = 1, pad = 0): Phaser.Types.Math.Vector2Like[] {
    const x = this.x - pad;
    const y = this.y - pad;
    const w = this.w + pad * 2;
    const h = this.h + pad * 2;
    const left = (t: number) => x + SKEW * (1 - t);
    const pts = [
      { x: left(t0), y: y + h * t0 },
      { x: left(t0) + w * ratio, y: y + h * t0 },
      { x: left(t1) + w * ratio, y: y + h * t1 },
      { x: left(t1), y: y + h * t1 },
    ];
    if (this.side === 'right') {
      const mirror = 2 * x + w + SKEW;
      for (const p of pts) p.x = mirror - p.x;
    }
    return pts;
  }

  private draw(): void {
    const g = this.g;
    g.clear();

    g.fillStyle(0x0c0a12, 0.92);
    g.fillPoints(this.shape(1, 0, 1, 4), true);
    g.fillStyle(0x3a2f45, 1);
    g.fillPoints(this.shape(1), true);

    if (this.trail > 0.001) {
      g.fillStyle(0xff3355, 1);
      g.fillPoints(this.shape(this.trail), true);
    }

    if (this.shown > 0.001) {
      let color = 0xffd23f;
      if (this.target <= 0.25) {
        const pulse = (Math.sin(this.time / 90) + 1) / 2;
        color = Phaser.Display.Color.GetColor(255, Math.round(60 + pulse * 70), 50);
      } else if (this.target <= 0.5) {
        color = 0xff9a2e;
      }
      g.fillStyle(color, 1);
      g.fillPoints(this.shape(this.shown), true);
      g.fillStyle(0xffffff, 0.3);
      g.fillPoints(this.shape(this.shown, 0, 0.35), true);
    }

    g.lineStyle(2, 0xffffff, 0.85);
    g.strokePoints(this.shape(1), true, true);
  }
}
