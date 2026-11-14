import { describe, expect, it } from 'vitest';
import { MOVES } from '../src/combat/moves';
import { DEFAULT_SETTINGS, VoiceGate, parseSettings, sceneMusic, volumeToGain } from '../src/systems/AudioManager';
import { LATE, STEPS_PER_BAR, SequenceCursor, TRACKS, chordNotes, stepSeconds, type Track } from '../src/systems/audio/music';
import { SFX, SFX_NAMES, hurtSfx, impactSfx, swingSfx } from '../src/systems/audio/sfx';
import { noteToMidi } from '../src/systems/audio/synth';

describe('audio settings', () => {
  it('falls back to the defaults when nothing (or garbage) is saved', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('"a string"')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values, clamps out-of-range ones and ignores the wrong types', () => {
    expect(parseSettings(JSON.stringify({ master: 0.5, music: 0, sfx: 1, muted: true }))).toEqual({ master: 0.5, music: 0, sfx: 1, muted: true });
    const s = parseSettings(JSON.stringify({ master: 7, music: -1, sfx: 'loud', muted: 'yes' }));
    expect(s).toEqual({ master: 1, music: 0, sfx: DEFAULT_SETTINGS.sfx, muted: false });
  });

  it('maps slider positions to gain on a squared curve', () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(1)).toBe(1);
    expect(volumeToGain(0.5)).toBeCloseTo(0.25);
    for (let v = 0.1; v <= 1; v += 0.1) expect(volumeToGain(v)).toBeGreaterThan(volumeToGain(v - 0.1));
  });
});

describe('duplicate protection', () => {
  it('drops a repeat of the same sound inside its minimum gap, and allows it after', () => {
    const g = new VoiceGate();
    expect(g.admit('punchLight', 1, 0.2, 30, 4)).toBe(true);
    expect(g.admit('punchLight', 1.01, 0.2, 30, 4)).toBe(false);
    expect(g.admit('kickLight', 1.01, 0.2, 30, 4)).toBe(true);
    expect(g.admit('punchLight', 1.04, 0.2, 30, 4)).toBe(true);
  });

  it('caps copies of one sound while they play, and frees them when they end', () => {
    const g = new VoiceGate();
    expect(g.admit('ko', 0, 2, 0, 1)).toBe(true);
    expect(g.admit('ko', 1, 2, 0, 1)).toBe(false);
    expect(g.admit('ko', 2.5, 2, 0, 1)).toBe(true);
  });

  it('caps the total number of voices', () => {
    const g = new VoiceGate(4);
    for (let i = 0; i < 4; i++) expect(g.admit(`s${i}`, 0, 1, 0, 9)).toBe(true);
    expect(g.admit('s9', 0, 1, 0, 9)).toBe(false);
    expect(g.active).toBe(4);
    g.clear();
    expect(g.admit('s9', 0, 1, 0, 9)).toBe(true);
  });
});

describe('scene music', () => {
  it('gives every scene the right track', () => {
    for (const s of ['AccountScene', 'MenuScene', 'DojoScene', 'ProfileScene']) expect(sceneMusic(s)).toBe('menu');
    expect(sceneMusic('CharacterSelectScene')).toBe('select');
    expect(sceneMusic('VersusScene')).toBeNull();
    expect(sceneMusic('FightScene')).toBe('battle');
    expect(sceneMusic('ResultScene', { outcome: 'win' })).toBe('victory');
    expect(sceneMusic('ResultScene', { outcome: 'lose' })).toBe('defeat');
    expect(sceneMusic('ResultScene', { outcome: 'draw' })).toBe('menu');
    expect(sceneMusic('BootScene')).toBeUndefined();
  });
});

