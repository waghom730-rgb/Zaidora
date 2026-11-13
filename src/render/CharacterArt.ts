import type Phaser from 'phaser';
import type { FighterDef, FighterLook } from '../entities/fighterDefs';

/**
 * Paints every body part of a character into its own canvas texture, once, at boot.
 * Parts are cel-shaded vector art (bezier shapes, gradients, ink outlines) and are
 * assembled at runtime by FighterRig into a cut-out skeleton.
 *
 * Coordinates are in on-screen pixels with the part's pivot (joint) at (0, 0):
 *   limbs point down (+y) from their joint, torso and head point up (-y),
 *   and the character faces +x.
 */

export type Expression = 'normal' | 'shout' | 'hurt';
export type PartId = 'upper' | 'fore' | 'thigh' | 'shin' | 'torso';
export const EXPRESSIONS: readonly Expression[] = ['normal', 'shout', 'hurt'];

/** Parts are painted at this multiple of on-screen size so they stay crisp when zoomed. */
export const ART_RES = 2.5;

export const partKey = (id: string, part: PartId): string => `${id}:${part}`;
export const headKey = (id: string, e: Expression): string => `${id}:head:${e}`;

const origins = new Map<string, { x: number; y: number }>();
export function partOrigin(key: string): { x: number; y: number } {
  return origins.get(key) ?? { x: 0.5, y: 0.5 };
}

type C = CanvasRenderingContext2D;
type PathFn = (c: C) => void;

const INK = '#150e1a';
const LW = 2.2;

// ------------------------------------------------------------------ drawing kit

function paintPart(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  px: number,
  py: number,
  paint: (c: C) => void,
): void {
  if (scene.textures.exists(key)) return;
  const cw = Math.ceil(w * ART_RES);
  const ch = Math.ceil(h * ART_RES);
  const tex = scene.textures.createCanvas(key, cw, ch);
  if (!tex) return;
  const c = tex.getContext();
  c.save();
  c.scale(ART_RES, ART_RES);
  c.translate(px, py);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  paint(c);
  c.restore();
  tex.refresh();
  origins.set(key, { x: (px * ART_RES) / cw, y: (py * ART_RES) / ch });
}

/** Base color with a cel-shaded shadow band on the back (-x) side. */
function cel(c: C, path: PathFn, base: string | CanvasGradient, shade: string, shift: number): void {
  c.save();
  c.beginPath();
  path(c);
  c.clip();
  c.fillStyle = shade;
  c.fillRect(-400, -400, 800, 800);
  c.translate(shift, -shift * 0.2);
  c.beginPath();
  path(c);
  c.fillStyle = base;
  c.fill();
  c.restore();
}

function ink(c: C, path: PathFn, lw = LW): void {
  c.beginPath();
  path(c);
  c.lineWidth = lw;
  c.strokeStyle = INK;
  c.stroke();
}

function solid(c: C, path: PathFn, color: string | CanvasGradient): void {
  c.beginPath();
  path(c);
  c.fillStyle = color;
  c.fill();
}

function inside(c: C, path: PathFn, draw: () => void): void {
  c.save();
  c.beginPath();
  path(c);
  c.clip();
  draw();
  c.restore();
}

/** Polyline through [x0, y0, x1, y1, ...]. Three points draw a smooth quadratic curve. */
function line(c: C, pts: number[], color: string, w: number): void {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  if (pts.length === 6) c.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]);
  else for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.strokeStyle = color;
  c.lineWidth = w;
  c.stroke();
}

/** A line with an ink outline around it. */
function band(c: C, pts: number[], color: string, w: number): void {
  line(c, pts, INK, w + LW * 1.5);
  line(c, pts, color, w);
}

const poly =
  (pts: number[]): PathFn =>
  (c) => {
    c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.closePath();
  };

const ellipse =
  (x: number, y: number, rx: number, ry: number, rot = 0): PathFn =>
  (c) => {
    c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  };

