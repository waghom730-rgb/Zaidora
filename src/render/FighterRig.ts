import Phaser from 'phaser';
import type { Fighter } from '../entities/Fighter';
import type { FighterId } from '../entities/fighterDefs';
import { ART_RES, headKey, partKey, partOrigin, type Expression, type PartId } from './CharacterArt';
import { clipLength, getAnimSet, sampleClip, type AnimSet, type Clip } from './animations';
import { NEUTRAL, clonePose, copyPose, mixPose, type Pose } from './poses';
import { Rope, type RopeOptions } from './Rope';

const DEG = Math.PI / 180;
/** Bone lengths — attack hitboxes in moves.ts are tuned to these. */
const SEG = { thigh: 46, shin: 46, torso: 58, upper: 34, fore: 32 } as const;
const AIR_HIP = 92;
const FOOT_CLEARANCE = 6;
const BACK_TINT = 0xa49cb8;
/** Multiplier applied to everything when a character is shown "unselected". */
const DIM_TINT = 0x5a5470;
const INK = 0x150e1a;
const OUT = 2;

type V = { x: number; y: number };
const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: V, s: number): V => ({ x: a.x * s, y: a.y * s });
const rot = (v: V, r: number): V => ({ x: v.x * Math.cos(r) - v.y * Math.sin(r), y: v.x * Math.sin(r) + v.y * Math.cos(r) });
const wrap180 = (a: number): number => ((((a + 180) % 360) + 360) % 360) - 180;
const mod = (a: number, n: number): number => ((a % n) + n) % n;

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

interface RopeSpec {
  space: 'head' | 'torso';
  anchor: V;
  front: boolean;
  w0: number;
  w1: number;
  color: number;
  opts: RopeOptions;
}

const css = (c: string): number => parseInt(c.replace('#', ''), 16);