describe('music', () => {
  it('reads note and chord names', () => {
    expect(noteToMidi('D4')).toBe(62);
    expect(noteToMidi('Bb3')).toBe(58);
    expect(noteToMidi('F#5')).toBe(78);
    expect(() => noteToMidi('H2')).toThrow();
    expect(chordNotes('Dm', 4)).toEqual([62, 65, 69]);
    expect(chordNotes('Bb', 4)).toEqual([58, 62, 65]); // rooted above F: one octave down
    expect(chordNotes('A5', 2, false)).toEqual([45, 52, 57]);
  });

  const RANGE: Record<string, [number, number]> = { flute: [60, 84], koto: [48, 90], bass: [28, 60], pad: [45, 72] };
  const sections = (t: Track) => [t.intro, t.loop].filter((s) => s !== undefined);

  for (const track of Object.values(TRACKS)) {
    describe(`"${track.title}" (${track.name})`, () => {
      const events = sections(track).flatMap((s) => s.events);

      it('stays in its key, and its melodies stay in their scale', () => {
        const outOfKey = events.flatMap((e) => e.notes.filter((n) => !track.scale.includes(n % 12)).map((n) => `${e.inst}@${e.step}:${n}`));
        expect(outOfKey).toEqual([]);
        const outOfScale = events.filter((e) => e.lead).flatMap((e) => e.notes.filter((n) => !track.lead.includes(n % 12)).map((n) => `${e.inst}@${e.step}:${n}`));
        expect(outOfScale).toEqual([]);
      });

      it('keeps every instrument in a playable range', () => {
        const outOfRange = events.flatMap((e) => {
          const r = RANGE[e.inst];
          return r ? e.notes.filter((n) => n < r[0] || n > r[1]).map((n) => `${e.inst}:${n}`) : [];
        });
        expect(outOfRange).toEqual([]);
      });

      it('fits its events inside whole bars, in time order', () => {
        for (const s of sections(track)) {
          expect(s.events.length).toBeGreaterThan(0);
          for (let i = 0; i < s.events.length; i++) {
            const e = s.events[i];
            expect(e.step).toBeGreaterThanOrEqual(0);
            expect(e.step).toBeLessThan(s.bars * STEPS_PER_BAR);
            expect(e.len).toBeGreaterThan(0);
            expect(e.vel).toBeGreaterThan(0);
            expect(e.vel).toBeLessThanOrEqual(1);
            if (i) expect(e.step).toBeGreaterThanOrEqual(s.events[i - 1].step);
          }
        }
      });

      it('loops for long enough not to feel repetitive', () => {
        const loopSeconds = track.loop.bars * STEPS_PER_BAR * stepSeconds(track.bpm);
        expect(loopSeconds).toBeGreaterThanOrEqual(13);
        expect(loopSeconds).toBeLessThanOrEqual(60);
        expect(new Set(events.map((e) => e.inst)).size).toBeGreaterThanOrEqual(3);
      });
    });
  }

  it('the battle theme is the fastest, the defeat theme the slowest', () => {
    const bpms = Object.values(TRACKS).map((t) => t.bpm);
    expect(TRACKS.battle.bpm).toBe(Math.max(...bpms));
    expect(TRACKS.defeat.bpm).toBe(Math.min(...bpms));
  });
});

