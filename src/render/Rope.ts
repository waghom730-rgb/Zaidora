import { GROUND_Y } from '../config';

export interface RopeOptions {
  segments: number;
  /** Total length in px. */
  length: number;
  gravity: number;
  /** Velocity kept each step (0..1). */
  damping: number;
  /** Pull toward the rest shape each step (0..1) — keeps hair and cloth from going limp. */
  stiffness: number;
  /** Rest direction relative to facing: x < 0 trails behind the character. */
  rest: { x: number; y: number };
  /** Breeze strength. */
  flutter: number;
}

interface Pt {
  x: number;
  y: number;
  px: number;
  py: number;
}

/**
 * Verlet rope for secondary motion (headband tails, ponytail, scarf, belt).
 * Simulated in world space so it naturally trails behind fast movement.
 */
export class Rope {
  readonly pts: Pt[] = [];
  private readonly seg: number;
  private readonly restLen: number;

  constructor(private readonly o: RopeOptions) {
    for (let i = 0; i <= o.segments; i++) this.pts.push({ x: 0, y: 0, px: 0, py: 0 });
    this.seg = o.length / o.segments;
    this.restLen = Math.hypot(o.rest.x, o.rest.y) || 1;
  }

  reset(x: number, y: number, facing: number): void {
    const rx = (this.o.rest.x / this.restLen) * facing;
    const ry = this.o.rest.y / this.restLen;
    this.pts.forEach((p, i) => {
      p.x = p.px = x + rx * this.seg * i;
      p.y = p.py = y + ry * this.seg * i;
    });
  }

  step(ax: number, ay: number, facing: number, clock: number): void {
    const { o, seg, pts } = this;
    const rx = (o.rest.x / this.restLen) * facing;
    const ry = o.rest.y / this.restLen;
    const n = pts.length;

    pts[0].x = pts[0].px = ax;
    pts[0].y = pts[0].py = ay;

    for (let i = 1; i < n; i++) {
      const p = pts[i];
      const vx = (p.x - p.px) * o.damping;
      const vy = (p.y - p.py) * o.damping;
      p.px = p.x;
      p.py = p.y;
      const wave = Math.sin(clock * 0.21 + i * 0.75) * o.flutter * (i / n);
      p.x += vx - facing * o.flutter * 0.12 + wave * 0.35;
      p.y += vy + o.gravity + wave * 0.5;
      // Bias toward the rest shape.
      p.x += (ax + rx * seg * i - p.x) * o.stiffness;
      p.y += (ay + ry * seg * i - p.y) * o.stiffness;
      if (p.y > GROUND_Y - 2) p.y = GROUND_Y - 2;
    }

    for (let iter = 0; iter < 4; iter++) {
      for (let i = 0; i < n - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        const diff = (d - seg) / d;
        if (i === 0) {
          b.x -= dx * diff;
          b.y -= dy * diff;
        } else {
          a.x += dx * diff * 0.5;
          a.y += dy * diff * 0.5;
          b.x -= dx * diff * 0.5;
          b.y -= dy * diff * 0.5;
        }
      }
    }
  }
}
