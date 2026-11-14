// ZAIKORA's music: five original pieces, written here as note data and played by a small
// look-ahead sequencer through synth.ts instruments (taiko, shime, koto, a breathy flute,
// bass, pad). Melodies use Japanese pentatonic scales over minor-key harmony; the victory
// theme is in D major. Nothing here is sampled from, or modelled on, any existing soundtrack.

import {
  bass,
  drum,
  mtof,
  noiseBuffer,
  noteToMidi,
  playBuffer,
  pluck,
  reverbImpulse,
  type Ctx,
  type Drum,
} from './synth';

export type TrackName = 'menu' | 'select' | 'battle' | 'victory' | 'defeat';
export type Inst = Drum | 'koto' | 'bass' | 'flute' | 'pad';

export interface NoteEvent {
  /** 16th-note step from the start of the section. */
  step: number;
  inst: Inst;
  /** MIDI notes (empty for drums; several for a pad chord). */
  notes: number[];
  /** Length in 16th-note steps. */
  len: number;
  vel: number;
  /** Part of a written melody (checked against the track's melodic scale in tests). */
  lead?: boolean;
}

export interface Section {
  bars: number;
  events: NoteEvent[];
}

export interface Track {
  name: TrackName;
  title: string;
  bpm: number;
  /** Played once before the loop. */
  intro?: Section;
  loop: Section;
  /** Pitch classes any note may use (0 = C). */
  scale: readonly number[];
  /** Pitch classes the melodies use. */
  lead: readonly number[];
  /** Overall gain, set from offline renders so the battle theme is loudest and the defeat theme quietest. */
  level: number;
}

export const STEPS_PER_BAR = 16;
export const stepSeconds = (bpm: number): number => 60 / bpm / 4;

// ------------------------------------------------------------------ authoring helpers

const QUALITY: Record<string, number[]> = { '': [0, 4, 7], m: [0, 3, 7], '5': [0, 7, 12], sus4: [0, 5, 7] };