const roundRect =
  (x: number, y: number, w: number, h: number, r: number): PathFn =>
  (c) => {
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  };

/** Tapered, slightly muscular limb from (0,0) down to (0,len). bf/bb bulge the front/back. */
const limb =
  (len: number, r0: number, r1: number, bf = 0, bb = 0): PathFn =>
  (c) => {
    c.moveTo(r0, 0);
    c.bezierCurveTo(r0 + bf, len * 0.35, r1 + bf * 0.4, len * 0.75, r1, len);
    c.arc(0, len, r1, 0, Math.PI);
    c.bezierCurveTo(-r1 - bb * 0.4, len * 0.75, -r0 - bb, len * 0.35, -r0, 0);
    c.arc(0, 0, r0, Math.PI, Math.PI * 2);
    c.closePath();
  };

function hairGradient(c: C, look: FighterLook, top: number, bottom: number): CanvasGradient {
  const g = c.createLinearGradient(0, bottom, 0, top);
  g.addColorStop(0, look.hair[0]);
  g.addColorStop(0.5, look.hair[1]);
  g.addColorStop(1, look.hair[2]);
  return g;
}

// ------------------------------------------------------------------ shared pieces

function fist(c: C, base: string, shade: string, wrap: string | null, plate: string | null): void {
  const f = roundRect(-7.6, 26, 15.2, 14.5, 5);
  cel(c, f, base, shade, 4);
  if (wrap) {
    inside(c, f, () => {
      c.fillStyle = wrap;
      c.fillRect(-9, 25, 18, 6.5);
      line(c, [-8, 28.6, 8, 27.4], 'rgba(40,30,40,0.45)', 0.9);
    });
  }
  if (plate) solid(c, roundRect(-6, 34.6, 12, 4.4, 1.6), plate);
  ink(c, f);
  for (const x of [-3.4, 0.2, 3.8]) line(c, [x, 36.6, x, 40.2], INK, 1.1);
  const thumb = ellipse(5.2, 31.4, 2.8, 4.6, -0.35);
  cel(c, thumb, base, shade, 1.2);
  ink(c, thumb, 1.6);
}

function foot(c: C, base: string, shade: string, tabi: boolean): void {
  const ft: PathFn = (k) => {
    k.moveTo(-4.6, 39.5);
    k.bezierCurveTo(-7.6, 43, -8.4, 50.6, -4, 52.2);
    k.lineTo(13, 52.6);
    k.bezierCurveTo(18.6, 52.6, 19.2, 47.6, 14.6, 46.4);
    k.bezierCurveTo(9, 45.2, 5, 43, 4.6, 39);
    k.closePath();
  };
  cel(c, ft, base, shade, 2.6);
  ink(c, ft);
  if (tabi) {
    line(c, [11.6, 46.6, 12.6, 52.4], '#4a4378', 1.2);
    line(c, [-6, 51.4, 15, 51.6], 'rgba(150,140,210,0.5)', 1);
  } else {
    line(c, [14.4, 48.6, 15.6, 52], 'rgba(90,40,30,0.6)', 0.9);
  }
}

// ------------------------------------------------------------------ parts

