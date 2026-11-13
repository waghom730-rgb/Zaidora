import Phaser from 'phaser';
import type { Fighter } from '../entities/Fighter';
import { ART_RES, headKey, partKey, partOrigin, type Expression, type PartId } from './CharacterArt';
import { getAnimSet } from './animations';
import { PoseDriver } from './PoseDriver';
import { Rope, type RopeOptions } from './Rope';
import { ropeSpecs, type RopeSpec } from './ropeSpecs';
import { add, rot, type V } from './skeleton';

const DEG = Math.PI / 180;
const BACK_TINT = 0xa49cb8;
/** Multiplier applied to everything when a character is shown "unselected". */
const DIM_TINT = 0x5a5470;
const INK = 0x150e1a;
const OUT = 2;

type PartName = 'upperB' | 'foreB' | 'shinB' | 'thighB' | 'shinF' | 'thighF' | 'torso' | 'head' | 'upperF' | 'foreF';
/** Back-to-front draw order. */
const ORDER: readonly PartName[] = ['upperB', 'foreB', 'shinB', 'thighB', 'shinF', 'thighF', 'torso', 'head', 'upperF', 'foreF'];
const TEXTURE: Record<Exclude<PartName, 'head'>, PartId> = {
  upperB: 'upper',
  foreB: 'fore',
  shinB: 'shin',
  thighB: 'thigh',
  shinF: 'shin',
  thighF: 'thigh',
  torso: 'torso',
  upperF: 'upper',
  foreF: 'fore',
};