/** 'Dm' at octave 4 → D4 F4 A4. Chords rooted above F drop an octave so voicings stay in one register. */
export function chordNotes(sym: string, octave: number, compact = true): number[] {
  const m = /^([A-G](?:b|#)?)(m|5|sus4)?$/.exec(sym);
  if (!m) throw new Error(`bad chord "${sym}"`);
  let root = noteToMidi(`${m[1]}${octave}`);
  if (compact && ((root % 12) + 12) % 12 > 5) root -= 12;
  return QUALITY[m[2] ?? ''].map((i) => root + i);
}

/** Drum hits: 'X' accent, 'x' normal, 'o' soft, '.' rest; 16 per bar. An array gives one pattern per bar, cycling. */
function hits(inst: Drum, bars: number, pattern: string | string[], vel = 1, fromBar = 0): NoteEvent[] {
  const out: NoteEvent[] = [];
  const pats = (Array.isArray(pattern) ? pattern : [pattern]).map((p) => p.replace(/\s/g, ''));
  for (let b = 0; b < bars; b++) {
    const p = pats[b % pats.length];
    if (p.length !== STEPS_PER_BAR) throw new Error(`${inst}: "${p}" is not ${STEPS_PER_BAR} steps`);
    for (let s = 0; s < STEPS_PER_BAR; s++) {
      const v = { X: 1, x: 0.72, o: 0.42, '.': 0 }[p[s]];
      if (v === undefined) throw new Error(`${inst}: bad hit "${p[s]}"`);
      if (v > 0) out.push({ step: (fromBar + b) * STEPS_PER_BAR + s, inst, notes: [], len: 1, vel: v * vel });
    }
  }
  return out;
}

/**
 * Bars of tokens separated by '|'. In each bar every token is one grid slot: a value starts a
 * note, '~' holds the previous one (also across bars), '.' is a rest.
 */
function tokens(
  text: string,
  fromBar: number,
  onNote: (token: string, bar: number, step: number, grid: number) => NoteEvent | null,
  where: string,
): NoteEvent[] {
  const out: NoteEvent[] = [];
  let held: NoteEvent | null = null;
  text.split('|').forEach((barText, b) => {
    const toks = barText.trim().split(/\s+/).filter(Boolean);
    if (toks.length !== 8 && toks.length !== 16) throw new Error(`${where} bar ${fromBar + b + 1}: ${toks.length} tokens`);
    const grid = STEPS_PER_BAR / toks.length;
    toks.forEach((tok, i) => {
      if (tok === '~') {
        if (held) held.len += grid;
        return;
      }
      held = tok === '.' ? null : onNote(tok, fromBar + b, (fromBar + b) * STEPS_PER_BAR + i * grid, grid);
      if (held) out.push(held);
    });
  });
  return out;
}

/** A written melody ('D5 ~ E5 . | …'). */
function melody(inst: Inst, text: string, vel: number, fromBar = 0): NoteEvent[] {
  return tokens(text, fromBar, (tok, _bar, step, grid) => ({ step, inst, notes: [noteToMidi(tok)], len: grid, vel, lead: true }), inst);
}

/** One sustained chord per bar (or per `barsEach` bars). */
function pad(prog: string[], octave: number, vel: number, fromBar = 0, barsEach = 1): NoteEvent[] {
  return prog.map((sym, i) => ({
    step: (fromBar + i * barsEach) * STEPS_PER_BAR,
    inst: 'pad' as const,
    notes: chordNotes(sym, octave),
    len: STEPS_PER_BAR * barsEach,
    vel,
  }));
}

/** Bass: a one-bar pattern of semitone offsets from each bar's chord root ('0 . 12 ~ 7 …'). */
function bassLine(prog: string[], pattern: string, vel: number, fromBar = 0): NoteEvent[] {
  const text = prog.map(() => pattern).join(' | ');
  return tokens(
    text,
    fromBar,
    (tok, bar, step, grid) => ({ step, inst: 'bass', notes: [chordNotes(prog[bar - fromBar], 2, false)[0] + Number(tok)], len: grid, vel }),
    'bass',
  );
}

/** Koto arpeggio: a one-bar pattern of indices into each bar's chord tones (spread over two octaves). */
function arp(prog: string[], pattern: string, vel: number, octave: number, fromBar = 0): NoteEvent[] {
  const text = prog.map(() => pattern).join(' | ');
  return tokens(
    text,
    fromBar,
    (tok, bar, step, grid) => {
      const base = chordNotes(prog[bar - fromBar], octave);
      const tones = [...new Set([...base, ...base.map((n) => n + 12)])].sort((a, b) => a - b);
      return { step, inst: 'koto', notes: [tones[Math.min(Number(tok), tones.length - 1)]], len: grid, vel };
    },
    'arp',
  );
}

function section(bars: number, ...parts: NoteEvent[][]): Section {
  const events = parts.flat().sort((a, b) => a.step - b.step);
  const bad = events.find((e) => e.step < 0 || e.step >= bars * STEPS_PER_BAR);
  if (bad) throw new Error(`${bad.inst} event at step ${bad.step} is outside a ${bars}-bar section`);
  return { bars, events };
}

const pcs = (...names: string[]): number[] => names.map((n) => noteToMidi(`${n}4`) % 12);
const D_MINOR = pcs('D', 'E', 'F', 'G', 'A', 'Bb', 'C');
const D_HIRAJOSHI = pcs('D', 'E', 'F', 'A', 'Bb');
const D_MAJOR = pcs('D', 'E', 'F#', 'G', 'A', 'B', 'C#');
const D_YO = pcs('D', 'E', 'G', 'A', 'B');
const D_IN = pcs('D', 'Eb', 'G', 'A', 'Bb');
const silent = (bars: number): string => Array.from({ length: bars }, () => '. . . . . . . .').join(' | ');

// ------------------------------------------------------------------ the pieces

// "Thirty Paths" — main menu, dojo and profile. Koto and pad alone for four bars, then the flute.
const MENU_PROG = ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Gm', 'A5', 'Bb', 'C', 'Dm', 'Am', 'Bb', 'C', 'Dm', 'A5'];
const MENU: Track = {
  name: 'menu',
  title: 'Thirty Paths',
  bpm: 84,
  scale: D_MINOR,
  lead: D_HIRAJOSHI,
  level: 0.9,
  loop: section(
    16,
    pad(MENU_PROG, 4, 0.5),
    bassLine(MENU_PROG, '0 ~ ~ ~ 0 ~ ~ .', 0.55),
    arp(MENU_PROG, '0 2 3 2 4 3 2 1', 0.42, 4),
    hits('taiko', 16, 'x...............', 0.55),
    hits('taiko', 8, '........o.......', 0.5, 8),
    hits('shime', 8, '......o.......o.', 0.6, 8),
    hits('gong', 1, 'o...............', 0.8),
    melody(
      'flute',
      [
        'A4 ~ ~ ~ D5 ~ E5 ~',
        'F5 ~ ~ E5 D5 ~ ~ ~',
        'Bb4 ~ ~ ~ A4 ~ F4 ~',
        'E4 ~ ~ ~ ~ ~ . .',
        'F5 ~ ~ ~ E5 ~ D5 ~',
        'E5 ~ ~ ~ ~ ~ A4 ~',
        'D5 ~ ~ ~ F5 ~ A5 ~',
        'A5 ~ ~ ~ ~ ~ E5 ~',
        'F5 ~ ~ ~ D5 ~ Bb4 ~',
        'A4 ~ ~ E5 ~ ~ D5 ~',
        'D5 ~ ~ ~ ~ ~ ~ ~',
        '. . . . . . . .',
      ].join(' | '),
      0.6,
      4,
    ),
  ),
};

// "Choose Your Path" — character select. A steady groove; the koto takes the hook second time round.
const SELECT_PROG = ['Dm', 'Bb', 'C', 'Dm', 'Dm', 'Bb', 'Gm', 'A5'];
const SELECT_16 = [...SELECT_PROG, ...SELECT_PROG];
const SELECT: Track = {
  name: 'select',
  title: 'Choose Your Path',
  bpm: 104,
  scale: D_MINOR,
  lead: D_HIRAJOSHI,
  level: 1.15,
  loop: section(
    16,
    pad(SELECT_16, 4, 0.4),
    bassLine(SELECT_16, '0 . 0 12 . 0 7 .', 0.5),
    arp(SELECT_16, '0 2 3 1 2 3 4 3', 0.36, 4),
    hits('kick', 16, 'x.......x.x.....', 0.75),
    hits('clap', 16, '....x.......x...', 0.55),
    hits('hat', 16, 'x.x.x.x.x.x.x.x.', 0.6),
    hits('shime', 16, '..o...o...o...o.', 0.5),
    hits('taiko', 16, ['x...............', '................', '................', '..........x.x.x.'], 0.6),
    hits('crash', 16, ['x...............', '................', '................', '................', '................', '................', '................', '................'], 0.6),
    melody(
      'koto',
      [
        'D5 ~ F5 ~ E5 D5 A4 ~',
        'Bb4 ~ ~ ~ D5 ~ F5 ~',
        'E5 ~ ~ ~ D5 ~ E5 ~',
        'A5 ~ ~ ~ ~ ~ . .',
        'D5 ~ F5 ~ E5 D5 A4 ~',
        'Bb4 ~ ~ ~ A4 ~ F4 ~',
        'A4 ~ Bb4 ~ D5 ~ ~ ~',
        'E5 ~ ~ ~ ~ ~ . .',
      ].join(' | '),
      0.62,
      8,
    ),
  ),
};

// "Clash of Masters" — the fight. Taiko build-in, then A (koto riff), B (flute melody), A' (both).
const BATTLE_A = ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Bb', 'A5'];
const BATTLE_B = ['Bb', 'C', 'Dm', 'Dm', 'Bb', 'C', 'A5', 'A5'];
const EMPTY_BAR = '................';
const BATTLE: Track = {
  name: 'battle',
  title: 'Clash of Masters',
  bpm: 144,
  scale: D_MINOR,
  lead: D_HIRAJOSHI,
  level: 0.85,
  intro: section(
    2,
    hits('taiko', 2, ['o.o.x.x.x.x.X.X.', 'xxxxXxxxXxxxXXXX'], 0.8),
    pad(['Dm'], 4, 0.35, 0, 2),
  ),
  loop: section(
    24,
    pad([...BATTLE_A, ...BATTLE_B, ...BATTLE_A], 4, 0.3),
    bassLine(BATTLE_A, '0 0 12 0 7 0 12 7', 0.6, 0),
    bassLine(BATTLE_B, '0 . 0 12 . 0 7 12', 0.6, 8),
    bassLine(BATTLE_A, '0 0 12 0 7 0 12 7', 0.6, 16),
    arp(BATTLE_A, '0 2 3 4 3 2 3 1', 0.4, 4, 0),
    arp(BATTLE_B, '0 . 2 . 3 . 2 .', 0.28, 4, 8),
    arp(BATTLE_A, '0 2 3 2 4 3 2 3 0 2 3 2 5 4 3 2', 0.32, 4, 16),
    hits('kick', 8, 'x.....x.x.....x.', 0.85, 0),
    hits('kick', 8, 'x.......x.x.....', 0.85, 8),
    hits('kick', 8, 'x.....x.x.....x.', 0.85, 16),
    hits('clap', 24, '....x.......x...', 0.6),
    hits('hat', 8, 'x.x.x.x.x.x.x.x.', 0.6, 0),
    hits('hat', 16, 'xoxoxoxoxoxoxoxo', 0.58, 8),
    hits('shime', 16, '..o...o...o...o.', 0.5, 8),
    hits('taiko', 24, ['X...............', EMPTY_BAR, EMPTY_BAR, '............XxXx'], 0.85),
    hits('crash', 24, ['X...............', EMPTY_BAR, EMPTY_BAR, EMPTY_BAR, EMPTY_BAR, EMPTY_BAR, EMPTY_BAR, EMPTY_BAR], 0.8),
    melody(
      'flute',
      [
        'F5 ~ ~ ~ D5 ~ F5 ~',
        'E5 ~ ~ ~ ~ ~ D5 E5',
        'F5 ~ ~ ~ A5 ~ ~ ~',
        'A5 ~ ~ ~ F5 ~ E5 ~',
        'F5 ~ ~ ~ D5 ~ Bb4 ~',
        'E5 ~ ~ ~ ~ ~ A4 ~',
        'A4 ~ ~ ~ E5 ~ ~ ~',
        'A4 ~ ~ ~ ~ ~ . .',
      ].join(' | '),
      0.62,
      8,
    ),
    melody(
      'flute',
      [
        'D5 ~ ~ E5 F5 ~ ~ ~',
        'A5 ~ ~ ~ F5 ~ E5 ~',
        'D5 ~ ~ ~ ~ ~ F5 ~',
        'E5 ~ ~ ~ ~ ~ . .',
        'D5 ~ ~ E5 F5 ~ A5 ~',
        'Bb5 ~ ~ ~ A5 ~ F5 ~',
        'F5 ~ ~ ~ D5 ~ E5 ~',
        'E5 ~ ~ ~ ~ ~ . .',
      ].join(' | '),
      0.55,
      16,
    ),
  ),
};

// "Rise" — after a win. A fanfare, then a calm loop while the rewards are read.
const VICTORY_LOOP = ['D', 'G', 'Em', 'A', 'D', 'G', 'A', 'D'];
const VICTORY: Track = {
  name: 'victory',
  title: 'Rise',
  bpm: 120,
  scale: D_MAJOR,
  lead: D_YO,
  level: 0.95,
  intro: section(
    4,
    pad(['D', 'G', 'A', 'D'], 4, 0.45),
    bassLine(['D', 'G', 'A', 'D'], '0 ~ ~ ~ 0 ~ ~ ~', 0.55),
    hits('taiko', 4, ['X.......X.X.....', 'X.......X.X.....', 'X...X...X...XXXX', 'X...............'], 0.85),
    hits('crash', 1, 'X...............', 0.8),
    hits('gong', 4, [EMPTY_BAR, EMPTY_BAR, EMPTY_BAR, 'x...............'], 0.9),
    melody('flute', 'D5 ~ ~ A4 D5 ~ E5 ~ | G5 ~ ~ ~ E5 ~ D5 ~ | E5 ~ ~ G5 A5 ~ ~ ~ | D5 ~ ~ ~ ~ ~ ~ ~', 0.7),
    melody('koto', 'D4 A4 D5 A5 . . . . . . . . . . . .', 0.6, 3),
  ),
  loop: section(
    8,
    pad(VICTORY_LOOP, 4, 0.35),
    bassLine(VICTORY_LOOP, '0 ~ ~ ~ ~ ~ ~ ~', 0.4),
    arp(VICTORY_LOOP, '0 2 3 2 4 3 2 1', 0.32, 4),
    hits('shime', 8, 'o...............', 0.4),
  ),
};

// "Fallen Leaves" — after a loss. A falling flute line in the In scale, then a quiet loop.
const DEFEAT: Track = {
  name: 'defeat',
  title: 'Fallen Leaves',
  bpm: 70,
  scale: [...new Set([...D_MINOR, ...D_IN])],
  lead: D_IN,
  level: 1.3,
  intro: section(
    3,
    pad(['Dm', 'Gm', 'Dm'], 4, 0.4),
    bassLine(['Dm', 'Gm', 'Dm'], '0 ~ ~ ~ ~ ~ ~ ~', 0.45),
    hits('taiko', 3, ['x...............', EMPTY_BAR, 'o...............'], 0.6),
    hits('gong', 1, 'o...............', 0.7),
    melody('flute', `A4 ~ ~ ~ G4 ~ Eb4 ~ | D4 ~ ~ ~ ~ ~ ~ ~ | ${silent(1)}`, 0.55),
  ),
  loop: section(
    4,
    pad(['Dm', 'Bb', 'Gm', 'A5'], 4, 0.32),
    bassLine(['Dm', 'Bb', 'Gm', 'A5'], '0 ~ ~ ~ ~ ~ ~ ~', 0.38),
    melody('koto', 'D4 . . . A4 . . . | Bb4 . . . . . A4 . | G4 . . . Eb4 . . . | D4 . . . . . . .', 0.5),
  ),
};

export const TRACKS: Record<TrackName, Track> = { menu: MENU, select: SELECT, battle: BATTLE, victory: VICTORY, defeat: DEFEAT };

// ------------------------------------------------------------------ mixing and instruments

interface Channel {
  gain: number;
  pan: number;
  /** Reverb send. */
  send: number;
}

const MIX: Record<Inst, Channel> = {
  taiko: { gain: 0.9, pan: 0, send: 0.18 },
  shime: { gain: 0.45, pan: -0.3, send: 0.2 },
  kick: { gain: 0.8, pan: 0, send: 0 },
  clap: { gain: 0.42, pan: 0.05, send: 0.22 },
  hat: { gain: 0.22, pan: 0.3, send: 0.05 },
  crash: { gain: 0.3, pan: 0.2, send: 0.3 },
  gong: { gain: 0.5, pan: 0, send: 0.45 },
  koto: { gain: 0.5, pan: -0.2, send: 0.35 },
  bass: { gain: 0.55, pan: 0, send: 0.02 },
  flute: { gain: 0.32, pan: 0.15, send: 0.45 },
  pad: { gain: 0.18, pan: 0, send: 0.55 },
};

function fluteNote(ctx: Ctx, out: AudioNode, t: number, midi: number, len: number, vel: number): void {
  const f = mtof(midi);
  const end = t + len;
  // Tone: a sine that scoops up into pitch, a little triangle for body, vibrato that blooms late.
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(f * 0.97, t);
  osc.frequency.exponentialRampToValueAtTime(f, t + 0.07);
  const body = ctx.createOscillator();
  body.type = 'triangle';
  body.frequency.value = f;
  const bodyGain = ctx.createGain();
  bodyGain.gain.value = 0.12;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5.3;
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(0, t + 0.25);
  depth.gain.linearRampToValueAtTime(f * 0.008, t + 0.6);
  lfo.connect(depth);
  depth.connect(osc.frequency);
  depth.connect(body.frequency);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(vel, t + 0.07);
  amp.gain.setTargetAtTime(vel * 0.8, t + 0.07, 0.2);
  amp.gain.setTargetAtTime(0, end, 0.07);
  osc.connect(amp);
  body.connect(bodyGain).connect(amp);
  amp.connect(out);
  // Breath: a chiff of filtered noise at the start, then a faint hiss under the note.
  const breath = ctx.createBufferSource();
  breath.buffer = noiseBuffer(ctx);
  breath.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = f * 1.6;
  bp.Q.value = 1.2;
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0, t);
  bg.gain.linearRampToValueAtTime(vel * 0.35, t + 0.03);
  bg.gain.setTargetAtTime(vel * 0.06, t + 0.03, 0.05);
  bg.gain.setTargetAtTime(0, end, 0.05);
  breath.connect(bp).connect(bg).connect(out);
  const stop = end + 0.45;
  for (const o of [osc, body, lfo]) {
    o.start(t);
    o.stop(stop);
  }
  breath.start(t, (midi * 0.013) % 1.5);
  breath.stop(stop);
}

function padChord(ctx: Ctx, out: AudioNode, t: number, notes: number[], len: number, vel: number): void {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1100;
  lp.Q.value = 0.5;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(vel, t + Math.min(0.5, len * 0.4));
  amp.gain.setTargetAtTime(0, t + len, 0.25);
  lp.connect(amp).connect(out);
  // One oscillator per note, alternately detuned, so the chord still shimmers at half the cost.
  notes.forEach((m, i) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(m);
    o.detune.value = i % 2 ? 6 : -6;
    o.connect(lp);
    o.start(t);
    o.stop(t + len + 1.3);
  });
}