function paintUpperArm(c: C, def: FighterDef): void {
  const L = def.look;
  if (def.id === 'kaen') {
    const arm = limb(34, 8.4, 6.4, 2.8, 1.6);
    cel(c, arm, L.skin, L.skinShade, 3.4);
    inside(c, arm, () => line(c, [3.6, 9, 6, 16, 3.8, 23], 'rgba(90,30,20,0.35)', 1.1));
    ink(c, arm);
    // Torn-off gi sleeve.
    const sleeve: PathFn = (k) => {
      k.moveTo(-10.8, 1);
      k.arc(0, 0, 10.8, Math.PI, Math.PI * 2);
      k.lineTo(10.5, 5);
      k.lineTo(7, 3);
      k.lineTo(4.6, 8.6);
      k.lineTo(1, 4.6);
      k.lineTo(-2.6, 9.2);
      k.lineTo(-5.6, 4.6);
      k.lineTo(-9.6, 7.6);
      k.closePath();
    };
    cel(c, sleeve, L.gi, L.giShade, 4.5);
    ink(c, sleeve);
  } else {
    const sleeve = limb(34, 9.4, 8, 1.4, 1.6);
    cel(c, sleeve, L.gi, L.giShade, 4);
    inside(c, sleeve, () => {
      line(c, [-6, 14, 0, 17.5, 7, 13], 'rgba(10,8,30,0.45)', 1.2);
      line(c, [-7, 25, 1, 28.5, 7, 24], 'rgba(10,8,30,0.45)', 1.1);
    });
    ink(c, sleeve);
    // Shoulder guard.
    const guard: PathFn = (k) => {
      k.moveTo(-11.5, 2);
      k.arc(0, 0, 11.5, Math.PI, Math.PI * 2);
      k.quadraticCurveTo(11.5, 8, 7, 10.5);
      k.lineTo(-8, 10.5);
      k.quadraticCurveTo(-11.5, 8, -11.5, 2);
      k.closePath();
    };
    cel(c, guard, '#3a3358', '#211c36', 4.5);
    inside(c, guard, () => line(c, [-10, 8.6, 10, 8.6], L.trim, 1.6));
    ink(c, guard);
  }
}

function paintForearm(c: C, def: FighterDef): void {
  const L = def.look;
  if (def.id === 'kaen') {
    const arm = limb(29, 6.6, 5.4, 1.8, 1.2);
    cel(c, arm, L.skin, L.skinShade, 3);
    inside(c, arm, () => {
      c.fillStyle = L.hands;
      c.fillRect(-9, 15, 18, 16);
      c.fillStyle = L.handsShade;
      c.fillRect(-9, 15, 3.6, 16);
      for (const y of [18, 22, 26]) line(c, [-8, y + 2.5, 8, y - 1], 'rgba(40,30,40,0.45)', 0.9);
    });
    ink(c, arm);
    fist(c, L.skin, L.skinShade, L.hands, null);
  } else {
    const arm = limb(29, 6.4, 5.4, 1.5, 1.2);
    cel(c, arm, L.skin, L.skinShade, 3);
    ink(c, arm);
    const bracer = roundRect(-7, 12, 14, 17.5, 3.5);
    cel(c, bracer, '#2e2850', '#1a1630', 4);
    inside(c, bracer, () => {
      line(c, [-7, 19, 7, 19], L.trim, 1.5);
      line(c, [-7, 23.5, 7, 23.5], 'rgba(143,232,255,0.4)', 1);
    });
    ink(c, bracer);
    const sleeve: PathFn = (k) => {
      k.moveTo(-8.8, 0);
      k.arc(0, 0, 8.8, Math.PI, Math.PI * 2);
      k.lineTo(9.8, 13.5);
      k.quadraticCurveTo(0, 17.5, -9.8, 13.5);
      k.closePath();
    };
    cel(c, sleeve, L.gi, L.giShade, 4);
    inside(c, sleeve, () => line(c, [-10, 12, 0, 15.6, 10, 12], L.trim, 1.4));
    ink(c, sleeve);
    fist(c, L.hands, L.handsShade, null, '#4a4272');
  }
}

function paintThigh(c: C, def: FighterDef): void {
  const L = def.look;
  const leg = limb(46, 11, 8.8, 2.6, 1.6);
  cel(c, leg, L.pants, L.pantsShade, 5);
  inside(c, leg, () => {
    line(c, [-6, 9, 1, 14.5, 8, 10], 'rgba(20,8,20,0.35)', 1.2);
    line(c, [-7, 29, 0, 34, 7, 30], 'rgba(20,8,20,0.3)', 1.1);
    line(c, [6.5, 3, 9.5, 20, 7, 38], 'rgba(255,255,255,0.18)', 1.6);
  });
  ink(c, leg);
}

