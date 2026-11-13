// Scene cleanup and match edge cases: repeated rematches, listeners, pause, draws, focus loss.
import { Suite, openGame, startFight, tap, wait, waitForFight } from './harness.mjs';

export async function run(browser, url) {
  const t = new Suite('stability');
  const page = await openGame(browser, url, t);

  const probe = () =>
    page.evaluate(() => {
      const s = window.game.scene.getScene('FightScene');
      const kb = s.input.keyboard;
      return {
        sceneKeydown: kb.listenerCount('keydown'),
        keyListeners: kb.keys.filter(Boolean).reduce((n, k) => n + k.listenerCount('down'), 0),
        objects: s.children.list.length,
        projectiles: s.combat.projectiles.length,
        textures: Object.keys(window.game.textures.list).length,
        energy: [s.energy.get(s.p1), s.energy.get(s.p2)],
        heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1,
      };
    });

  // Seven matches in a row, alternating Rematch and Change fighter, each ended with a
  // fireball in flight and energy in the bar.
  await startFight(page, { player: 'kaen', difficulty: 'hard' });
  const first = await probe();
  const heap = [first.heapMB];
  let last = first;
  for (let i = 2; i <= 7; i++) {
    await page.evaluate(() => {
      const s = window.game.scene.getScene('FightScene');
      s.energy.add(s.p1, 100);
      s.wins = [1, 0];
      s.p1.x = 500;
      s.p2.x = 900;
    });
    await tap(page, 'l', 300);
    await page.evaluate(() => {
      const s = window.game.scene.getScene('FightScene');
      s.p2.hp = 0;
      s.endRound('ko');
    });
    await page.waitForFunction(() => window.game.scene.isActive('ResultScene'), null, { timeout: 30000 });
    await wait(page, 500);
    if (i % 2) {
      await tap(page, 'c', 900);
      await tap(page, 'd', 200);
      await tap(page, 'Enter');
    } else {
      await tap(page, 'Enter');
    }
    await waitForFight(page);
    last = await probe();
    heap.push(last.heapMB);
  }
  t.check('No duplicate scene key listeners after 6 rematches', last.sceneKeydown === first.sceneKeydown, `${first.sceneKeydown} → ${last.sceneKeydown}`);
  t.check('No accumulating per-key listeners', last.keyListeners === first.keyListeners, `${first.keyListeners} → ${last.keyListeners}`);
  t.check('No leftover projectiles in a new match', last.projectiles === 0);
  t.check('Energy starts at 0 in a new match', last.energy.join() === '0,0', last.energy.join());
  t.check('Scene object count stable', Math.abs(last.objects - first.objects) <= 2, `${first.objects} → ${last.objects}`);
  t.check('No textures re-created per match', last.textures === first.textures, `${first.textures} → ${last.textures}`);
  console.log(`  info  heap MB per match: ${heap.join(', ')}`);

  // Pause.
  await page.keyboard.press('Escape');
  await wait(page, 200);
  t.check('Esc pauses (exactly one toggle)', await page.evaluate(() => window.game.scene.getScene('FightScene').paused));
  const time = () => page.evaluate(() => window.game.scene.getScene('FightScene').timeLeft);
  const t0 = await time();
  await wait(page, 2200);
  const t1 = await time();
  t.check('Timer frozen while paused', t0 === t1, `${t0} → ${t1}`);
  await page.keyboard.press('Escape');
  await wait(page, 1300);
  const t2 = await time();
  t.check('Timer resumes after unpausing', t2 < t1, `${t1} → ${t2}`);

  // Losing window focus while holding a direction must not leave the key stuck.
  await page.keyboard.down('d');
  await wait(page, 200);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await wait(page, 100);
  const stuck = await page.evaluate(() => window.game.scene.getScene('FightScene').controls.keys.right[0].isDown);
  await page.keyboard.up('d');
  t.check('Window blur releases held keys', stuck === false);

  // Regression: two key events in one frame used to deliver the second one twice, so Esc
  // paused and instantly unpaused. Release a direction and press Esc back-to-back.
  await page.keyboard.down('a');
  await wait(page, 150);
  await page.keyboard.up('a');
  await page.keyboard.press('Escape');
  await wait(page, 200);
  t.check('Esc pressed while releasing a direction pauses once', await page.evaluate(() => window.game.scene.getScene('FightScene').paused));
  await page.keyboard.press('Escape');
  await wait(page, 200);

  await page.keyboard.press('Escape');
  await wait(page, 150);
  await page.keyboard.press('q');
  await wait(page, 800);
  t.check('Q from pause returns to the menu', await page.evaluate(() => window.game.scene.isActive('MenuScene')));

  // Draws: double KO, equal health at time-over, 2–2 result.
  await startFight(page, { player: 'yoru' });
  await page.evaluate(() => {
    const s = window.game.scene.getScene('FightScene');
    s.p1.hp = 0;
    s.p2.hp = 0;
    s.endRound('ko');
  });
  let r = await page.evaluate(() => {
    const s = window.game.scene.getScene('FightScene');
    return { wins: s.wins.join(), winner: s.roundWinner };
  });
  t.check('Double KO is a drawn round (both score)', r.wins === '1,1' && r.winner === null, r.wins);
  await waitForFight(page, 2);
  await page.evaluate(() => {
    const s = window.game.scene.getScene('FightScene');
    s.p1.hp = 55;
    s.p2.hp = 55;
    s.timeLeft = 1;
  });
  await page.waitForFunction(() => window.game.scene.getScene('FightScene').phase === 'roundEnd', null, { timeout: 8000 });
  r = await page.evaluate(() => window.game.scene.getScene('FightScene').wins.join());
  t.check('Equal health at time-over is a drawn round', r === '2,2', r);
  await page.waitForFunction(() => window.game.scene.isActive('ResultScene'), null, { timeout: 30000 });
  const outcome = await page.evaluate(() => window.game.scene.getScene('ResultScene').result.outcome);
  t.check('A 2–2 match ends as a DRAW', outcome === 'draw', outcome);

  await page.close();
  return t;
}
