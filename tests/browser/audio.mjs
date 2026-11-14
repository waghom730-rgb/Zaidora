// Audio in the real game: autoplay unlock, scene music, combat sounds, duplicate protection,
// pause, cleanup when a scene ends, settings and their persistence, hidden tabs, asset fallback,
// repeated matches, and offline-rendered levels.
import { Suite, installHooks, openGame, tap, wait, waitForFight } from './harness.mjs';

const dbg = (page) => page.evaluate(() => window.zaikora.audio.debug());
const sceneActive = (page, key) => page.waitForFunction((k) => window.game.scene.isActive(k), key, { timeout: 30000 });

/** Output level at the master bus over about a second (an analyser tapped onto it). */
const level = (page) =>
  page.evaluate(async () => {
    const a = window.zaikora.audio;
    const an = a.ctx.createAnalyser();
    an.fftSize = 2048;
    a.master.connect(an);
    const buf = new Float32Array(an.fftSize);
    let peak = 0;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 50));
      an.getFloatTimeDomainData(buf);
      for (const v of buf) {
        peak = Math.max(peak, Math.abs(v));
        sum += v * v;
        n++;
      }
    }
    a.master.disconnect(an);
    return { peak: +peak.toFixed(4), rms: +Math.sqrt(sum / n).toFixed(4) };
  });

/** Ends the current match at once with the given result for the player. */
const endMatch = (page, win) =>
  page.evaluate((w) => {
    const s = window.game.scene.getScene('FightScene');
    s.wins = w ? [1, 0] : [0, 1];
    (w ? s.p2 : s.p1).hp = 0;
    s.endRound('ko');
  }, win);