function paintShin(c: C, def: FighterDef): void {
  const L = def.look;
  if (def.id === 'kaen') {
    const calf = limb(44, 7, 5.2, 1.4, 2.2);
    cel(c, calf, L.skin, L.skinShade, 3);
    ink(c, calf);
    foot(c, L.skin, L.skinShade, false);
    const wrap = roundRect(-6.4, 34.5, 12.8, 10.5, 2.6);
    cel(c, wrap, L.hands, L.handsShade, 3.5);
    inside(c, wrap, () => {
      line(c, [-6, 38, 6, 36.5], 'rgba(40,30,40,0.4)', 0.9);
      line(c, [-6, 41.5, 6, 40], 'rgba(40,30,40,0.4)', 0.9);
    });
    ink(c, wrap);
    // Gi pants rolled to mid-shin.
    const pant: PathFn = (k) => {
      k.moveTo(-9.6, 0);
      k.arc(0, 0, 9.6, Math.PI, Math.PI * 2);
      k.bezierCurveTo(10.6, 10, 10.4, 20, 10, 27);
      k.quadraticCurveTo(0, 31.5, -9.8, 27);
      k.bezierCurveTo(-10.4, 18, -10.6, 8, -9.6, 0);
      k.closePath();
    };
    cel(c, pant, L.pants, L.pantsShade, 4.5);
    inside(c, pant, () => {
      line(c, [-9, 22, 0, 26, 9, 22], 'rgba(20,8,20,0.35)', 1.1);
      line(c, [-6, 9, 2, 13, 8, 8], 'rgba(20,8,20,0.28)', 1);
    });
    ink(c, pant);
  } else {
    const calf = limb(44, 8, 6.2, 1.4, 2);
    cel(c, calf, '#2c2648', '#18142a', 3.5);
    inside(c, calf, () => {
      for (let y = 20; y < 46; y += 4.4) line(c, [-9, y, 9, y + 3], 'rgba(160,150,220,0.35)', 1);
    });
    ink(c, calf);
    foot(c, '#221d38', '#120f20', true);
    const pant: PathFn = (k) => {
      k.moveTo(-9.6, 0);
      k.arc(0, 0, 9.6, Math.PI, Math.PI * 2);
      k.bezierCurveTo(11, 8, 11, 16, 10.4, 21);
      k.quadraticCurveTo(0, 25.5, -10.4, 21);
      k.bezierCurveTo(-11, 15, -10.8, 7, -9.6, 0);
      k.closePath();
    };
    cel(c, pant, L.pants, L.pantsShade, 4.5);
    inside(c, pant, () => line(c, [-10, 18, 0, 22.5, 10, 18], 'rgba(10,8,30,0.4)', 1.1));
    ink(c, pant);
  }
}

function flame(c: C, x: number, y: number, s: number): void {
  const f: PathFn = (k) => {
    k.moveTo(x - 3 * s, y);
    k.quadraticCurveTo(x - 4 * s, y - 6 * s, x - 0.5 * s, y - 11 * s);
    k.quadraticCurveTo(x + 0.2 * s, y - 6 * s, x + 2.4 * s, y - 8 * s);
    k.quadraticCurveTo(x + 2 * s, y - 4 * s, x + 4 * s, y);
    k.closePath();
  };
  solid(c, f, '#ff8a1f');
  inside(c, f, () => solid(c, ellipse(x + 0.4 * s, y - 1.5 * s, 2 * s, 4 * s), '#ffd84a'));
}