/** Per-channel multiply of two 0xRRGGBB colors. */
function multiply(a: number, b: number): number {
  const ch = (shift: number) => Math.round((((a >> shift) & 255) * ((b >> shift) & 255)) / 255);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

function ropeSpecs(id: FighterId): RopeSpec[] {
  if (id === 'kaen') {
    const band = css('#f7f3ea');
    const belt = css('#211a25');
    const tail = (length: number, droop: number): RopeOptions => ({
      segments: 5,
      length,
      gravity: 0.16,
      damping: 0.9,
      stiffness: 0.07,
      rest: { x: -1, y: droop },
      flutter: 0.9,
    });
    const beltTail = (length: number, x: number): RopeOptions => ({
      segments: 3,
      length,
      gravity: 0.5,
      damping: 0.85,
      stiffness: 0.12,
      rest: { x, y: 1 },
      flutter: 0.15,
    });
    return [
      { space: 'head', anchor: { x: -16, y: -41 }, front: false, w0: 5, w1: 2.5, color: band, opts: tail(36, 0.25) },
      { space: 'head', anchor: { x: -16, y: -40 }, front: false, w0: 5, w1: 2.5, color: band, opts: tail(28, 0.6) },
      { space: 'torso', anchor: { x: 15, y: 2 }, front: true, w0: 5, w1: 4, color: belt, opts: beltTail(20, 0.15) },
      { space: 'torso', anchor: { x: 14, y: 2 }, front: true, w0: 5, w1: 4, color: belt, opts: beltTail(15, -0.1) },
    ];
  }
  const hair = css('#d6dbf0');
  const scarf = css('#6d40d8');
  const sash = css('#6fd8f5');
  const scarfTail = (length: number, droop: number): RopeOptions => ({
    segments: 8,
    length,
    gravity: 0.2,
    damping: 0.92,
    stiffness: 0.035,
    rest: { x: -1, y: droop },
    flutter: 1.3,
  });
  return [
    {
      space: 'torso',
      anchor: { x: -11, y: -62 },
      front: false,
      w0: 10,
      w1: 6,
      color: scarf,
      opts: scarfTail(74, 0.3),
    },
    {
      space: 'torso',
      anchor: { x: -11, y: -60 },
      front: false,
      w0: 9,
      w1: 5,
      color: scarf,
      opts: scarfTail(58, 0.55),
    },
    {
      space: 'head',
      anchor: { x: -17, y: -36 },
      front: false,
      w0: 13,
      w1: 2,
      color: hair,
      opts: { segments: 7, length: 50, gravity: 0.45, damping: 0.9, stiffness: 0.06, rest: { x: -0.75, y: 0.7 }, flutter: 0.7 },
    },
    {
      space: 'torso',
      anchor: { x: 15, y: 2 },
      front: true,
      w0: 6,
      w1: 4,
      color: sash,
      opts: { segments: 3, length: 22, gravity: 0.5, damping: 0.85, stiffness: 0.12, rest: { x: 0.15, y: 1 }, flutter: 0.2 },
    },
  ];
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
  private readonly anims: AnimSet;
  private readonly ghosts: Ghost[] = [];
  private ghostIndex = 0;

  private readonly pose: Pose = clonePose(NEUTRAL);
  private readonly from: Pose = clonePose(NEUTRAL);
  private readonly target: Pose = clonePose(NEUTRAL);
  private clipKey = '';
  private clipTime = 0;
  private blendTime = 0;
  private blendLen = 1;
  private walkDist = 0;
  private runDist = 0;
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
    this.anims = getAnimSet(f.def.id);

    this.backG = this.track(scene.add.graphics());
    this.root = this.track(scene.add.container(f.x, f.y));
    this.body = scene.add.container(0, 0);
    this.root.add(this.body);
    for (const name of ORDER) {
      const key = name === 'head' ? headKey(f.def.id, 'normal') : partKey(f.def.id, TEXTURE[name]);
      const o = partOrigin(key);
      const img = scene.add.image(0, 0, key).setOrigin(o.x, o.y).setScale(1 / ART_RES);
      if (name.endsWith('B')) img.setTint(BACK_TINT);
      this.parts[name] = img;
      this.body.add(img);
    }
    this.frontG = this.track(scene.add.graphics());
    this.trailG = this.track(scene.add.graphics()).setBlendMode(Phaser.BlendModes.ADD);

    this.ropes = ropeSpecs(f.def.id).map((spec) => {
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
    this.clipKey = '';
    this.tick();
    copyPose(this.pose, this.target);
    this.apply();
    this.ropesReady = false;
    this.stepRopes();
    this.trail.length = 0;
  }

  // ------------------------------------------------------------------ animation

  tick(): void {
    this.clock++;
    const f = this.f;
    if (f.state === 'walk') this.walkDist += f.vx * f.facing;
    if (f.state === 'run') this.runDist += Math.abs(f.vx);

    const sel = this.selectClip();
    if (sel.key !== this.clipKey) {
      copyPose(this.from, this.pose);
      this.from.rootRot = wrap180(this.from.rootRot);
      this.clipKey = sel.key;
      this.clipTime = 0;
      this.blendTime = 0;
      this.blendLen = sel.blend;
    } else {
      this.clipTime++;
    }
    this.blendTime++;
    sampleClip(sel.clip, sel.time ?? this.clipTime, this.target);
    const w = this.blendLen <= 0 ? 1 : Math.min(1, this.blendTime / this.blendLen);
    mixPose(this.pose, this.from, this.target, 1 - (1 - w) * (1 - w));

    this.expression = this.pickExpression();
    this.apply();
    this.stepRopes();
    this.stepTrail();
    this.maybeGhost();
  }

  private selectClip(): { key: string; clip: Clip; time?: number; blend: number } {
    const f = this.f;
    const A = this.anims;
    switch (f.state) {
      case 'intro':
        return { key: 'intro', clip: A.intro, blend: 0 };
      case 'idle':
        return { key: 'idle', clip: A.idle, blend: 6 };
      case 'walk': {
        const len = clipLength(A.walk);
        return { key: 'walk', clip: A.walk, time: mod((this.walkDist / A.stride) * len, len), blend: 5 };
      }
      case 'run': {
        const len = clipLength(A.run);
        return { key: 'run', clip: A.run, time: mod((this.runDist / A.runStride) * len, len), blend: 4 };
      }
      case 'dash':
        return { key: 'dash', clip: A.dash, blend: 2 };
      case 'backdash':
        return { key: 'backdash', clip: A.backdash, blend: 1 };
      case 'parry':
        return { key: `parry${f.hitSerial}`, clip: A.parry, blend: 1 };
      case 'parried':
        return { key: 'parried', clip: A.parried, blend: 1 };
      case 'prejump':
        return { key: 'prejump', clip: A.prejump, blend: 2 };
      case 'air':
        if (f.jumpDir === 0) return { key: 'airN', clip: A.airNeutral, blend: 3 };
        return { key: f.jumpDir > 0 ? 'airF' : 'airB', clip: f.jumpDir > 0 ? A.airFlipF : A.airFlipB, blend: 3 };
      case 'land':
        return { key: 'land', clip: A.land, blend: 1 };
      case 'block':
        return { key: 'block', clip: A.block, blend: 3 };
      case 'blockstun':
        return { key: `blockstun${f.hitSerial}`, clip: A.blockstun, blend: 1 };
      case 'hitstun':
        return {
          key: `hit${f.hitSerial}`,
          clip: f.lastHitHeavy ? A.hitHeavy : f.lastHitHigh ? A.hitHigh : A.hitBody,
          blend: 0,
        };
      case 'knockdown':
        return { key: 'knockdown', clip: A.knockdown, blend: 1 };
      case 'down':
      case 'ko':
        return { key: 'down', clip: A.down, blend: 1 };
      case 'getup':
        return { key: 'getup', clip: A.getup, blend: 2 };
      case 'victory':
        return { key: 'victory', clip: A.victory, blend: 6 };
      case 'lose':
        return { key: 'lose', clip: A.lose, blend: 6 };
      case 'attack': {
        const m = f.move;
        if (!m) return { key: 'idle', clip: A.idle, blend: 4 };
        return { key: `atk${f.moveSerial}`, clip: A.attacks[m.id], time: f.moveFrame, blend: 2 };
      }
    }
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

  /** Forward kinematics: pose -> part transforms (all in facing-right local space). */
  private apply(): void {
    const f = this.f;
    const p = this.pose;
    const dir = (a: number): V => ({ x: Math.sin(a * DEG), y: Math.cos(a * DEG) });

    const kneeF = mul(dir(p.legF[0]), SEG.thigh);
    const ankF = add(kneeF, mul(dir(p.legF[0] + p.legF[1]), SEG.shin));
    const kneeB = mul(dir(p.legB[0]), SEG.thigh);
    const ankB = add(kneeB, mul(dir(p.legB[0] + p.legB[1]), SEG.shin));

    // Grounded: plant the lowest foot on the floor. Airborne: fixed hip height.
    const grounded = f.grounded && f.state !== 'knockdown';
    const auto = grounded ? -(Math.max(ankF.y, ankB.y) + FOOT_CLEARANCE) : -AIR_HIP;
    const hipY = auto + (-18 - auto) * p.lying - p.lift;
    this.hipLocal = { x: p.bodyX, y: hipY };
    this.body.setPosition(p.bodyX, hipY).setRotation(p.rootRot * DEG);

    const lean = p.lean * DEG;
    const up: V = { x: Math.sin(lean), y: -Math.cos(lean) };
    const fwd: V = { x: Math.cos(lean), y: Math.sin(lean) };
    const hipF = mul(fwd, 3);
    const hipB = mul(fwd, -4);

    this.place('thighF', hipF, -p.legF[0]);
    this.place('shinF', add(hipF, kneeF), -(p.legF[0] + p.legF[1]));
    this.place('thighB', hipB, -p.legB[0]);
    this.place('shinB', add(hipB, kneeB), -(p.legB[0] + p.legB[1]));
    this.place('torso', { x: 0, y: 0 }, p.lean);

    const chest = mul(up, SEG.torso);
    const shF = mul(up, SEG.torso - 6);
    const shB = add(shF, mul(fwd, -6));
    const elbF = add(shF, mul(dir(p.armF[0]), SEG.upper));
    const elbB = add(shB, mul(dir(p.armB[0]), SEG.upper));
    this.place('upperF', shF, -p.armF[0]);
    this.place('foreF', elbF, -(p.armF[0] + p.armF[1]));
    this.place('upperB', shB, -p.armB[0]);
    this.place('foreB', elbB, -(p.armB[0] + p.armB[1]));

    const headDeg = p.lean + p.head;
    this.place('head', chest, headDeg);
    const face = headKey(f.def.id, this.expression);
    if (this.parts.head.texture.key !== face) this.parts.head.setTexture(face);

    this.chest = chest;
    this.headRot = headDeg * DEG;
    this.torsoRot = lean;
    this.handF = add(elbF, mul(dir(p.armF[0] + p.armF[1]), 33));
    this.handB = add(elbB, mul(dir(p.armB[0] + p.armB[1]), 33));
    this.toeF = add(add(hipF, ankF), mul(dir(p.legF[0] + p.legF[1] + 90), 8));

    const s = this.scale;
    const sq = p.squash;
    this.root.setPosition(f.x + this.shakeX, f.y).setScale((f.facing * s) / Math.sqrt(sq), s * sq);
  }

  /** Body-space point -> world. */
  private toWorld(q: V): V {
    const r = rot(q, this.pose.rootRot * DEG);
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
    const width = (110 + this.pose.lying * 80) * s;
    g.fillStyle(0x000000, 0.34 * Math.min(1, s));
    g.fillEllipse(f.x - this.pose.lying * 40 * f.facing * this.scale, groundY + 3, width, 22 * s);
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
