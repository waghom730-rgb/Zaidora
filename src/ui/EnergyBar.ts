import Phaser from 'phaser';
import { DEPTH } from '../config';
import { textStyle } from './textStyles';

/** Linear blend between two 0xRRGGBB colors. */
function mix(a: number, b: number, t: number): number {
  const ch = (shift: number) => Math.round(((a >> shift) & 255) + ((((b >> shift) & 255) - ((a >> shift) & 255)) * t));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/**
 * Energy meter under a health bar. Divided into segments — one segment pays for one
 * special — so "can I use it?" is readable at a glance. Pulses when a special is ready
 * and flashes red when a special is attempted without enough energy.
 */
export class EnergyBar {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private value = 0;
  private shown = 0;
  private max = 100;
  private cost = 50;
  private time = 0;
  private denied = 0;
  private wasReady = false;

  constructor(
    private readonly scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    private readonly x: number,
    private readonly y: number,
    private readonly w: number,
    private readonly h: number,
    private readonly side: 'left' | 'right',
    private readonly readyText: string,
    private readonly color: number,
  ) {
    this.g = scene.add.graphics().setDepth(DEPTH.hud);
    this.label = scene.add
      .text(side === 'left' ? x : x + w, y + h + 4, 'ENERGY', textStyle(11, '#ffffff', { italic: false, strokeRatio: 0.3 }))
      .setOrigin(side === 'left' ? 0 : 1, 0)
      .setDepth(DEPTH.hud);
    layer.add([this.g, this.label]);
  }

  set(value: number, max: number, cost: number): void {
    this.value = value;
    this.max = max;
    this.cost = cost;
  }

  deny(): void {
    this.denied = 650;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.denied > 0) this.denied -= dt;
    this.shown += (this.value - this.shown) * Math.min(1, dt / 70);

    const ready = this.value >= this.cost;
    if (ready && !this.wasReady) {
      this.label.setScale(1.4);
      this.scene.tweens.add({ targets: this.label, scale: 1, duration: 220, ease: 'Back.easeOut' });
    }
    this.wasReady = ready;

    if (this.denied > 0) this.label.setText('NEED ENERGY').setColor('#ff5a4a');
    else if (ready) this.label.setText(this.readyText).setColor('#ffd23f');
    else this.label.setText(`ENERGY ${Math.floor(this.value)}`).setColor('#cfc6e0');
    this.draw(ready);
  }

  private draw(ready: boolean): void {
    const { g, x, y, w, h } = this;
    g.clear();
    g.fillStyle(0x0c0a12, 0.9);
    g.fillRect(x - 3, y - 3, w + 6, h + 6);
    g.fillStyle(0x231c30, 1);
    g.fillRect(x, y, w, h);

    const fillW = (w * Phaser.Math.Clamp(this.shown, 0, this.max)) / this.max;
    const fx = this.side === 'left' ? x : x + w - fillW;
    // Dimmer while charging; pulses toward white-gold once a special is ready.
    const color = ready
      ? mix(this.color, 0xfff1c4, ((Math.sin(this.time / 110) + 1) / 2) * 0.45)
      : mix(this.color, 0x231c30, 0.3);
    g.fillStyle(color, 1);
    g.fillRect(fx, y, fillW, h);
    g.fillStyle(0xffffff, 0.28);
    g.fillRect(fx, y, fillW, h * 0.35);

    // Segment dividers: one segment per special.
    g.lineStyle(2, 0x0c0a12, 1);
    for (let k = this.cost; k < this.max; k += this.cost) {
      const sx = this.side === 'left' ? x + (w * k) / this.max : x + w - (w * k) / this.max;
      g.lineBetween(sx, y, sx, y + h);
    }

    g.lineStyle(1.5, this.denied > 0 ? 0xff4a3a : 0xffffff, this.denied > 0 ? 1 : 0.7);
    g.strokeRect(x, y, w, h);
  }
}