function paintTorso(c: C, def: FighterDef): void {
  const L = def.look;
  const kaen = def.id === 'kaen';

  // Jacket skirt flaps below the belt.
  const skirtB = kaen
    ? poly([-15, 1, -20.5, 21, -3, 20, -1, 2])
    : poly([-15, 1, -20, 21, -16, 18.5, -12, 21.5, -8, 18.5, -3, 20.5, -1, 2]);
  const skirtF = kaen
    ? poly([1, 2, 3, 20.5, 21.5, 21, 15.5, 1])
    : poly([1, 2, 3, 20.5, 8, 18, 12, 21.5, 16, 18.5, 21, 21, 15.5, 1]);
  for (const s of [skirtB, skirtF]) {
    cel(c, s, L.gi, L.giShade, 6);
    inside(c, s, () => {
      if (kaen) {
        for (const x of [-18, -12.5, -7, 4.5, 10, 15.5]) flame(c, x, 22, 0.9);
      } else {
        c.fillStyle = 'rgba(10,8,30,0.45)';
        c.fillRect(-25, 15, 50, 8);
        line(c, [-24, 16.5, 24, 16.5], L.trim, 1.2);
      }
    });
    ink(c, s);
  }

  const jacket: PathFn = (k) => {
    k.moveTo(-15, 4);
    k.bezierCurveTo(-17.5, -16, -21, -36, -19, -50);
    k.bezierCurveTo(-17.5, -57, -12, -61.5, -5, -61.5);
    k.lineTo(8, -61.5);
    k.bezierCurveTo(15, -60.5, 19.5, -55, 19.5, -48);
    k.bezierCurveTo(20.5, -36, 17.5, -16, 15.5, 4);
    k.closePath();
  };
  cel(c, jacket, L.gi, L.giShade, 9);

  inside(c, jacket, () => {
    if (kaen) {
      // Open chest.
      const chest: PathFn = (k) => {
        k.moveTo(-3.5, -62);
        k.lineTo(11, -62);
        k.quadraticCurveTo(9, -40, 5.5, -19);
        k.quadraticCurveTo(0, -40, -3.5, -62);
        k.closePath();
      };
      cel(c, chest, L.skin, L.skinShade, 3.5);
      line(c, [0, -44, 5.5, -40.5, 10.5, -44.5], 'rgba(110,50,30,0.55)', 1.2);
      line(c, [5.2, -50, 5.4, -27], 'rgba(110,50,30,0.35)', 1);
      line(c, [3, -35, 7.5, -35], 'rgba(110,50,30,0.35)', 0.9);
      line(c, [3.5, -29.5, 7, -29.5], 'rgba(110,50,30,0.35)', 0.9);
      band(c, [-3.5, -62.5, 0.5, -41, 5.5, -19], L.trim, 3.4);
      band(c, [11, -62.5, 9, -41, 5.5, -19], L.trim, 3.4);
    } else {
      // Closed, crossed-over gi with a crescent crest on the back.
      solid(c, poly([2, -62, 12, -62, 7, -53]), '#15132a');
      band(c, [-6, -62, 4, -42, 15, -16], L.trim, 3);
      line(c, [-17, -30, -10, -24, -4, -27], 'rgba(10,8,30,0.4)', 1.2);
      c.beginPath();
      c.arc(-10, -42, 5.4, Math.PI * 0.35, Math.PI * 1.65, false);
      c.arc(-7.8, -42, 4.4, Math.PI * 1.55, Math.PI * 0.45, true);
      c.closePath();
      c.fillStyle = '#d4dbff';
      c.fill();
    }
    // Rim light along the front edge.
    line(c, [18.8, -50, 19.6, -30, 15.5, 2], 'rgba(255,255,255,0.18)', 1.8);
  });
  ink(c, jacket);

  // Belt / sash with knot.
  const bh = kaen ? 4 : 5;
  const belt: PathFn = (k) => {
    k.moveTo(-16.6, -bh - 0.5);
    k.quadraticCurveTo(0, -bh - 3, 16.6, -bh - 0.5);
    k.lineTo(16.6, bh);
    k.quadraticCurveTo(0, bh - 2.5, -16.6, bh);
    k.closePath();
  };
  cel(c, belt, L.belt, L.beltShade, 5);
  ink(c, belt);
  const knot = ellipse(14.6, 0, 4.6, 4.2);
  cel(c, knot, L.belt, L.beltShade, 2);
  ink(c, knot);

  if (!kaen) {
    // Scarf wrapped around the neck.
    const scarf: PathFn = (k) => {
      k.moveTo(-14, -57);
      k.quadraticCurveTo(-15, -70, -4, -71);
      k.lineTo(9, -71);
      k.quadraticCurveTo(16.5, -70, 14.5, -57);
      k.quadraticCurveTo(0, -53.5, -14, -57);
      k.closePath();
    };
    cel(c, scarf, L.accent, L.accentShade, 5);
    inside(c, scarf, () => {
      line(c, [-12, -63, 0, -60, 13, -63], 'rgba(20,8,50,0.45)', 1.2);
      line(c, [-6, -69, 3, -66.5, 12, -68], 'rgba(255,255,255,0.2)', 1.2);
    });
    ink(c, scarf);
  }
}