function playEvent(ctx: Ctx, out: AudioNode, ev: NoteEvent, t: number, stepSec: number): void {
  const len = ev.len * stepSec;
  switch (ev.inst) {
    case 'koto':
      for (const m of ev.notes) pluck(ctx, out, t, m, ev.vel, Math.max(len, 0.25) + 0.25);
      break;
    case 'bass':
      bass(ctx, out, t, ev.notes[0], len, ev.vel * 0.8);
      break;
    case 'flute':
      fluteNote(ctx, out, t, ev.notes[0], len, ev.vel);
      break;
    case 'pad':
      padChord(ctx, out, t, ev.notes, len, ev.vel);
      break;
    default:
      playBuffer(ctx, out, t, drum(ctx, ev.inst), ev.vel);
  }
}

// ------------------------------------------------------------------ sequencing

export interface Scheduled {
  ev: NoteEvent;
  time: number;
}

/** Events later than this behind the clock are dropped rather than played late in a burst. */
export const LATE = 0.03;

/**
 * Walks a track's intro once and then its loop forever, handing out events by audio-clock time.
 * Pure (no Web Audio), so the timing logic is unit-tested directly.
 */
export class SequenceCursor {
  private inIntro: boolean;
  private idx = 0;
  private start: number;
  private readonly stepSec: number;
  loops = 0;

