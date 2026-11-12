import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH } from '../config';

export const ARENA_KEY = 'arena-sunset-dojo';
/** Painted above screen resolution so it stays sharp under the fight camera's zoom. */
const ARENA_RES = 1.5;

/** Deterministic PRNG so the painted background is identical every run. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

type Pt = readonly [number, number];

function ridge(ctx: CanvasRenderingContext2D, points: readonly Pt[], color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, GAME_HEIGHT);
  for (const [x, y] of points) ctx.lineTo(x, y);
  ctx.lineTo(GAME_WIDTH, GAME_HEIGHT);
  ctx.closePath();
  ctx.fill();
}

function pagoda(ctx: CanvasRenderingContext2D, cx: number, baseY: number, color: string): void {
  ctx.fillStyle = color;
  for (let i = 0; i < 5; i++) {
    const w = 96 - i * 15;
    const y = baseY - i * 27;
    ctx.fillRect(cx - w * 0.3, y - 16, w * 0.6, 16);
    ctx.beginPath();
    ctx.moveTo(cx - w / 2 - 10, y - 14);
    ctx.quadraticCurveTo(cx - w / 2, y - 18, cx - w / 4, y - 27);
    ctx.lineTo(cx + w / 4, y - 27);
    ctx.quadraticCurveTo(cx + w / 2, y - 18, cx + w / 2 + 10, y - 14);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillRect(cx - 1.5, baseY - 5 * 27 - 30, 3, 34);
}

function stoneLantern(ctx: CanvasRenderingContext2D, cx: number, baseY: number): void {
  ctx.fillStyle = '#24142a';
  ctx.fillRect(cx - 22, baseY - 10, 44, 10);
  ctx.fillRect(cx - 7, baseY - 52, 14, 42);
  ctx.fillRect(cx - 18, baseY - 60, 36, 8);
  ctx.fillRect(cx - 15, baseY - 88, 30, 28);
  ctx.beginPath();
  ctx.moveTo(cx - 30, baseY - 88);
  ctx.lineTo(cx, baseY - 108);
  ctx.lineTo(cx + 30, baseY - 88);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffcf7a';
  ctx.fillRect(cx - 8, baseY - 82, 16, 16);
}

/** Paints the static stage background once into a canvas texture. */
export function createArenaTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(ARENA_KEY)) return;
  const tex = scene.textures.createCanvas(ARENA_KEY, GAME_WIDTH * ARENA_RES, GAME_HEIGHT * ARENA_RES);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.scale(ARENA_RES, ARENA_RES);
  const W = GAME_WIDTH;
  const H = GAME_HEIGHT;
  const rand = seeded(7);
  const HORIZON = 480;
  const FLOOR = 548;
  const SX = 860;
  const SY = 340;

  // Sky.
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
  sky.addColorStop(0, '#120a2a');
  sky.addColorStop(0.3, '#33184d');
  sky.addColorStop(0.58, '#8a2f5f');
  sky.addColorStop(0.8, '#e2604a');
  sky.addColorStop(1, '#ffb25e');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, FLOOR);

  // Stars fading toward the horizon.
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 110; i++) {
    const x = rand() * W;
    const y = rand() * 230;
    const big = rand() < 0.12;
    ctx.globalAlpha = (1 - y / 230) * (0.3 + rand() * 0.7);
    ctx.fillRect(x, y, big ? 2 : 1, big ? 2 : 1);
  }
  ctx.globalAlpha = 1;

  // Sun glow + striped sun.
  const glow = ctx.createRadialGradient(SX, SY, 40, SX, SY, 440);
  glow.addColorStop(0, 'rgba(255, 210, 140, 0.55)');
  glow.addColorStop(1, 'rgba(255, 140, 90, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, FLOOR);

  const sun = document.createElement('canvas');
  sun.width = 300;
  sun.height = 300;
  const sctx = sun.getContext('2d');
  if (sctx) {
    const sg = sctx.createLinearGradient(0, 0, 0, 300);
    sg.addColorStop(0, '#fff3c4');
    sg.addColorStop(0.6, '#ffb45c');
    sg.addColorStop(1, '#ff6f4f');
    sctx.fillStyle = sg;
    sctx.beginPath();
    sctx.arc(150, 150, 140, 0, Math.PI * 2);
    sctx.fill();
    sctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 7; i++) sctx.fillRect(0, 168 + i * 18, 300, 3 + i * 1.4);
    ctx.drawImage(sun, SX - 150, SY - 150);
  }

  // Long thin clouds.
  const clouds: Array<[number, number, number, number, string]> = [
    [700, 300, 260, 7, 'rgba(255, 170, 160, 0.45)'],
    [980, 330, 200, 6, 'rgba(255, 190, 150, 0.4)'],
    [250, 220, 300, 8, 'rgba(200, 110, 160, 0.35)'],
    [520, 180, 180, 5, 'rgba(190, 100, 160, 0.3)'],
    [1120, 250, 220, 6, 'rgba(255, 150, 160, 0.35)'],
  ];
  for (const [cx, cy, rx, ry, color] of clouds) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Mountain layers, far to near.
  ridge(
    ctx,
    [[0, 360], [110, 290], [210, 330], [340, 250], [450, 320], [580, 280], [700, 350], [830, 300], [960, 360], [1080, 290], [1190, 340], [1280, 300]],
    '#7a3566',
  );
  ridge(
    ctx,
    [[0, 420], [140, 380], [260, 400], [380, 360], [520, 410], [640, 390], [760, 420], [900, 380], [1010, 352], [1130, 352], [1280, 400]],
    '#4d2154',
  );
  pagoda(ctx, 1070, 356, '#3a1844');
  ridge(ctx, [[0, 470], [120, 452], [260, 466], [400, 448], [560, 470], [720, 455], [880, 470], [1040, 450], [1180, 466], [1280, 455]], '#2b1236');

  // Cherry blossom tree, left.
  ctx.strokeStyle = '#1d0c1f';
  ctx.lineCap = 'round';
  const branch = (x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, w: number) => {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cx, cy, x1, y1);
    ctx.stroke();
  };
  branch(150, FLOOR, 120, 420, 190, 300, 22);
  branch(185, 320, 240, 280, 320, 250, 10);
  branch(175, 360, 110, 320, 60, 270, 9);
  branch(190, 300, 200, 240, 170, 190, 8);
  const blossoms: Array<[number, number, number]> = [
    [320, 250, 60], [60, 270, 55], [170, 190, 65], [250, 220, 50], [110, 220, 50], [210, 280, 45],
  ];
  const pinks = ['#ff9ec4', '#ffc4dc', '#e86a9a', '#ffd6e6'];
  for (const [bx, by, r] of blossoms) {
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * r;
      ctx.globalAlpha = 0.55 + rand() * 0.35;
      ctx.fillStyle = pinks[Math.floor(rand() * pinks.length)];
      ctx.beginPath();
      ctx.arc(bx + Math.cos(a) * d, by + Math.sin(a) * d * 0.7, 8 + rand() * 12, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // Wooden railing at the back of the stage.
  ctx.fillStyle = '#3b1a1a';
  ctx.fillRect(0, FLOOR - 40, W, 7);
  ctx.fillRect(0, FLOOR - 20, W, 5);
  for (let x = 20; x < W; x += 140) ctx.fillRect(x, FLOOR - 46, 10, 46);
  ctx.fillStyle = 'rgba(255, 170, 120, 0.35)';
  ctx.fillRect(0, FLOOR - 40, W, 2);

  stoneLantern(ctx, 330, FLOOR);
  stoneLantern(ctx, 1190, FLOOR);

  // Floor: polished wood planks in perspective.
  const fg = ctx.createLinearGradient(0, FLOOR, 0, H);
  fg.addColorStop(0, '#8a5236');
  fg.addColorStop(0.5, '#6a3a26');
  fg.addColorStop(1, '#3a1d14');
  ctx.fillStyle = fg;
  ctx.fillRect(0, FLOOR, W, H - FLOOR);

  ctx.strokeStyle = 'rgba(30, 12, 8, 0.45)';
  ctx.lineWidth = 2;
  const VX = W / 2;
  const VY = 140;
  const t = (FLOOR - VY) / (H - VY);
  for (let i = -16; i <= 16; i++) {
    const bx = VX + i * 110;
    ctx.beginPath();
    ctx.moveTo(VX + (bx - VX) * t, FLOOR);
    ctx.lineTo(bx, H);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(30, 12, 8, 0.28)';
  for (const y of [560, 576, 598, 626, 662, 708]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // Sun reflection on the floor.
  const refl = ctx.createRadialGradient(SX, 610, 10, SX, 610, 380);
  refl.addColorStop(0, 'rgba(255, 190, 120, 0.3)');
  refl.addColorStop(1, 'rgba(255, 190, 120, 0)');
  ctx.fillStyle = refl;
  ctx.fillRect(0, FLOOR, W, H - FLOOR);

  // Painted ring on the floor.
  ctx.strokeStyle = 'rgba(255, 225, 190, 0.16)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(W / 2, 642, 330, 40, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 200, 150, 0.3)';
  ctx.fillRect(0, FLOOR, W, 3);

  // Vignette.
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vg.addColorStop(1, 'rgba(8, 4, 16, 0.6)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  tex.refresh();
}

/** Small generated textures used by particles and glows. */
export function createFxTextures(scene: Phaser.Scene): void {
  const canvas = (key: string, w: number, h: number, paint: (c: CanvasRenderingContext2D) => void) => {
    if (scene.textures.exists(key)) return;
    const t = scene.textures.createCanvas(key, w, h);
    if (!t) return;
    paint(t.getContext());
    t.refresh();
  };

  canvas('glow', 64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255, 255, 255, 1)');
    g.addColorStop(0.35, 'rgba(255, 255, 255, 0.6)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });

  canvas('petal', 14, 9, (c) => {
    c.fillStyle = '#ffb7d0';
    c.beginPath();
    c.ellipse(7, 4.5, 6.5, 4, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ff8fb6';
    c.beginPath();
    c.ellipse(9, 4.5, 3, 2, 0, 0, Math.PI * 2);
    c.fill();
  });

  canvas('dust', 32, 32, (c) => {
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(235, 215, 195, 0.9)');
    g.addColorStop(1, 'rgba(235, 215, 195, 0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 32, 32);
  });
}

/** Adds the stage background, lantern glow and falling petals to a scene. */
export class Arena {
  constructor(scene: Phaser.Scene, layer?: Phaser.GameObjects.Layer) {
    const track = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      layer?.add(o);
      return o;
    };
    track(scene.add.image(0, 0, ARENA_KEY).setOrigin(0).setScale(1 / ARENA_RES).setDepth(DEPTH.bg));

    for (const [x, y] of [
      [330, 474],
      [1190, 474],
    ] as const) {
      const glow = track(scene.add.image(x, y, 'glow'))
        .setTint(0xffa040)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(2.6)
        .setAlpha(0.55)
        .setDepth(DEPTH.bg);
      scene.tweens.add({
        targets: glow,
        alpha: 0.35,
        duration: 700 + Math.random() * 500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    track(
      scene.add.particles(0, 0, 'petal', {
        x: { min: -100, max: GAME_WIDTH + 250 },
        y: -20,
        lifespan: 14000,
        speedX: { min: -70, max: -25 },
        speedY: { min: 30, max: 70 },
        rotate: { start: 0, end: 540 },
        scale: { min: 0.7, max: 1.3 },
        alpha: { min: 0.6, max: 0.95 },
        frequency: 420,
        quantity: 1,
      }),
    )
      .setDepth(DEPTH.petals)
      .fastForward(10000);
  }
}
