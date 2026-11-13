// Energy meter and specials (L): costs, refusal, gains, Fireball and Shadow Dash rules.
import { Suite, blockAdvantage, fightState, openGame, place, setCpu, setCpuFn, startFight, tap, wait } from './harness.mjs';

export async function run(browser, url) {
  const t = new Suite('specials');

  // ---------------------------------------------------------------- Kaen: Fireball
  let page = await openGame(browser, url, t);
  await startFight(page, { player: 'kaen' });

  await place(page, 600, 900, 30, 0);
  await wait(page, 150);
  await tap(page, 'l', 120);
  let s = await fightState(page);
  const denied = await page.evaluate(() => window.game.scene.getScene('FightScene').hud.energyBars[0].denied > 0);
  t.check('Special refused with 30 energy (HUD shows NEED ENERGY)', s.p1 !== 'attack' && s.e1 === 30 && s.proj === 0 && denied, `${s.p1}, energy ${s.e1}`);

  await place(page, 600, 712);
  await wait(page, 150);
  await tap(page, 'j', 110);
  await tap(page, 'j', 110);
  await tap(page, 'k', 900);
  s = await fightState(page);
  t.check('J, J, K combo earns 19 energy (4 + 6 + 9)', s.e1 === 19, `energy ${s.e1}`);

  await place(page, 600, 712);
  await setCpu(page, 'block');
  await wait(page, 250);
  await tap(page, 'j', 500);
  s = await fightState(page);
  t.check('Blocked jab: attacker +1.6, defender +4', s.e1 === 1.6 && s.e2 === 4, `${s.e1} / ${s.e2}`);

  await place(page, 500, 900, 100, 0);
  await wait(page, 150);
  await tap(page, 'l', 1400);
  s = await fightState(page);
  const fb = s.hits.filter((h) => h.move === 'fireball');
  t.check('Fireball costs exactly 50 energy', s.e1 === 50, `energy ${s.e1}`);
  t.check('Fireball hits once for 10 and is removed', fb.length === 1 && fb[0].proj && s.hp2 === 90 && s.proj === 0, `hits ${fb.length}, hp ${s.hp2}, live ${s.proj}`);

  await place(page, 500, 900, 50, 0);
  await setCpu(page, 'block');
  await wait(page, 200);
  await tap(page, 'l', 1300);
  s = await fightState(page);
  t.check('Blocked Fireball: no damage, blocker +4 energy', s.hp2 === 100 && s.hits.some((h) => h.move === 'fireball' && h.blocked) && s.e2 === 4, `hp ${s.hp2}, e2 ${s.e2}`);

  await place(page, 400, 760, 50, 0);
  await setCpuFn(page, `const pr = s.combat.projectiles.find((p) => p.alive);
    return { up: !!pr && Math.abs(pr.x - s.p2.x) < 185 && s.p2.grounded };`);
  await wait(page, 150);
  await tap(page, 'l', 2600);
  s = await fightState(page);
  t.check('A well-timed jump clears the Fireball', s.hp2 === 100 && !s.hits.some((h) => h.move === 'fireball'), `hp ${s.hp2}`);
  t.check('A missed Fireball leaves the stage and is removed', s.proj === 0, `live ${s.proj}`);

  await place(page, 600, 712, 50, 0);
  await wait(page, 150);
  await tap(page, 'j', 70);
  await tap(page, 'l', 1300);
  s = await fightState(page);
  t.check('Jab cancels into Fireball on hit', s.hits.map((h) => h.move).join('>') === 'jab>fireball', s.hits.map((h) => h.move).join('>'));

  await place(page, 600, 700, 50, 0);
  await setCpu(page, 'block');
  await wait(page, 200);
  await page.evaluate(() => {
    window.game.scene.getScene('FightScene').__trace = [];
  });
  await tap(page, 'l', 1200);
  let adv = await blockAdvantage(page);
  t.check('Point-blank blocked Fireball is punishable', adv < 0, `${adv} frames`);
  await page.close();

  // ---------------------------------------------------------------- Yoru: Shadow Dash
  page = await openGame(browser, url, t);
  await startFight(page, { player: 'yoru' });

  await place(page, 400, 640, 100, 0);
  await wait(page, 150);
  await tap(page, 'l', 1000);
  s = await fightState(page);
  const dash = s.hits.filter((h) => h.move === 'shadowDash');
  t.check('Shadow Dash costs exactly 50 energy', s.e1 === 50, `energy ${s.e1}`);
  t.check('Shadow Dash closes 240 px and hits once for 11', dash.length === 1 && s.hp2 === 89, `hits ${dash.length}, hp ${s.hp2}`);

  await place(page, 400, 640, 50, 0);
  await setCpu(page, 'block');
  await wait(page, 200);
  await page.evaluate(() => {
    window.game.scene.getScene('FightScene').__trace = [];
  });
  await tap(page, 'l', 1300);
  adv = await blockAdvantage(page);
  s = await fightState(page);
  t.check('Blocked Shadow Dash is punishable', s.hp2 === 100 && adv < -5, `${adv} frames`);

  await place(page, 300, 800, 50, 0);
  await wait(page, 150);
  await tap(page, 'l', 1000);
  s = await fightState(page);
  t.check('Shadow Dash travels ~180 px and whiffs from 500 px away', s.hp2 === 100 && s.x1 - 300 > 160 && s.x1 - 300 < 200, `travelled ${s.x1 - 300}px`);

  await page.close();
  return t;
}