  constructor(
    private readonly track: Track,
    t0: number,
  ) {
    this.inIntro = !!track.intro;
    this.start = t0;
    this.stepSec = stepSeconds(track.bpm);
  }

  private get section(): Section {
    return this.inIntro && this.track.intro ? this.track.intro : this.track.loop;
  }

  private sectionLength(): number {
    return this.section.bars * STEPS_PER_BAR * this.stepSec;
  }

  /** All events starting before `until`; any that would start more than LATE before `now` are skipped. */
  take(until: number, now = -Infinity): Scheduled[] {
    const out: Scheduled[] = [];
    for (;;) {
      // After a long stall, jump whole loops instead of walking through them.
      if (!this.inIntro && this.idx === 0 && this.start + this.sectionLength() < now) {
        const skipped = Math.floor((now - this.start) / this.sectionLength());
        this.start += skipped * this.sectionLength();
        this.loops += skipped;
      }
      const { events } = this.section;
      if (this.idx < events.length) {
        const ev = events[this.idx];
        const time = this.start + ev.step * this.stepSec;
        if (time >= until) break;
        this.idx++;
        if (time >= now - LATE) out.push({ ev, time });
        continue;
      }
      // End of the section: on to the loop (again).
      const next = this.start + this.sectionLength();
      if (next >= until) break;
      this.start = next;
      this.idx = 0;
      if (this.inIntro) this.inIntro = false;
      else this.loops++;
    }
    return out;
  }
}

