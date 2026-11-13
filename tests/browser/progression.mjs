// Progression and saving in the real game: Arcade Ladder + checkpoints, rewards, Dojo
// purchases, consumables, profile/habits — as a guest, and (when TEST_MONGODB_URI is set)
// with a real account whose data is checked directly in MongoDB.
import { Suite, activeScenes, openGame, tap, wait, waitForFight } from './harness.mjs';

const save = (page) => page.evaluate(() => window.zaikora.profile.save);
const scene = (page, key) => page.evaluate((k) => window.game.scene.isActive(k), key);

/** Ends the current match immediately with the given outcome and waits until it's saved. */
async function forceMatch(page, outcome) {
  await page.evaluate((o) => {
    const s = window.game.scene.getScene('FightScene');
    s.ai.getInput = () => ({ left: false, right: false, up: false, block: false, punch: false, kick: false, heavy: false, special: false, dash: false });
    s.wins = o === 'win' ? [1, 0] : [0, 1];
    (o === 'win' ? s.p2 : s.p1).hp = 0;
    s.endRound('ko');
  }, outcome);
  await page.waitForFunction(() => window.game.scene.isActive('ResultScene') && window.game.scene.getScene('ResultScene').saved, null, { timeout: 30000 });
  await wait(page, 400);
  return page.evaluate(() => window.game.scene.getScene('ResultScene').rewardText.text);
}

