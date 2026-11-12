import type Phaser from 'phaser';
import { GROUND_Y, STEP_MS } from '../config';
import { Fighter } from '../entities/Fighter';
import type { FighterDef } from '../entities/fighterDefs';
import { FighterRig } from '../render/FighterRig';

/**
 * Characters posed on non-fight screens (menu, select, results).
 * Animates at a fixed 60 steps/s regardless of display refresh rate.
 */
export class Showcase {
  readonly fighters: Fighter[] = [];
  readonly rigs: FighterRig[] = [];
  private acc = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly shadows: Phaser.GameObjects.Graphics,
  ) {}

  add(def: FighterDef, x: number, facing: 1 | -1, scale: number, depth: number): { fighter: Fighter; rig: FighterRig } {
    const fighter = new Fighter(def, x, facing);
    const rig = new FighterRig(this.scene, fighter, { scale });
    rig.setDepth(depth);
    this.fighters.push(fighter);
    this.rigs.push(rig);
    return { fighter, rig };
  }

  update(delta: number): void {
    this.acc += Math.min(delta, 100);
    while (this.acc >= STEP_MS) {
      this.acc -= STEP_MS;
      for (const r of this.rigs) r.tick();
    }
    this.shadows.clear();
    for (const r of this.rigs) {
      r.drawShadow(this.shadows, GROUND_Y);
      r.draw();
    }
  }
}
