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
  /** Offset into the breeze (steps), so neighbouring tails don't flutter in lockstep. */
  phase?: number;
}

/** Breeze felt standing still, as a share of `flutter`; moving adds to it (see step). */
const STILL_AIR = 0.55;
/** Extra flutter per px/step the anchor moves, and the most it can reach. */
const AIR_PER_PX = 0.12;
const MAX_AIR = 1.6;

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

    // Moving through the air makes cloth flap harder; standing still leaves a light breeze.
    const air = Math.min(MAX_AIR, STILL_AIR + Math.hypot(ax - pts[0].x, ay - pts[0].y) * AIR_PER_PX);
    pts[0].x = pts[0].px = ax;
    pts[0].y = pts[0].py = ay;

    // The breeze: two unrelated waves under a slowly gusting strength, so it never settles into
    // a visible beat.
    const t = clock + (o.phase ?? 0);
    const gust = 0.7 + 0.3 * Math.sin(t * 0.019) * Math.sin(t * 0.047 + 1.1);

    for (let i = 1; i < n; i++) {
      const p = pts[i];
      const vx = (p.x - p.px) * o.damping;
      const vy = (p.y - p.py) * o.damping;
      p.px = p.x;
      p.py = p.y;
      const wave = (Math.sin(t * 0.13 + i * 0.75) * 0.75 + Math.sin(t * 0.071 - i * 0.5) * 0.25) * o.flutter * (i / n) * gust * air;
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