/**
 * One playing piece: its own dry and reverb-send gains (faded together, so fades and crossfades
 * take the reverb with them), per-instrument channels, and a cursor.
 */
export class TrackPlayer {
  readonly gain: GainNode;
  /** The track's share of the shared reverb. */
  private readonly wet: GainNode;
  private readonly channels = new Map<Inst, AudioNode>();
  private readonly nodes: AudioNode[] = [];
  private readonly cursor: SequenceCursor;
  private readonly stepSec: number;
  private readonly t0: number;
  private fileSource: AudioBufferSourceNode | null = null;
  /** Audio-clock time after which this player is silent and can be disposed. */
  endsAt = Infinity;

  constructor(
    private readonly ctx: Ctx,
    readonly track: Track,
    out: AudioNode,
    reverb: AudioNode,
    t0: number,
    fadeIn: number,
    /** A recorded version of the track (an asset override); played as a loop instead of the sequencer. */
    file?: AudioBuffer,
  ) {
    this.t0 = t0;
    this.gain = ctx.createGain();
    this.gain.connect(out);
    this.wet = ctx.createGain();
    this.wet.connect(reverb);
    for (const g of [this.gain.gain, this.wet.gain]) {
      g.setValueAtTime(0, t0);
      g.linearRampToValueAtTime(track.level, t0 + Math.max(0.02, fadeIn));
    }
    this.cursor = new SequenceCursor(track, t0);
    this.stepSec = stepSeconds(track.bpm);
    if (file) {
      const src = ctx.createBufferSource();
      src.buffer = file;
      src.loop = true;
      src.connect(this.gain);
      src.start(t0);
      this.fileSource = src;
    }
  }