/** Head outline in profile-3/4 view, facing +x. Neck base (pivot) at (0,0). */
const headShape: PathFn = (k) => {
  k.moveTo(-6, -12);
  k.bezierCurveTo(-15, -15, -18, -30, -14, -38);
  k.bezierCurveTo(-9, -46.5, 6, -47.5, 12, -40);
  k.bezierCurveTo(15, -36, 16, -32, 16, -29);
  k.lineTo(18.6, -23);
  k.lineTo(16, -21.4);
  k.bezierCurveTo(16, -18, 15.6, -15, 14, -14);
  k.bezierCurveTo(13, -11, 10, -9.4, 7, -10);
  k.bezierCurveTo(3, -10.5, -1, -12, -6, -12);
  k.closePath();
};

function paintEyes(c: C, def: FighterDef, e: Expression): void {
  const L = def.look;
  const heavyBrow = def.id === 'kaen';
  if (e === 'hurt') {
    line(c, [6.6, -30, 13.6, -27.4, 8, -24.8], INK, 2);
    line(c, [5.6, -35, 11, -33.4, 15.6, -34.8], INK, heavyBrow ? 2.4 : 1.6);
    return;
  }
  const narrow = e === 'shout';
  const topY = narrow ? -30 : -31.4;
  const sclera: PathFn = (k) => {
    k.moveTo(6.8, -27);
    k.quadraticCurveTo(10.6, topY, 14.8, -28.6);
    k.quadraticCurveTo(11.2, -24.6, 6.8, -27);
    k.closePath();
  };
  solid(c, sclera, '#ffffff');
  inside(c, sclera, () => {
    solid(c, ellipse(11.8, -27.2, narrow ? 2.1 : 2.6, narrow ? 2.9 : 3.6), L.iris);
    solid(c, ellipse(12.2, -27.1, narrow ? 0.9 : 1.2, narrow ? 1.6 : 2.1), '#120a14');
    solid(c, ellipse(11.8, -25.4, 2, 0.9), 'rgba(255,255,255,0.35)');
  });
  solid(c, ellipse(12.8, -28.7, 0.85, 0.85), '#ffffff');
  line(c, [6.2, -27.4, 10.6, topY - 0.5, 15.3, -28.8], INK, 2.1);
  line(c, [15.3, -28.8, 16.9, -30.3], INK, 1.5);
  line(c, [9, -24.9, 13.6, -25.6], 'rgba(21,14,26,0.45)', 0.8);
  const browY = narrow ? 1.2 : 0;
  line(c, [5.6, -33.6 + browY, 10.6, -35 + browY, 16, -31.8 + browY * 1.6], INK, heavyBrow ? 2.4 : 1.6);
}