describe('music sequencing', () => {
  const track = TRACKS.battle;
  const step = stepSeconds(track.bpm);
  const introLen = (track.intro?.bars ?? 0) * STEPS_PER_BAR * step;
  const loopLen = track.loop.bars * STEPS_PER_BAR * step;

  /** Every event start from t0 up to `until`, worked out directly. */
  function expected(t0: number, until: number): number[] {
    const out = (track.intro?.events ?? []).map((e) => t0 + e.step * step);
    for (let k = 0; t0 + introLen + k * loopLen < until; k++) {
      for (const e of track.loop.events) out.push(t0 + introLen + k * loopLen + e.step * step);
    }
    return out.filter((t) => t < until);
  }

  it('plays the intro once, then the loop, with no gaps or repeats however irregular the ticks are', () => {
    const cursor = new SequenceCursor(track, 1);
    const got: number[] = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // 100 s of ticks every 5–60 ms, each scheduling 0.2 s ahead (as the live player does).
    for (let now = 1; now < 101; now += 0.005 + rnd() * 0.055) for (const s of cursor.take(now + 0.2, now)) got.push(s.time);
    const until = got[got.length - 1] + 1e-9;
    const want = expected(1, until);
    expect(got.length).toBe(want.length);
    got.forEach((t, i) => expect(t).toBeCloseTo(want[i], 9));
    expect(cursor.loops).toBe(Math.floor((until - 1 - introLen) / loopLen));
  });

  it('after a stall, drops what it missed instead of playing it all at once', () => {
    const cursor = new SequenceCursor(track, 0);
    cursor.take(1, 0);
    // The main thread froze for 30 s; the audio clock kept going.
    const now = 31;
    const due = cursor.take(now + 0.2, now);
    expect(due.length).toBeGreaterThan(0);
    for (const s of due) {
      expect(s.time).toBeGreaterThanOrEqual(now - LATE);
      expect(s.time).toBeLessThan(now + 0.2);
    }
    expect(cursor.loops).toBe(Math.floor((now - introLen) / loopLen));
  });
});

describe('sound effects', () => {
  it('every effect has a usable recipe', () => {
    expect(SFX_NAMES.length).toBeGreaterThanOrEqual(34);
    for (const name of SFX_NAMES) {
      const s = SFX[name];
      expect(s.dur, name).toBeGreaterThan(0);
      expect(s.level, name).toBeGreaterThan(0);
      expect(s.level, name).toBeLessThanOrEqual(1);
      expect(s.variants, name).toBeGreaterThanOrEqual(1);
      expect(s.max, name).toBeGreaterThanOrEqual(1);
      expect(typeof s.render).toBe('function');
    }
  });

  it('replaces every placeholder sound', () => {
    // Placeholder name → what plays now.
    const replaced: Record<string, string> = {
      whoosh: 'punchSwing',
      hitLight: 'punchLight',
      hitHeavy: 'punchHeavy',
      block: 'block',
      jump: 'jump',
      land: 'land',
      thud: 'thud',
      ko: 'ko',
      select: 'select',
      confirm: 'confirm',
      round: 'round',
      count: 'count',
      fight: 'fight',
      powerup: 'powerup',
      fireball: 'fireball',
      dash: 'dash',
      step: 'step',
      parry: 'parry',
      counter: 'counter',
      denied: 'denied',
    };
    expect(Object.keys(replaced)).toHaveLength(20);
    for (const now of Object.values(replaced)) expect(SFX_NAMES).toContain(now);
  });

  it('gives each move the swing and impact for its limb and weight', () => {
    expect(swingSfx(MOVES.jab)).toBe('punchSwing');
    expect(swingSfx(MOVES.frontKick)).toBe('kickSwing');
    expect(swingSfx(MOVES.roundhouse)).toBe('heavySwing');
    expect(swingSfx(MOVES.shadowDash)).toBe('dash');
    expect(impactSfx(MOVES.jab, false, false)).toBe('punchLight');
    expect(impactSfx(MOVES.cross, true, false)).toBe('punchHeavy');
    expect(impactSfx(MOVES.airKick, false, false)).toBe('kickLight');
    expect(impactSfx(MOVES.roundhouse, true, false)).toBe('kickHeavy');
    expect(impactSfx(MOVES.fireball, true, true)).toBe('fireballImpact');
    expect(hurtSfx('kaen')).toBe('hurtKaen');
    expect(hurtSfx('yoru')).toBe('hurtYoru');
    for (const m of Object.values(MOVES)) {
      expect(SFX_NAMES).toContain(swingSfx(m));
      expect(SFX_NAMES).toContain(impactSfx(m, m.heavy, false));
    }
  });
});
