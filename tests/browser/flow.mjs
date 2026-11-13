// Full player journey with real key presses: menu → select → fight (combo, heavy, dash,
// evade, time-over, KO rounds) → results → change fighter → menu.
import { Suite, activeScenes, fightState, installHooks, openGame, place, tap, wait, waitForFight } from './harness.mjs';

export async function run(browser, url) {
  const t = new Suite('flow');
  const page = await openGame(browser, url, t);

  await tap(page, 's', 150); // VERSUS CPU
  await tap(page, 'Enter', 700);
  t.check('Menu → Versus → character select', (await activeScenes(page)).includes('CharacterSelectScene'));

  await tap(page, 'd', 150);
  await tap(page, 'Enter');
  await waitForFight(page);
  await installHooks(page);
  let s = await fightState(page);
  t.check('Picking Yoru starts Yoru vs Kaen', s.p1name === 'YORU' && s.p2name === 'KAEN', `${s.p1name} vs ${s.p2name}`);

  // Walk in with the real key, then J, J, K.
  await page.keyboard.down('d');
  for (let i = 0; i < 60 && Math.abs(s.x2 - s.x1) >= 115; i++) {
    await wait(page, 40);
    s = await fightState(page);
  }
  await page.keyboard.up('d');
  await tap(page, 'j', 110);
  await tap(page, 'j', 110);
  await tap(page, 'k', 900);
  s = await fightState(page);
  const route = s.hits.map((h) => h.move).join('>');
  const dmg = s.hits.reduce((n, h) => n + h.dmg, 0);
  t.check('J, J, K combo: jab > cross > roundhouse for 26', route === 'jab>cross>roundhouse' && dmg === 26, `${route} = ${dmg}`);

  // U = character heavy.
  await place(page, 600, 700);
  await wait(page, 150);
  await tap(page, 'u', 80);
  s = await fightState(page);
  t.check('U starts the character heavy (Shadow Slash)', s.p1move === 'shadowSlash', String(s.p1move));
  await wait(page, 700);

  // Space + forward = dash.
  await place(page, 400, 900);
  await wait(page, 150);
  await page.keyboard.down('d');
  await tap(page, 'Space', 250);
  await page.keyboard.up('d');
  await wait(page, 200);
  s = await fightState(page);
  const dashed = await page.evaluate(() => window.game.scene.getScene('FightScene').__trace.some((r) => r[0] === 'dash'));
  t.check('Space + D dashes forward', dashed && s.x1 - 400 > 80, `moved ${s.x1 - 400}px`);

  // Space alone = evade (backstep).
  await place(page, 600, 900);
  await wait(page, 150);
  await tap(page, 'Space', 450);
  s = await fightState(page);
  const evaded = await page.evaluate(() => window.game.scene.getScene('FightScene').__trace.some((r) => r[0] === 'backdash'));
  t.check('Space alone evades backwards', evaded && s.x1 < 600, `x ${s.x1}`);

  // Time-over with the CPU ahead: player slumps, CPU celebrates.
  await place(page, 440, 840);
  await page.evaluate(() => {
    const sc = window.game.scene.getScene('FightScene');
    sc.p1.hp = 30;
    sc.timeLeft = 1;
  });
  await page.waitForFunction(() => window.game.scene.getScene('FightScene').phase === 'roundEnd', null, { timeout: 8000 });
  await wait(page, 1800);
  s = await fightState(page);
  t.check('Time-over: loser slumps, winner celebrates, CPU gets the round', s.p1 === 'lose' && s.p2 === 'victory' && s.wins.join() === '0,1', `${s.p1}/${s.p2} ${s.wins}`);

  // Rounds 2 and 3 by KO.
  for (const round of [2, 3]) {
    await waitForFight(page, round);
    await place(page, 600, 710);
    await page.evaluate(() => {
      window.game.scene.getScene('FightScene').p2.hp = 4;
    });
    await wait(page, 80);
    await tap(page, 'j');
    await page.waitForFunction(() => window.game.scene.getScene('FightScene').phase !== 'fight', null, { timeout: 8000 });
  }
  s = await fightState(page);
  t.check('Two KOs win the match 2–1', s.wins.join() === '2,1', String(s.wins));
  await page.waitForFunction(() => window.game.scene.isActive('ResultScene'), null, { timeout: 30000 });
  const outcome = await page.evaluate(() => window.game.scene.getScene('ResultScene').result.outcome);
  t.check('Results screen shows a win', outcome === 'win', outcome);

  await wait(page, 600);
  await tap(page, 'c', 900);
  const sel = await page.evaluate(() => window.game.scene.getScene('CharacterSelectScene')?.selected);
  t.check('C → character select with Yoru still chosen', (await activeScenes(page)).includes('CharacterSelectScene') && sel === 1);

  await tap(page, 'Escape', 800);
  t.check('Esc → main menu', (await activeScenes(page)).includes('MenuScene'));

  await page.close();
  return t;
}
