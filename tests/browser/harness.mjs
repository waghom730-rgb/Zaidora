// Shared helpers for the real-browser regression suites (`npm run test:browser`).
// These drive the actual game in Chrome — rendering, scenes, input and timing included —
// complementing the headless vitest simulation in tests/*.test.ts.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Starts a Vite dev server for the game, unless BASE_URL already points at a running one. */
export async function startServer() {
  if (process.env.BASE_URL) return { url: process.env.BASE_URL, close: async () => {} };
  const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5190, strictPort: false } });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('Vite did not report a local URL');
  return { url, close: () => server.close() };
}

/** Headless Chrome with software WebGL (works without a GPU). Set CHROME_PATH to override. */
export function launchBrowser() {
  const opts = {
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'],
  };
  if (process.env.CHROME_PATH) opts.executablePath = process.env.CHROME_PATH;
  else opts.channel = 'chrome';
  return chromium.launch(opts);
}

export class Suite {
  constructor(name) {
    this.name = name;
    this.passed = 0;
    this.failed = 0;
    this.pageErrors = [];
  }

  check(label, ok, detail = '') {
    if (ok) this.passed++;
    else this.failed++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  }
}

/** Opens the game and waits for the main menu. Page errors are collected into the suite. */
export async function openGame(browser, url, suite) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => suite.pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') suite.pageErrors.push(m.text());
  });
  await page.goto(url);
  await page.waitForFunction(() => window.game?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.waitForTimeout(500);
  return page;
}

export const wait = (page, ms) => page.waitForTimeout(ms);

export async function tap(page, key, gapMs = 0) {
  await page.keyboard.down(key);
  await page.waitForTimeout(35);
  await page.keyboard.up(key);
  if (gapMs) await page.waitForTimeout(gapMs);
}

export const activeScenes = (page) => page.evaluate(() => window.game.scene.getScenes(true).map((s) => s.scene.key));

export function waitForFight(page, round) {
  return page.waitForFunction(
    (r) => {
      const s = window.game.scene.getScene('FightScene');
      return !!s && s.sys.isActive() && s.phase === 'fight' && (r === null || s.round === r);
    },
    round ?? null,
    { timeout: 30000 },
  );
}

/** Skips the menus: starts a fight directly, waits for "FIGHT!", installs test hooks. */
export async function startFight(page, { player = 'kaen', difficulty = 'normal' } = {}) {
  await page.evaluate(
    ([p, d]) => window.game.scene.getScene('MenuScene').scene.start('FightScene', { difficulty: d, player: p }),
    [player, difficulty],
  );
  await waitForFight(page);
  await installHooks(page);
}

/**
 * Test hooks inside FightScene:
 *   s.__cpu()  — the CPU's input each step (default: stand still). Change with setCpu/setCpuFn.
 *   s.__hits   — every hit, summarised.
 *   s.__trace  — per step: [p1 state, p1 move, p2 state, live projectiles] (last 400 steps).
 * Also stops the clock so tests don't time out a round by accident.
 */
export async function installHooks(page) {
  await page.evaluate(() => {
    const s = window.game.scene.getScene('FightScene');
    if (s.__hooked) return;
    s.__hooked = true;
    const idle = { left: false, right: false, up: false, block: false, punch: false, kick: false, heavy: false, special: false, dash: false };
    s.__idle = idle;
    s.__cpu = () => idle;
    s.ai.getInput = () => s.__cpu();
    s.__hits = [];
    const onHit = s.onHit.bind(s);
    s.onHit = (h) => {
      s.__hits.push({ by: h.attacker.def.id, move: h.move.id, blocked: h.blocked, parried: !!h.parried, dmg: h.damage, proj: h.projectile });
      onHit(h);
    };
    s.__trace = [];
    const step = s.step.bind(s);
    s.step = () => {
      step();
      s.__trace.push([s.p1.state, s.p1.move?.id ?? '', s.p2.state, s.combat.projectiles.filter((p) => p.alive).length]);
      if (s.__trace.length > 400) s.__trace.shift();
    };
    s.timeLeft = 99;
  });
}

/** CPU stands still ('idle') or holds block ('block'). */
export const setCpu = (page, mode) =>
  page.evaluate((m) => {
    const s = window.game.scene.getScene('FightScene');
    s.__cpu = m === 'block' ? () => ({ ...s.__idle, block: true }) : () => s.__idle;
  }, mode);

/** CPU input from a function body with `s` (the FightScene) in scope, returning a FighterInput. */
export const setCpuFn = (page, body) =>
  page.evaluate((b) => {
    const s = window.game.scene.getScene('FightScene');
    const fn = new Function('s', b);
    s.__cpu = () => ({ ...s.__idle, ...fn(s) });
  }, body);

/** Resets both fighters onto the floor at x1/x2 with full health, the given energy, no projectiles. */
export const place = (page, x1, x2, e1 = 0, e2 = 0) =>
  page.evaluate(
    ([x1, x2, e1, e2]) => {
      const s = window.game.scene.getScene('FightScene');
      for (const [f, x, e] of [
        [s.p1, x1, e1],
        [s.p2, x2, e2],
      ]) {
        f.x = x;
        f.y = 640;
        f.vx = 0;
        f.vy = 0;
        f.grounded = true;
        f.hp = 100;
        f.setState('idle');
        s.energy.add(f, -999);
        s.energy.add(f, e);
      }
      s.combat.clearProjectiles();
      s.hud.resetHealth();
      s.r1.snap();
      s.r2.snap();
      s.__hits = [];
      s.__trace = [];
      s.__cpu = () => s.__idle;
    },
    [x1, x2, e1, e2],
  );

export const fightState = (page) =>
  page.evaluate(() => {
    const s = window.game.scene.getScene('FightScene');
    const r = (n) => Math.round(n * 10) / 10;
    return {
      phase: s.phase,
      round: s.round,
      wins: [...s.wins],
      p1: s.p1.state,
      p1name: s.p1.def.name,
      p1move: s.p1.move?.id ?? null,
      p2: s.p2.state,
      p2name: s.p2.def.name,
      hp1: s.p1.hp,
      hp2: s.p2.hp,
      e1: r(s.energy.get(s.p1)),
      e2: r(s.energy.get(s.p2)),
      x1: Math.round(s.p1.x),
      x2: Math.round(s.p2.x),
      proj: s.combat.projectiles.filter((p) => p.alive).length,
      hits: s.__hits ?? [],
    };
  });

/**
 * After a blocked attack: frames between the attacker becoming free and the defender leaving
 * blockstun. Negative means the attacker recovers later — the move is punishable.
 */
export const blockAdvantage = (page) =>
  page.evaluate(() => {
    const t = window.game.scene.getScene('FightScene').__trace;
    const p1Free = t.findIndex((row, i) => i > 0 && t[i - 1][0] === 'attack' && row[0] !== 'attack');
    const p2Free = t.findIndex((row, i) => i > 0 && t[i - 1][2] === 'blockstun' && row[2] !== 'blockstun');
    return p2Free - p1Free;
  });