function paintMouth(c: C, e: Expression): void {
  if (e === 'normal') {
    line(c, [12.6, -15.2, 15.6, -15.6], INK, 1.3);
    return;
  }
  const open = e === 'shout' ? poly([11.4, -17.4, 16.6, -17.6, 15.8, -12.2, 12, -12.8]) : poly([11.8, -16.8, 16.4, -17.2, 15.6, -13, 12.4, -13.4]);
  solid(c, open, '#5a1018');
  inside(c, open, () => line(c, [11, -16.6, 17, -16.8], '#ffffff', 1.4));
  ink(c, open, 1.3);
}

function paintHead(c: C, def: FighterDef, e: Expression): void {
  const L = def.look;
  const kaen = def.id === 'kaen';
  const hairFill = hairGradient(c, L, -62, -14);

  // Neck.
  const neck = roundRect(-5.6, -16, 11.2, 20, 4);
  if (kaen) {
    cel(c, neck, L.skin, L.skinShade, 4);
  } else {
    cel(c, neck, L.mask ?? '#1c1931', '#100e1e', 4);
  }
  ink(c, neck);

  // Back hair mass.
  const back: PathFn = kaen
    ? poly([13, -38, 15.6, -50, 8.6, -45, 7, -61.5, 0.6, -48, -8, -61.5, -7, -47, -21, -56.5, -13, -42, -29.5, -46, -16, -35, -28.5, -32, -16, -27, -22.5, -18, -11, -19, -5, -28, 6, -37])
    : (k) => {
        k.moveTo(14, -37);
        k.bezierCurveTo(12, -50.5, -2, -53.5, -14, -47.5);
        k.lineTo(-27.5, -49.5);
        k.lineTo(-17, -41);
        k.lineTo(-30.5, -38);
        k.lineTo(-17, -32);
        k.lineTo(-22.5, -23);
        k.lineTo(-11, -22);
        k.lineTo(-5, -29);
        k.lineTo(6, -38);
        k.closePath();
      };
  solid(c, back, hairFill);
  inside(c, back, () => {
    const strand = kaen ? 'rgba(60,0,0,0.35)' : 'rgba(90,95,150,0.4)';
    line(c, [-2, -50, -8, -40, -18, -36], strand, 1.2);
    line(c, [4, -52, 0, -44, -6, -36], strand, 1.1);
    line(c, [-10, -44, -16, -34, -18, -26], strand, 1.1);
  });
  ink(c, back);

  // Head and face.
  cel(c, headShape, L.skin, L.skinShade, 11);
  inside(c, headShape, () => {
    solid(c, ellipse(9, -17.5, 5, 3.2, 0.3), 'rgba(170,80,60,0.18)');
    line(c, [16.1, -28.4, 18.2, -23.4], 'rgba(120,60,40,0.35)', 1);
  });
  ink(c, headShape);

  // Hair covering the skull (top and back of the head), leaving face and ear clear.
  const cap: PathFn = (k) => {
    k.moveTo(14.8, -37.4);
    k.bezierCurveTo(12.8, -49.5, -7, -52, -14.6, -41.5);
    k.bezierCurveTo(-18.8, -33.5, -17, -23.5, -10.8, -17.6);
    k.lineTo(-6.6, -19.6);
    k.bezierCurveTo(-5, -26.5, 0, -33, 6, -34.4);
    k.lineTo(11, -34.8);
    k.closePath();
  };
  solid(c, cap, hairFill);
  inside(c, cap, () => {
    const strand = kaen ? 'rgba(60,0,0,0.4)' : 'rgba(90,95,150,0.45)';
    line(c, [10, -44, 0, -45, -10, -38], strand, 1.1);
    line(c, [6, -38, -4, -38, -12, -28], strand, 1);
    line(c, [-14, -36, -14, -28, -11, -21], strand, 1);
    line(c, [8, -47, -2, -49, -11, -44], 'rgba(255,255,255,0.3)', 1.4);
  });
  ink(c, cap, 1.9);

  const ear = ellipse(-2.6, -25, 3.6, 5.2, 0.15);
  cel(c, ear, L.skin, L.skinShade, 1.6);
  ink(c, ear, 1.6);
  line(c, [-2.6, -28.2, -1, -25, -2.6, -21.8], 'rgba(110,50,30,0.6)', 1);

  paintEyes(c, def, e);

  if (L.mask) {
    const maskArea: PathFn = (k) => {
      k.moveTo(-20, -20);
      k.quadraticCurveTo(2, -27.6, 20, -24.4);
      k.lineTo(22, 6);
      k.lineTo(-20, 6);
      k.closePath();
    };
    inside(c, headShape, () => {
      solid(c, maskArea, L.mask ?? '#1c1931');
      line(c, [4, -24, 6, -17, 3, -11], 'rgba(150,140,220,0.25)', 1.1);
      line(c, [-20, -20, 2, -27.6, 20, -24.4], INK, 1.6);
    });
    ink(c, headShape);
  } else {
    paintMouth(c, e);
  }

  // Bangs.
  const bangs = kaen
    ? poly([-1, -45, 17, -41, 16.8, -31.5, 13, -37, 10.6, -30.5, 7.6, -37.6, 3, -32.6, 0.6, -39])
    : poly([1, -45, 16.6, -39.6, 18.2, -26.8, 13.6, -33.6, 11.2, -25.4, 8.2, -34.6, 3.6, -30.6, 1.6, -39]);
  solid(c, bangs, hairFill);
  ink(c, bangs, 1.8);

  if (kaen) {
    const bandPath = poly([17.4, -40, -15.6, -44.8, -15.2, -38.6, 16.8, -34.8]);
    cel(c, bandPath, L.accent, L.accentShade, 5);
    ink(c, bandPath, 1.8);
    solid(c, ellipse(12.4, -37.4, 2.5, 2.5), '#d83b27');
    ink(c, ellipse(12.4, -37.4, 2.5, 2.5), 1);
    const knot = ellipse(-16, -41.6, 3.4, 3);
    cel(c, knot, L.accent, L.accentShade, 1.5);
    ink(c, knot, 1.6);
  } else {
    const tie = ellipse(-17, -36, 3, 4.2, 0.3);
    solid(c, tie, '#2a2444');
    ink(c, tie, 1.4);
  }
}