  private channel(inst: Inst): AudioNode {
    let ch = this.channels.get(inst);
    if (!ch) {
      const m = MIX[inst];
      const g = this.ctx.createGain();
      g.gain.value = m.gain;
      const pan = panner(this.ctx, m.pan);
      g.connect(pan).connect(this.gain);
      const send = this.ctx.createGain();
      send.gain.value = m.send;
      g.connect(send).connect(this.wet);
      this.nodes.push(g, pan, send);
      this.channels.set(inst, g);
      ch = g;
    }
    return ch;
  }

  /** Queues every event due before `until`. Returns how many were queued. */
  schedule(until: number, now = -Infinity): number {
    if (this.fileSource) return 0;
    const due = this.cursor.take(Math.min(until, this.endsAt), now);
    for (const { ev, time } of due) playEvent(this.ctx, this.channel(ev.inst), ev, time, this.stepSec);
    return due.length;
  }

  get loops(): number {
    return this.cursor.loops;
  }

  fadeOut(now: number, seconds: number): void {
    const fade = Math.max(0.02, seconds);
    for (const g of [this.gain.gain, this.wet.gain]) {
      if (now <= this.t0) {
        // Not started yet: just stay silent.
        g.cancelScheduledValues(0);
        g.setValueAtTime(0, now);
        continue;
      }
      // Hold whatever level the fade-in had reached, then ramp down from there.
      if (typeof g.cancelAndHoldAtTime === 'function') g.cancelAndHoldAtTime(now);
      else {
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
      }
      g.linearRampToValueAtTime(0, now + fade);
    }
    // Notes already queued ring a little past the fade; keep the graph until they're done.
    this.endsAt = now + fade;
  }

