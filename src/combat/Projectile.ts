import { STAGE_LEFT, STAGE_RIGHT } from '../config';
import type { Fighter } from '../entities/Fighter';
import type { MoveData } from './moves';
import type { Box } from './types';

/** A flying attack (e.g. Kaen's Fireball). Hits once, then disappears. */
export class Projectile {
  alive = true;
  /** True if it ended by hitting or being blocked (vs. flying off the stage). */
  impacted = false;

  constructor(
    readonly owner: Fighter,
    readonly move: MoveData,
    public x: number,
    public y: number,
    readonly vx: number,
    readonly w: number,
    readonly h: number,
  ) {}

  get box(): Box {
    return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h };
  }

  step(): void {
    this.x += this.vx;
    if (this.x < STAGE_LEFT - 80 || this.x > STAGE_RIGHT + 80) this.alive = false;
  }
}