// ------------------------------------------------------------------ entry point

export function paintCharacter(scene: Phaser.Scene, def: FighterDef): void {
  const id = def.artKey ?? def.id;
  paintPart(scene, partKey(id, 'upper'), 34, 56, 17, 13, (c) => paintUpperArm(c, def));
  paintPart(scene, partKey(id, 'fore'), 32, 58, 16, 10, (c) => paintForearm(c, def));
  paintPart(scene, partKey(id, 'thigh'), 40, 72, 20, 13, (c) => paintThigh(c, def));
  paintPart(scene, partKey(id, 'shin'), 50, 76, 20, 11, (c) => paintShin(c, def));
  paintPart(scene, partKey(id, 'torso'), 66, 102, 31, 76, (c) => paintTorso(c, def));
  for (const e of EXPRESSIONS) {
    paintPart(scene, headKey(id, e), 86, 92, 46, 78, (c) => paintHead(c, def, e));
  }
}

/** Teardrop flame used by fire particles. */
export function paintFlameTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('flame')) return;
  const t = scene.textures.createCanvas('flame', 32, 48);
  if (!t) return;
  const c = t.getContext();
  const g = c.createRadialGradient(16, 32, 1, 16, 30, 18);
  g.addColorStop(0, 'rgba(255,255,230,1)');
  g.addColorStop(0.3, 'rgba(255,220,80,0.95)');
  g.addColorStop(0.65, 'rgba(255,120,30,0.75)');
  g.addColorStop(1, 'rgba(255,60,20,0)');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(16, 2);
  c.bezierCurveTo(22, 14, 30, 22, 28, 34);
  c.bezierCurveTo(26, 44, 6, 44, 4, 34);
  c.bezierCurveTo(2, 22, 10, 14, 16, 2);
  c.fill();
  t.refresh();
}