  dispose(): void {
    try {
      this.fileSource?.stop();
    } catch {
      // never started or already stopped
    }
    this.gain.disconnect();
    this.wet.disconnect();
    for (const n of this.nodes) n.disconnect();
    this.channels.clear();
  }
}

/** Stereo placement; a plain pass-through where the browser has no stereo panner (Safari before 14.1). */
export function panner(ctx: Ctx, pan: number): AudioNode {
  if (typeof ctx.createStereoPanner !== 'function') return ctx.createGain();
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  return p;
}

/** The music room: a convolution reverb, made once per context. */
export function makeReverb(ctx: Ctx, out: AudioNode): AudioNode {
  const conv = ctx.createConvolver();
  conv.buffer = reverbImpulse(ctx);
  const ret = ctx.createGain();
  ret.gain.value = 0.8;
  conv.connect(ret).connect(out);
  return conv;
}

const LOOKAHEAD = 0.2;
const TICK_MS = 25;
/** Graph kept this long after a fade ends, so queued notes' tails finish before disconnecting. */
const TAIL = 1.5;

/** Plays one track at a time on a live context, with crossfades. */
export class MusicPlayer {
  private current: TrackPlayer | null = null;
  private fading: TrackPlayer[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly reverb: AudioNode;

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
  ) {
    this.reverb = makeReverb(ctx, out);
  }