export async function run(browser, url, server) {
  const t = new Suite('progression');

  // ---------------------------------------------------------------- guest: ladder
  let page = await openGame(browser, url, t);
  const menuText = await page.evaluate(() => window.game.scene.getScene('MenuScene').items[0].text);
  t.check('Menu offers the Arcade Ladder at stage 1', menuText.includes('STAGE 1/10'), menuText);

  await tap(page, 'Enter', 700); // Arcade Ladder
  await tap(page, 'Enter'); // fight as Kaen
  await waitForFight(page);
  const sub = await page.evaluate(() => window.game.scene.getScene('FightScene').hud.subtitle.text);
  t.check('Ladder fight shows its stage in the HUD', sub.startsWith('STAGE 1/10'), sub);

  let rewards = await forceMatch(page, 'win');
  let s = await save(page);
  t.check('Winning stage 1 advances the ladder', s.ladder.stage === 1, `stage ${s.ladder.stage + 1}`);
  t.check('Rewards are shown and kept (coins + XP)', s.coins > 0 && s.xp > 0 && /\+\d+ coins/.test(rewards), rewards.split('\n')[0]);

  await tap(page, 'Enter'); // next stage
  await page.waitForFunction(() => window.game.scene.isActive('VersusScene'), null, { timeout: 30000 });
  const vsLine = await page.evaluate(() => window.game.scene.getScene('VersusScene').line);
  t.check('Next ladder stage is introduced on the VS screen', vsLine.includes('STAGE 2/'), vsLine);
  await waitForFight(page);
  rewards = await forceMatch(page, 'lose');
  s = await save(page);
  const ladderLine = await page.evaluate(() => window.game.scene.getScene('ResultScene').ladderLine.text);
  t.check('Losing sends you back to your checkpoint', s.ladder.stage === 0 && ladderLine.includes('CHECKPOINT'), ladderLine);
  t.check('Habits recorded: 2 matches, 1 win, moves/time tracked', s.stats.matches === 2 && s.stats.wins === 1 && s.stats.sessions >= 1);

  // ---------------------------------------------------------------- guest: dojo
  await page.evaluate(() => {
    window.zaikora.profile.save.coins = 500;
  });
  await tap(page, 'd', 700); // Dojo
  t.check('D on the results screen opens the Dojo', await scene(page, 'DojoScene'));
  await tap(page, 'Enter', 300); // buy Vitality (first upgrade)
  s = await save(page);
  t.check('Buying an upgrade spends coins and raises its level', s.upgrades.vitality === 1 && s.coins === 440, `vitality ${s.upgrades.vitality}, coins ${s.coins}`);
  await tap(page, 'd', 150);
  await tap(page, 'd', 150); // ITEMS tab
  await tap(page, 'Enter', 300); // buy Energy Tonic
  await tap(page, 'u', 300); // use it for the next match
  s = await save(page);
  t.check('Items: buy an Energy Tonic and ready it for the next match', s.inventory.energyTonic === 1 && s.queued.includes('energyTonic'), `stock ${s.inventory.energyTonic}, queued ${s.queued}`);

  await tap(page, 'Escape', 700);
  await page.evaluate(() => window.game.scene.getScene('MenuScene').scene.start('FightScene', { mode: 'versus', player: 'kaen', difficulty: 'easy' }));
  await waitForFight(page);
  const fight = await page.evaluate(() => {
    const f = window.game.scene.getScene('FightScene');
    return { maxHp: f.p1.mods.maxHp, hp: f.p1.hp, energy: f.energy.get(f.p1) };
  });
  t.check('Upgrades and items change the fight (Vitality HP, Tonic energy)', fight.maxHp === 106 && fight.hp === 106 && fight.energy >= 50, JSON.stringify(fight));
  await forceMatch(page, 'win');
  s = await save(page);
  t.check('The consumable is used up by the match', s.queued.length === 0, String(s.queued));

  await tap(page, 'Escape', 700);
  await page.evaluate(() => window.game.scene.getScene('MenuScene').scene.start('ProfileScene'));
  await wait(page, 600);
  const profileText = await page.evaluate(() =>
    window.game.scene.getScene('ProfileScene').children.list.filter((o) => o.type === 'Text').map((o) => o.text).join('\n'),
  );
  t.check('Profile shows progress and habits', profileText.includes('Matches 3') && profileText.includes('Favourite fighter: KAEN'));
  await page.close();

  // ---------------------------------------------------------------- account (real server + MongoDB)
  if (!server.api) {
    console.log('  skip  account tests (set TEST_MONGODB_URI to run them against a real MongoDB)');
    return t;
  }
  const { MongoClient } = await import('mongodb');
  const mongo = await new MongoClient(server.mongo.uri).connect();
  const db = mongo.db(server.mongo.db);
  const user = `tester${Date.now() % 100000}`;

  page = await openGame(browser, url, t, { guest: false });
  t.check('Without a login the account screen appears', await scene(page, 'AccountScene'));
  await page.waitForFunction(() => document.querySelector('#acct-srv')?.textContent?.includes('online'), null, { timeout: 15000 });
  await page.fill('#acct-user', user);
  await page.fill('#acct-pass', 'pass1234');
  await page.click('#acct-register');
  await page.waitForFunction(() => window.game.scene.isActive('MenuScene'), null, { timeout: 15000 });
  const badge = await page.evaluate(() => window.zaikora.profile.username);
  t.check('Creating an account logs you in', badge === user, badge);
  const player = await db.collection('players').findOne({ usernameLower: user.toLowerCase() });
  t.check('Account stored in MongoDB with a hashed password', !!player && player.passwordHash.startsWith('scrypt$') && !JSON.stringify(player).includes('pass1234'));

  await tap(page, 'Enter', 700);
  await tap(page, 'Enter');
  await waitForFight(page);
  await forceMatch(page, 'win');
  await wait(page, 300);
  const dbSave = await db.collection('saves').findOne({ _id: player._id });
  const matches = await db.collection('matches').countDocuments({ playerId: player._id });
  t.check('Match result saved to MongoDB (ladder, coins, habits)', dbSave?.ladder.stage === 1 && dbSave.coins > 0 && dbSave.stats.matches === 1 && matches === 1, `stage ${dbSave?.ladder.stage}, coins ${dbSave?.coins}, matches ${matches}`);
  t.check('Play session recorded', (await db.collection('playSessions').countDocuments({ playerId: player._id })) >= 1);

  await page.reload();
  await page.waitForFunction(() => window.game?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  s = await save(page);
  t.check('Reloading keeps you logged in with your progress', s.ladder.stage === 1 && (await page.evaluate(() => window.zaikora.profile.online)));

  await page.evaluate(() => {
    const m = window.game.scene.getScene('MenuScene');
    m.activate('logout');
  });
  await page.waitForFunction(() => window.game.scene.isActive('AccountScene'), null, { timeout: 15000 });
  await page.fill('#acct-user', user);
  await page.fill('#acct-pass', 'wrongpass');
  await page.click('#acct-login');
  await page.waitForFunction(() => /Wrong/.test(document.querySelector('#acct-msg')?.textContent ?? ''), null, { timeout: 10000 });
  t.check('Wrong password is refused', (await activeScenes(page)).includes('AccountScene'));
  await page.fill('#acct-pass', 'pass1234');
  await page.click('#acct-login');
  await page.waitForFunction(() => window.game.scene.isActive('MenuScene'), null, { timeout: 15000 });
  s = await save(page);
  t.check('Logging back in restores the saved progress', s.ladder.stage === 1 && s.stats.matches === 1);

  await mongo.close();
  await page.close();
  return t;
}