/** Per-channel multiply of two 0xRRGGBB colors. */
function multiply(a: number, b: number): number {
  const ch = (shift: number) => Math.round((((a >> shift) & 255) * ((b >> shift) & 255)) / 255);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

interface RopeSlot extends RopeSpec {
  rope: Rope;
}

interface Ghost {
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Container;
  parts: Phaser.GameObjects.Image[];
  tween: Phaser.Tweens.Tween | null;
}

export interface RigOptions {
  layer?: Phaser.GameObjects.Layer;
  /** Display scale (menus show the characters bigger). */
  scale?: number;
}

/**
 * Cut-out skeletal rig: painted body parts (CharacterArt) placed on a 2-bone-per-limb
 * skeleton, animated by keyframe clips (animations.ts) with cross-fades, plus rope
 * physics for hair and cloth, swoosh trails and afterimages.
 *
 * tick() advances one logic step (so hitstop freezes everything); draw() renders.
 */
export class FighterRig {
  readonly root: Phaser.GameObjects.Container;
  /** Horizontal jitter applied while the fighter is frozen in hitstop. */
  shakeX = 0;

  private readonly scene: Phaser.Scene;
  private readonly layer?: Phaser.GameObjects.Layer;
  private readonly scale: number;
  private readonly body: Phaser.GameObjects.Container;
  private readonly parts = {} as Record<PartName, Phaser.GameObjects.Image>;
  private readonly backG: Phaser.GameObjects.Graphics;
  private readonly frontG: Phaser.GameObjects.Graphics;
  private readonly trailG: Phaser.GameObjects.Graphics;
  private readonly ropes: RopeSlot[];
  /** Clip selection, blending, foot planting and the solved skeleton (pure; see PoseDriver). */
  private readonly drive: PoseDriver;
  /** Texture key prefix: the fighter id, or id@outfit for alternate looks. */
  private readonly art: string;
  private readonly ghosts: Ghost[] = [];
  private ghostIndex = 0;

  private clock = 0;
  private expression: Expression = 'normal';
  private flashing = false;
  private dimmed = false;
  /** White "impact frame" flash: brief, so the hurt face and recoil read during hitstop. */
  private flashUntil = 0;
  private seenHitSerial = 0;
  private ropesReady = false;
  private depth = 10;

  // Cached skeleton (body space = relative to the hip, before whole-body rotation).
  private hipLocal: V = { x: 0, y: 0 };
  private chest: V = { x: 0, y: 0 };
  private headRot = 0;
  private torsoRot = 0;
  private handF: V = { x: 0, y: 0 };
  private handB: V = { x: 0, y: 0 };
  private toeF: V = { x: 0, y: 0 };
  private readonly trail: V[] = [];

  constructor(
    scene: Phaser.Scene,
    readonly f: Fighter,
    opts: RigOptions = {},
  ) {
    this.scene = scene;
    this.layer = opts.layer;
    this.scale = opts.scale ?? 1;
    this.drive = new PoseDriver(f, getAnimSet(f.def.id), this.scale);
    this.art = f.def.artKey ?? f.def.id;

    this.backG = this.track(scene.add.graphics());
    this.root = this.track(scene.add.container(f.x, f.y));
    this.body = scene.add.container(0, 0);
    this.root.add(this.body);
    for (const name of ORDER) {
      const key = name === 'head' ? headKey(this.art, 'normal') : partKey(this.art, TEXTURE[name]);
      const o = partOrigin(key);
      const img = scene.add.image(0, 0, key).setOrigin(o.x, o.y).setScale(1 / ART_RES);
      if (name.endsWith('B')) img.setTint(BACK_TINT);
      this.parts[name] = img;
      this.body.add(img);
    }
    this.frontG = this.track(scene.add.graphics());
    this.trailG = this.track(scene.add.graphics()).setBlendMode(Phaser.BlendModes.ADD);

    this.ropes = ropeSpecs(f.def).map((spec) => {
      const s = this.scale;
      const opts: RopeOptions = { ...spec.opts, length: spec.opts.length * s };
      return { ...spec, w0: spec.w0 * s, w1: spec.w1 * s, rope: new Rope(opts) };
    });

    this.setDepth(10);
    this.seenHitSerial = f.hitSerial;
    this.snap();
  }

  private track<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.layer?.add(o);
    return o;
  }

  setDepth(d: number): void {
    this.depth = d;
    this.backG.setDepth(d - 0.3);
    this.root.setDepth(d);
    this.frontG.setDepth(d + 0.3);
    this.trailG.setDepth(d + 0.4);
  }

  /** Darken the character (e.g. the unselected fighter on the select screen). */
  setDimmed(dimmed: boolean): void {
    if (dimmed === this.dimmed) return;
    this.dimmed = dimmed;
    this.refreshTint();
  }

  private refreshTint(): void {
    for (const name of ORDER) {
      const img = this.parts[name];
      if (this.flashing) {
        img.setTintFill(0xffffff);
        continue;
      }
      const base = name.endsWith('B') ? BACK_TINT : 0xffffff;
      img.setTint(this.dimmed ? multiply(base, DIM_TINT) : base);
    }
  }

  /** Jump straight to the current state's pose and re-seat hair/cloth (round start, teleports). */
  snap(): void {
    this.drive.snap();
    this.apply();
    this.ropesReady = false;
    this.stepRopes();
    this.trail.length = 0;
  }

  // ------------------------------------------------------------------ animation

  tick(): void {
    this.clock++;
    this.drive.tick();
    this.expression = this.pickExpression();
    this.apply();
    this.stepRopes();
    this.stepTrail();
    this.maybeGhost();
  }

  private get clipTime(): number {
    return this.drive.clipTime;
  }

  private pickExpression(): Expression {
    const f = this.f;
    switch (f.state) {
      case 'hitstun':
      case 'parried':
      case 'knockdown':
      case 'down':
      case 'ko':
      case 'lose':
        return 'hurt';
      case 'parry':
        return 'shout';
      case 'getup':
        return this.clipTime < 8 ? 'hurt' : 'normal';
      case 'attack': {
        const m = f.move;
        if (m && f.moveFrame >= m.startup * 0.5 && f.moveFrame < m.startup + m.active + 6) return 'shout';
        return 'normal';
      }
      case 'intro':
        if (f.def.id === 'kaen') return this.clipTime >= 34 && this.clipTime < 72 ? 'shout' : 'normal';
        return this.clipTime >= 52 ? 'shout' : 'normal';
      case 'victory':
        return f.def.id === 'kaen' && this.clipTime >= 14 ? 'shout' : 'normal';
      default:
        return 'normal';
    }
  }

  // ------------------------------------------------------------------ skeleton

  private place(name: PartName, pos: V, deg: number): void {
    this.parts[name].setPosition(pos.x, pos.y).setRotation(deg * DEG);
  }

  /** Places the painted parts on the solved skeleton (all in facing-right local space). */
  private apply(): void {
    const f = this.f;
    const d = this.drive;
    const p = d.pose;
    this.hipLocal = d.hip;
    this.body.setPosition(d.hip.x, d.hip.y).setRotation(p.rootRot * DEG);

    const j = d.joints;
    this.place('thighF', j.hipF, -j.legF[0]);
    this.place('shinF', j.kneeF, -(j.legF[0] + j.legF[1]));
    this.place('thighB', j.hipB, -j.legB[0]);
    this.place('shinB', j.kneeB, -(j.legB[0] + j.legB[1]));
    this.place('torso', { x: 0, y: 0 }, p.lean);
    this.place('upperF', j.shF, -p.armF[0]);
    this.place('foreF', j.elbF, -(p.armF[0] + p.armF[1]));
    this.place('upperB', j.shB, -p.armB[0]);
    this.place('foreB', j.elbB, -(p.armB[0] + p.armB[1]));

    const headDeg = p.lean + p.head;
    this.place('head', j.chest, headDeg);
    const face = headKey(this.art, this.expression);
    if (this.parts.head.texture.key !== face) this.parts.head.setTexture(face);

    this.chest = j.chest;
    this.headRot = headDeg * DEG;
    this.torsoRot = p.lean * DEG;
    this.handF = j.handF;
    this.handB = j.handB;
    this.toeF = j.toeF;

    this.root.setPosition(f.x + this.shakeX, f.y).setScale(d.scaleX, this.scale * p.squash);
  }

  /** Body-space point -> world. */
  private toWorld(q: V): V {
    const r = rot(q, this.drive.pose.rootRot * DEG);
    return {
      x: this.root.x + (this.hipLocal.x + r.x) * this.root.scaleX,
      y: this.root.y + (this.hipLocal.y + r.y) * this.root.scaleY,
    };
  }

  private anchorWorld(space: 'head' | 'torso', a: V): V {
    const local = space === 'head' ? add(this.chest, rot(a, this.headRot)) : rot(a, this.torsoRot);
    return this.toWorld(local);
  }

  // ------------------------------------------------------------------ secondary motion

  private stepRopes(): void {
    for (const slot of this.ropes) {
      const w = this.anchorWorld(slot.space, slot.anchor);
      if (!this.ropesReady) slot.rope.reset(w.x, w.y, this.f.facing);
      slot.rope.step(w.x, w.y, this.f.facing, this.clock);
    }
    this.ropesReady = true;
  }

  private stepTrail(): void {
    const f = this.f;
    const m = f.move;
    const inWindow = f.state === 'attack' && m && f.moveFrame >= m.startup - 2 && f.moveFrame <= m.startup + m.active + 1;
    if (inWindow && m) {
      const usesHand =
        m.id === 'jab' || m.id === 'airPunch' || m.id === 'fireball' || m.id === 'shadowDash' || m.id === 'shadowSlash';
      const rearHand = m.id === 'cross' || m.id === 'flameStrike';
      const limb = rearHand ? this.handB : usesHand ? this.handF : this.toeF;
      this.trail.push(this.toWorld(limb));
      if (this.trail.length > 7) this.trail.shift();
    } else if (this.trail.length) {
      this.trail.shift();
      if (this.trail.length) this.trail.shift();
    }
  }

  private maybeGhost(): void {
    const f = this.f;
    const m = f.move;
    const dashing = m?.special?.kind === 'dash' && f.movePhase === 'active';
    if (dashing) {
      this.spawnGhost();
    } else if ((f.state === 'dash' || f.state === 'backdash') && f.stateTime <= 10 && f.stateTime % 3 === 1) {
      // Movement afterimages — fewer than an attack's, so they read as speed, not a strike.
      this.spawnGhost();
    } else if (f.state === 'attack' && m?.heavy && f.moveFrame >= m.startup - 4 && f.moveFrame <= m.startup + m.active && f.moveFrame % 2 === 0) {
      this.spawnGhost();
    } else if (f.state === 'air' && f.jumpDir !== 0 && this.clipTime >= 4 && this.clipTime <= 26 && this.clipTime % 3 === 0) {
      this.spawnGhost();
    }
  }

  private spawnGhost(): void {
    if (this.ghosts.length < 6) this.ghosts.push(this.makeGhost());
    const g = this.ghosts[this.ghostIndex++ % this.ghosts.length];
    g.tween?.stop();
    g.root
      .setPosition(this.root.x, this.root.y)
      .setScale(this.root.scaleX, this.root.scaleY)
      .setVisible(true)
      .setAlpha(0.55)
      .setDepth(this.depth - 0.5);
    g.body.setPosition(this.body.x, this.body.y).setRotation(this.body.rotation);
    ORDER.forEach((name, i) => {
      const src = this.parts[name];
      g.parts[i].setTexture(src.texture.key).setPosition(src.x, src.y).setRotation(src.rotation);
    });
    g.tween = this.scene.tweens.add({
      targets: g.root,
      alpha: 0,
      duration: 220,
      onComplete: () => g.root.setVisible(false),
    });
  }

  private makeGhost(): Ghost {
    const root = this.track(this.scene.add.container(0, 0));
    const body = this.scene.add.container(0, 0);
    root.add(body);
    const color = this.f.def.ghostColor;
    const parts = ORDER.map((name) => {
      const src = this.parts[name];
      const img = this.scene.add
        .image(0, 0, src.texture.key)
        .setOrigin(src.originX, src.originY)
        .setScale(1 / ART_RES)
        .setTintFill(color);
      body.add(img);
      return img;
    });
    return { root, body, parts, tween: null };
  }

  // ------------------------------------------------------------------ render

  draw(): void {
    this.root.x = this.f.x + this.shakeX;

    const now = this.scene.time.now;
    if (this.f.hitSerial !== this.seenHitSerial) {
      this.seenHitSerial = this.f.hitSerial;
      if (this.f.state !== 'blockstun') this.flashUntil = now + 70;
    }
    const flash = now < this.flashUntil;
    if (flash !== this.flashing) {
      this.flashing = flash;
      this.refreshTint();
    }

    this.backG.clear();
    this.frontG.clear();
    for (const slot of this.ropes) {
      const color = flash ? 0xffffff : this.dimmed ? multiply(slot.color, DIM_TINT) : slot.color;
      ribbon(slot.front ? this.frontG : this.backG, slot.rope.pts, slot.w0, slot.w1, color);
    }

    this.trailG.clear();
    if (this.trail.length >= 2) {
      const pts = this.trail;
      const color = this.f.def.trailColor;
      swoosh(this.trailG, pts, 13 * this.scale, color, 0.45);
      swoosh(this.trailG, pts, 5 * this.scale, 0xffffff, 0.75);
    }
  }

  drawShadow(g: Phaser.GameObjects.Graphics, groundY: number): void {
    const f = this.f;
    const h = Math.max(0, groundY - f.y);
    const s = Math.max(0.3, 1 - h / 320) * this.scale;
    const lying = this.drive.pose.lying;
    const width = (110 + lying * 80) * s;
    g.fillStyle(0x000000, 0.34 * Math.min(1, s));
    g.fillEllipse(f.x - lying * 40 * f.facing * this.scale, groundY + 3, width, 22 * s);
  }

  destroy(): void {
    this.root.destroy();
    this.backG.destroy();
    this.frontG.destroy();
    this.trailG.destroy();
    for (const g of this.ghosts) g.root.destroy();
  }
}

