import { STAGE_LEFT, STAGE_RIGHT } from '../config';
import type { Fighter } from '../entities/Fighter';
import type { MoveData } from './moves';
import { Projectile } from './Projectile';
import { boxesOverlap, overlapCenter, type Box } from './types';

export interface HitEvent {
  attacker: Fighter;
  defender: Fighter;
  move: MoveData;
  blocked: boolean;
  ko: boolean;
  /** Combo length including this hit (0 when blocked). */
  combo: number;
  damage: number;
  /** True when a projectile (not a body attack) landed this hit. */
  projectile: boolean;
  x: number;
  y: number;
}

const clampX = (x: number): number => Math.min(STAGE_RIGHT, Math.max(STAGE_LEFT, x));

/**
 * Resolves fighter-vs-fighter interaction each step:
 * body separation (pushboxes) and attacks (hitboxes vs hurtboxes).
 */
export class CombatManager {
  readonly projectiles: Projectile[] = [];

  constructor(
    private readonly a: Fighter,
    private readonly b: Fighter,
  ) {}

  /** Launches the projectile of `owner`'s current special move. */
  spawnProjectile(owner: Fighter): Projectile | null {
    const spec = owner.move?.special?.projectile;
    if (!owner.move || !spec) return null;
    const p = new Projectile(
      owner,
      owner.move,
      owner.x + spec.spawnX * owner.facing,
      owner.y + spec.spawnY,
      spec.speed * owner.facing,
      spec.w,
      spec.h,
    );
    this.projectiles.push(p);
    return p;
  }

  stepProjectiles(): void {
    for (const p of this.projectiles) if (p.alive) p.step();
  }

  /** Drops finished projectiles (call after their visuals have been cleaned up). */
  pruneProjectiles(): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) if (!this.projectiles[i].alive) this.projectiles.splice(i, 1);
  }

  clearProjectiles(): void {
    for (const p of this.projectiles) p.alive = false;
  }

  /** Keeps the two bodies from overlapping. */
  separate(): void {
    const { a, b } = this;
    if (!a.collides || !b.collides) return;
    const pa = a.getPushbox();
    const pb = b.getPushbox();
    if (!boxesOverlap(pa, pb)) return;

    const overlap = (pa.w + pb.w) / 2 - Math.abs(a.x - b.x);
    if (overlap <= 0) return;

    let dir = Math.sign(a.x - b.x);
    if (dir === 0) dir = a.facing === 1 ? -1 : 1;
    a.x += (dir * overlap) / 2;
    b.x -= (dir * overlap) / 2;

    // If one got pushed into a wall, the other takes the whole push.
    const fixA = clampX(a.x) - a.x;
    a.x += fixA;
    b.x += fixA;
    const fixB = clampX(b.x) - b.x;
    b.x += fixB;
    a.x = clampX(a.x + fixB);
  }

  /** "Camera walls": fighters can't drift further apart than the camera can show. */
  constrainSeparation(maxDistance: number): void {
    const { a, b } = this;
    const dist = Math.abs(a.x - b.x);
    if (dist <= maxDistance) return;
    const excess = dist - maxDistance;
    const dir = Math.sign(a.x - b.x) || 1;
    a.x -= (dir * excess) / 2;
    b.x += (dir * excess) / 2;
    const fixA = clampX(a.x) - a.x;
    a.x += fixA;
    b.x += fixA;
    const fixB = clampX(b.x) - b.x;
    b.x += fixB;
    a.x = clampX(a.x + fixB);
  }

  /** Finds and applies every hit this step. Both fighters can trade hits on the same frame. */
  resolveAttacks(): HitEvent[] {
    const contacts: Array<{
      att: Fighter;
      def: Fighter;
      move: MoveData;
      at: { x: number; y: number };
      projectile?: Projectile;
    }> = [];

    for (const [att, def] of [
      [this.a, this.b],
      [this.b, this.a],
    ] as const) {
      const hitbox = att.getHitbox();
      if (!hitbox || !att.move) continue;
      const hurt = def.getHurtboxes().find((h: Box) => boxesOverlap(hitbox, h));
      if (hurt) contacts.push({ att, def, move: att.move, at: overlapCenter(hitbox, hurt) });
    }

    // Each projectile hits at most once: it is consumed on contact.
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      const def = p.owner === this.a ? this.b : this.a;
      const hurt = def.getHurtboxes().find((h: Box) => boxesOverlap(p.box, h));
      if (!hurt) continue;
      p.alive = false;
      p.impacted = true;
      contacts.push({ att: p.owner, def, move: p.move, at: overlapCenter(p.box, hurt), projectile: p });
    }

    // Detect first, then apply, so a trade registers for both sides.
    return contacts.map(({ att, def, move, at, projectile }) => {
      if (!projectile) att.registerContact();
      const wasComboed = def.isBeingComboed;
      const hpBefore = def.hp;
      const blocked = def.receiveHit(move, att, projectile ? Math.sign(projectile.vx) : undefined);

      att.combo = blocked ? 0 : wasComboed ? att.combo + 1 : 1;

      // Attacking someone in the corner pushes the attacker back instead.
      const nearWall = att.facing === 1 ? def.x >= STAGE_RIGHT - 40 : def.x <= STAGE_LEFT + 40;
      if (!projectile && nearWall && att.grounded) {
        att.vx = -att.facing * (blocked ? move.blockPush : move.knockback) * 0.8;
      }

      return {
        attacker: att,
        defender: def,
        move,
        blocked,
        ko: def.hp <= 0,
        combo: att.combo,
        damage: hpBefore - def.hp,
        projectile: !!projectile,
        x: at.x,
        y: at.y,
      };
    });
  }
}