  get playing(): TrackName | null {
    return this.current?.track.name ?? null;
  }

  /** Players with live audio nodes (the current one plus any still fading out). */
  get alive(): number {
    return (this.current ? 1 : 0) + this.fading.length;
  }

  get loops(): number {
    return this.current?.loops ?? 0;
  }

  play(name: TrackName, fadeOut = 0.8, fadeIn = 0.02, file?: AudioBuffer): void {
    if (this.current?.track.name === name) return;
    this.stop(fadeOut);
    this.current = new TrackPlayer(this.ctx, TRACKS[name], this.out, this.reverb, this.ctx.currentTime + 0.06, fadeIn, file);
    this.ensureTimer();
    this.tick();
  }

  stop(fade = 0.8): void {
    if (!this.current) return;
    this.current.fadeOut(this.ctx.currentTime, fade);
    this.fading.push(this.current);
    this.current = null;
  }

  /** Immediately silences and frees everything (used when the context closes). */
  stopAll(): void {
    for (const p of [...this.fading, ...(this.current ? [this.current] : [])]) p.dispose();
    this.fading = [];
    this.current = null;
    this.clearTimer();
  }

  private ensureTimer(): void {
    if (this.timer === null) this.timer = setInterval(this.tick, TICK_MS);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private readonly tick = (): void => {
    const now = this.ctx.currentTime;
    this.current?.schedule(now + LOOKAHEAD, now);
    this.fading = this.fading.filter((p) => {
      if (now > p.endsAt + TAIL) {
        p.dispose();
        return false;
      }
      p.schedule(now + LOOKAHEAD, now);
      return true;
    });
    if (!this.current && this.fading.length === 0) this.clearTimer();
  };
}

/** Renders the opening `seconds` of a track offline (tests, level checks, previews). */
export function renderTrack(name: TrackName, seconds: number, sampleRate = 44100): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const bus = ctx.createGain();
  bus.connect(ctx.destination);
  const player = new TrackPlayer(ctx, TRACKS[name], bus, makeReverb(ctx, bus), 0, 0.02);
  player.schedule(seconds);
  return ctx.startRendering();
}