export async function run(browser, url) {
  const t = new Suite('audio');
  const page = await openGame(browser, url, t);

  // Asset overrides, set before the first key press (effects load with the pre-render): a real
  // 0.25 s recording for one effect, missing files for another effect and for a track.
  await page.evaluate(async () => {
    const m = await import('/src/systems/AudioManager.ts');
    const sr = 22050;
    const n = Math.round(sr * 0.25);
    const dv = new DataView(new ArrayBuffer(44 + n * 2));
    const w = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF');
    dv.setUint32(4, 36 + n * 2, true);
    w(8, 'WAVEfmt ');
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);
    dv.setUint16(22, 1, true);
    dv.setUint32(24, sr, true);
    dv.setUint32(28, sr * 2, true);
    dv.setUint16(32, 2, true);
    dv.setUint16(34, 16, true);
    w(36, 'data');
    dv.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.sin((2 * Math.PI * 440 * i) / sr) * 8000, true);
    m.AUDIO_FILES.sfx.denied = URL.createObjectURL(new Blob([dv.buffer], { type: 'audio/wav' }));
    m.AUDIO_FILES.sfx.punchLight = '/no-such-sound.wav';
    m.AUDIO_FILES.music.select = '/no-such-track.ogg';
  });

  // ------------------------------------------------------------ autoplay
  let d = await dbg(page);
  t.check('no audio context before the first key press (browser autoplay rules)', d.state === 'none' && d.wanted === 'menu', `${d.state}, wants ${d.wanted}`);
  await tap(page, 'ArrowDown', 80);
  await tap(page, 'ArrowUp', 80);
  await page.waitForFunction(() => !['no', 'running'].includes(window.zaikora.audio.debug().prerender), null, { timeout: 30000 });
  d = await dbg(page);
  const sfxCount = await page.evaluate(async () => (await import('/src/systems/audio/sfx.ts')).SFX_NAMES.length);
  t.check('the first key press unlocks audio and starts the menu theme', d.state === 'running' && d.track === 'menu', `${d.state}, ${d.track}`);
  t.check('every effect is pre-rendered to a buffer', d.prerender === 'done' && d.buffers === sfxCount, `${d.prerender}, ${d.buffers}/${sfxCount}`);
  const menuLevel = await level(page);
  t.check('the menu music is audible', menuLevel.rms > 0.003, `rms ${menuLevel.rms}, peak ${menuLevel.peak}`);

  const files = await page.evaluate(() => {
    const a = window.zaikora.audio;
    const peakOf = (b) => b.getChannelData(0).reduce((p, v) => Math.max(p, Math.abs(v)), 0);
    return {
      denied: a.buffers.get('denied')?.map((b) => +b.duration.toFixed(3)),
      punch: a.buffers.get('punchLight')?.length,
      normalised: [...a.buffers.entries()]
        .filter(([k]) => k !== 'denied')
        .every(([, list]) => list.every((b) => peakOf(b) > 0.2 && peakOf(b) <= 1.0001)),
    };
  });
  t.check('a recorded file replaces its generated effect', files.denied?.length === 1 && Math.abs(files.denied[0] - 0.25) < 0.01, JSON.stringify(files.denied));
  t.check('a missing effect file falls back to the generated sound', files.punch === 3, `${files.punch} variants`);
  t.check('rendered effects are normalised, not silent and not clipping', files.normalised);

  // ------------------------------------------------------------ menu → select → VS → fight, with real keys
  await tap(page, 'Enter'); // ARCADE LADDER
  await sceneActive(page, 'CharacterSelectScene');
  await wait(page, 1200);
  d = await dbg(page);
  const selectFile = await page.evaluate(() => window.zaikora.audio.trackFiles.get('select'));
  t.check('character select plays its theme (generated, as its file is missing)', d.track === 'select' && selectFile === null && d.tracksAlive <= 2, `${d.track}, file ${selectFile}`);
  const selectLevel = await level(page);
  t.check('the select theme is audible', selectLevel.rms > 0.003, `rms ${selectLevel.rms}`);

  await tap(page, 'Enter');
  await sceneActive(page, 'VersusScene');
  await wait(page, 300);
  d = await dbg(page);
  t.check('the VS screen lets the music go so its slam lands', d.track === null && d.wanted === null, `${d.track}`);
  await wait(page, 700);
  await tap(page, 'Enter');
  await waitForFight(page);
  await installHooks(page);
  d = await dbg(page);
  t.check('the fight plays the battle theme', d.track === 'battle', `${d.track}`);

  // Combat sounds from the existing hit and fighter events.
  await page.evaluate(() => {
    const s = window.game.scene.getScene('FightScene');
    s.p1.x = 600;
    s.p2.x = 690;
  });
  const before = await dbg(page);
  for (let i = 0; i < 6; i++) await tap(page, 'j', 260);
  await tap(page, 'k', 400);
  const after = await dbg(page);
  const hits = await page.evaluate(() => window.game.scene.getScene('FightScene').__hits.length);
  t.check('punches and kicks make sounds', hits > 0 && after.played - before.played >= hits, `${after.played - before.played} sounds for ${hits} hits`);
  const fightLevel = await level(page);
  t.check('the battle music is audible', fightLevel.rms > 0.003, `rms ${fightLevel.rms}, peak ${fightLevel.peak}`);
  t.check('nothing clips at the output', fightLevel.peak < 1, `peak ${fightLevel.peak}`);

  const dup = await page.evaluate(() => {
    const a = window.zaikora.audio;
    const b = a.debug().dropped;
    for (let i = 0; i < 10; i++) a.play('kickLight');
    return a.debug().dropped - b;
  });
  t.check('ten identical sounds in the same instant play once', dup === 9, `${dup} dropped`);
  const flood = await page.evaluate(() => {
    const a = window.zaikora.audio;
    const names = ['punchLight', 'punchHeavy', 'kickLight', 'kickHeavy', 'block', 'parry', 'counter', 'fireball', 'fireballImpact', 'dash', 'step', 'jump', 'land', 'thud', 'getUp', 'powerup'];
    for (let r = 0; r < 4; r++) for (const n of names) a.play(n);
    return a.debug().voices;
  });
  t.check('a flood of sounds stays under the voice limit', flood <= 24, `${flood} voices`);

  // ------------------------------------------------------------ pause
  await tap(page, 'Escape', 500);
  d = await dbg(page);
  t.check('pausing lowers the music', d.gains.pause < 0.5, `pause gain ${d.gains.pause}`);
  await tap(page, 'ArrowDown', 80); // MUSIC
  await tap(page, 'ArrowLeft', 200);
  d = await dbg(page);
  t.check('the pause screen changes the music volume', d.settings.music === 0.6, `music ${d.settings.music}`);
  await tap(page, 'ArrowRight', 100);
  await tap(page, 'Escape', 500);
  d = await dbg(page);
  t.check('resuming restores the music', d.gains.pause > 0.9 && d.settings.music === 0.7, `pause gain ${d.gains.pause}`);

  // ------------------------------------------------------------ scene end cuts the fight's sounds
  await tap(page, 'Escape', 300);
  const live = await page.evaluate(() => {
    const a = window.zaikora.audio;
    a.play('ko');
    a.play('fireball');
    return a.debug().gameVoices;
  });
  await tap(page, 'q');
  await sceneActive(page, 'MenuScene');
  await wait(page, 250);
  d = await dbg(page);
  t.check('quitting a fight cuts its sounds at once', live >= 2 && d.gameVoices === 0, `${live} playing → ${d.gameVoices}`);
  t.check('…and the menu theme comes back, un-dipped', d.track === 'menu' && d.gains.pause > 0.9, `${d.track}`);
  await wait(page, 2800);
  d = await dbg(page);
  t.check('the battle music is freed once it has faded', d.tracksAlive === 1, `${d.tracksAlive} players alive`);

  // ------------------------------------------------------------ hidden tab
  const setHidden = (hidden) =>
    page.evaluate((h) => {
      Object.defineProperty(document, 'hidden', { value: h, configurable: true });
      Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  await setHidden(true);
  const hid = await page
    .waitForFunction(() => window.zaikora.audio.debug().state === 'suspended', null, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  t.check('a hidden tab suspends audio', hid);
  await setHidden(false);
  const back = await page
    .waitForFunction(() => window.zaikora.audio.debug().state === 'running', null, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  t.check('…and showing it again resumes', back);

  // ------------------------------------------------------------ sound menu and persistence
  for (let i = 0; i < 5; i++) await tap(page, 'ArrowDown', 60); // SOUND
  await tap(page, 'Enter', 250);
  const open = await page.evaluate(() => window.game.scene.getScene('MenuScene').soundLayer.visible);
  await tap(page, 'ArrowLeft', 120); // master 90 → 80
  await tap(page, 'ArrowDown', 60);
  await tap(page, 'ArrowDown', 60); // EFFECTS
  await tap(page, 'ArrowLeft', 120);
  await tap(page, 'ArrowLeft', 120); // 90 → 70
  await tap(page, 'ArrowDown', 60); // SOUND on/off
  await tap(page, 'Enter', 400);
  d = await dbg(page);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('zaikora.audio') ?? 'null'));
  t.check(
    'the sound menu changes the settings and saves them on this device',
    open && saved?.master === 0.8 && saved?.sfx === 0.7 && saved?.music === 0.7 && saved?.muted === true,
    JSON.stringify(saved),
  );
  t.check('muting silences and suspends audio', d.settings.muted && d.state === 'suspended', d.state);
  await tap(page, 'Escape', 300);

  await page.reload();
  await sceneActive(page, 'MenuScene');
  await wait(page, 400);
  d = await dbg(page);
  t.check('settings are restored on the next visit', d.settings.master === 0.8 && d.settings.sfx === 0.7 && d.settings.muted === true, JSON.stringify(d.settings));
  await tap(page, 'm', 500);
  d = await dbg(page);
  t.check('M turns sound back on from the menu', d.settings.muted === false && d.state === 'running' && d.track === 'menu', `${d.state}, ${d.track}`);
  const label = await page.evaluate(() => window.game.scene.getScene('MenuScene').items[5].text);
  t.check('the SOUND menu item shows the level', label.includes('80%'), label);

  // M twice in quick succession: a suspend still in flight mustn't leave the game silent.
  await tap(page, 'm', 10);
  await tap(page, 'm', 600);
  d = await dbg(page);
  t.check('M pressed twice quickly ends with sound on', d.settings.muted === false && d.state === 'running', d.state);
  await page.keyboard.down('Meta');
  await tap(page, 'm', 200);
  await page.keyboard.up('Meta');
  d = await dbg(page);
  t.check('Cmd+M (minimise) does not toggle sound', d.settings.muted === false, String(d.settings.muted));

  // Scene changes while muted: nothing may queue up on the frozen clock and burst out on unmute.
  await tap(page, 'm', 400);
  const go = async (from, to, data) => {
    await page.evaluate(([f, k, dt]) => window.game.scene.getScene(f).scene.start(k, dt), [from, to, data]);
    await sceneActive(page, to);
    await wait(page, 300);
  };
  const versus = { difficulty: 'normal', player: 'yoru', mode: 'versus' };
  await go('MenuScene', 'CharacterSelectScene', versus);
  await go('CharacterSelectScene', 'VersusScene', versus);
  await go('VersusScene', 'FightScene', versus);
  const mutedState = await dbg(page);
  await tap(page, 'm', 600);
  d = await dbg(page);
  t.check(
    'changing scenes while muted queues nothing; unmuting starts just the current track',
    mutedState.state === 'suspended' && mutedState.tracksAlive === 0 && d.track === 'battle' && d.tracksAlive === 1,
    `muted: ${mutedState.state}, ${mutedState.tracksAlive} alive → ${d.track}, ${d.tracksAlive} alive`,
  );

  // ------------------------------------------------------------ results music and repeated matches
  let ok = true;
  let most = 0;
  const seen = [];
  for (const win of [true, false, true, false]) {
    await waitForFight(page);
    await installHooks(page);
    await endMatch(page, win);
    await sceneActive(page, 'ResultScene');
    await wait(page, 600);
    d = await dbg(page);
    seen.push(d.track);
    most = Math.max(most, d.tracksAlive, d.voices);
    if (d.track !== (win ? 'victory' : 'defeat')) ok = false;
    await page.waitForFunction(() => window.game.scene.getScene('ResultScene').saved, null, { timeout: 30000 });
    await tap(page, 'Enter'); // rematch
  }
  await waitForFight(page);
  t.check('a win plays the victory theme, a loss the defeat theme, every time', ok, seen.join(', '));
  d = await dbg(page);
  t.check('rematches go back to the battle theme', d.track === 'battle', `${d.track}`);
  await wait(page, 2800);
  d = await dbg(page);
  t.check('after four matches only one track and a handful of voices are alive', d.tracksAlive === 1 && most <= 24, `${d.tracksAlive} tracks; most players/voices seen ${most}`);

  // ------------------------------------------------------------ every track, rendered offline
  const tracks = await page.evaluate(async () => {
    const m = await import('/src/systems/audio/music.ts');
    const out = {};
    for (const name of Object.keys(m.TRACKS)) {
      const b = await m.renderTrack(name, 12, 22050);
      let peak = 0;
      let sum = 0;
      let n = 0;
      for (let c = 0; c < b.numberOfChannels; c++) {
        for (const v of b.getChannelData(c)) {
          peak = Math.max(peak, Math.abs(v));
          sum += v * v;
          n++;
        }
      }
      out[name] = [+peak.toFixed(3), +Math.sqrt(sum / n).toFixed(4)];
    }
    return out;
  });
  const goodTracks = Object.values(tracks).every(([peak, rms]) => peak < 1.15 && rms > 0.01);
  t.check('every track renders with sound and without clipping', goodTracks, JSON.stringify(tracks));

  await page.close();

  // ------------------------------------------------------------ M on the sign-in screen
  // Nobody is signed in there; saving sound on/off then must not write over the guest's progress.
  const login = await openGame(browser, url, t, { guest: false });
  const marker = JSON.stringify({ coins: 4321, note: 'guest progress' });
  await login.evaluate((m) => {
    localStorage.setItem('zaikora.guestSave', m);
    document.activeElement?.blur();
  }, marker);
  await tap(login, 'm', 300);
  const after2 = await login.evaluate(() => ({ save: localStorage.getItem('zaikora.guestSave'), muted: window.zaikora.audio.muted }));
  t.check('M on the sign-in screen mutes without touching the guest save', after2.muted === true && after2.save === marker, after2.save?.slice(0, 60));
  await login.close();
  return t;
}