/** Tapered, outlined ribbon along rope points. */
function ribbon(g: Phaser.GameObjects.Graphics, pts: ReadonlyArray<V>, w0: number, w1: number, color: number): void {
  const n = pts.length;
  if (n < 2) return;
  const left: V[] = [];
  const right: V[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let tx = b.x - a.x;
    let ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const w = (w0 + (w1 - w0) * (i / (n - 1))) / 2;
    left.push({ x: pts[i].x - ty * w, y: pts[i].y + tx * w });
    right.push({ x: pts[i].x + ty * w, y: pts[i].y - tx * w });
  }
  const poly = left.concat(right.reverse());
  g.lineStyle(OUT * 2, INK, 1);
  g.strokePoints(poly, true, true);
  g.fillStyle(color, 1);
  g.fillPoints(poly, true, true);
  // Soft highlight down the middle.
  g.lineStyle(Math.max(1, w0 * 0.25), 0xffffff, 0.25);
  g.strokePoints(pts.slice(0, Math.ceil(n * 0.7)), false);
}

/** Motion smear behind a striking limb: thin at the oldest point, widest at the newest. */
function swoosh(g: Phaser.GameObjects.Graphics, pts: ReadonlyArray<V>, width: number, color: number, alpha: number): void {
  const n = pts.length;
  const left: V[] = [];
  const right: V[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let tx = b.x - a.x;
    let ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const w = (width * (i / (n - 1))) / 2;
    left.push({ x: pts[i].x - ty * w, y: pts[i].y + tx * w });
    right.push({ x: pts[i].x + ty * w, y: pts[i].y - tx * w });
  }
  g.fillStyle(color, alpha);
  g.fillPoints(left.concat(right.reverse()), true, true);
}
