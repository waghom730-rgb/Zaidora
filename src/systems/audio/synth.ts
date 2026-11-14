// Sound-making building blocks shared by the sound effects (sfx.ts) and the music (music.ts).
// Everything is generated in code from oscillators, noise and small sample buffers computed at
// start-up, so ZAIKORA ships no third-party audio. Every function works on any BaseAudioContext,
// so the same recipe can play live or be rendered ahead of time in an OfflineAudioContext.

export type Ctx = BaseAudioContext;

export const mtof = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

const NOTE_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'D4' → 62, 'Bb3' → 58, 'F#5' → 78. Throws on anything else so typos fail loudly in tests. */
export function noteToMidi(name: string): number {
  const m = /^([A-G])(b|#)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note "${name}"`);
  const acc = m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0;
  return NOTE_PC[m[1]] + acc + (Number(m[3]) + 1) * 12;
}

/** Small seeded PRNG so generated noise (and offline renders) are identical every run. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One cache per sample rate: an AudioBuffer can be shared by any contexts at that rate, so the
 * effects' many small pre-render contexts and the live context all reuse the same samples.
 */
function cached<T>(store: Map<number, T>, ctx: Ctx, make: () => T): T {
  let v = store.get(ctx.sampleRate);
  if (v === undefined) {
    v = make();
    store.set(ctx.sampleRate, v);
  }
  return v;
}

export function makeBuffer(ctx: Ctx, seconds: number, fill: (d: Float32Array, sr: number) => void, channels = 1): AudioBuffer {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(channels, Math.max(1, Math.ceil(seconds * sr)), sr);
  for (let c = 0; c < channels; c++) fill(buf.getChannelData(c), sr);
  return buf;
}

const noiseStore = new Map<number, AudioBuffer>();
/** Two seconds of white noise, made once per sample rate. */
export function noiseBuffer(ctx: Ctx): AudioBuffer {
  return cached(noiseStore, ctx, () => {
    const rnd = prng(0x5eed);
    return makeBuffer(ctx, 2, (d) => {
      for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
    });
  });
}

// ------------------------------------------------------------------ envelopes and voices

const FLOOR = 0.0001;

/** Exponential attack/decay on a gain param: silent → vol in `attack` s → silent at `dur` s. */
function pluckEnv(p: AudioParam, t: number, attack: number, dur: number, vol: number): void {
  const a = Math.min(attack, dur * 0.5);
  p.setValueAtTime(FLOOR, t);
  p.exponentialRampToValueAtTime(Math.max(FLOOR, vol), t + a);
  p.exponentialRampToValueAtTime(FLOOR, t + dur);
}

export interface ToneOpts {
  type?: OscillatorType;
  f0: number;
  /** Pitch glides exponentially to f1 over the sound. */
  f1?: number;
  dur: number;
  vol: number;
  attack?: number;
}

export function tone(ctx: Ctx, out: AudioNode, t: number, o: ToneOpts): void {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f0, t);
  if (o.f1 !== undefined && o.f1 !== o.f0) osc.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
  pluckEnv(g.gain, t, o.attack ?? 0.002, o.dur, o.vol);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + o.dur + 0.03);
}

export interface NoiseOpts {
  filter: BiquadFilterType;
  f0: number;
  /** Filter frequency sweeps exponentially to f1 over the sound. */
  f1?: number;
  q?: number;
  dur: number;
  vol: number;
  attack?: number;
  /** Where to start reading the noise buffer, so layers and variants don't sound identical. */
  offset?: number;
}

export function noise(ctx: Ctx, out: AudioNode, t: number, o: NoiseOpts): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = o.filter;
  filter.Q.value = o.q ?? 0.8;
  filter.frequency.setValueAtTime(o.f0, t);
  if (o.f1 !== undefined && o.f1 !== o.f0) filter.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
  const g = ctx.createGain();
  pluckEnv(g.gain, t, o.attack ?? 0.002, o.dur, o.vol);
  src.connect(filter).connect(g).connect(out);
  src.start(t, (o.offset ?? 0) % 1.5);
  src.stop(t + o.dur + 0.03);
}

/** Struck metal: inharmonic sine partials, the higher ones dying faster (bells, gongs, a parry's ring). */
export function bell(ctx: Ctx, out: AudioNode, t: number, f: number, ratios: number[], dur: number, vol: number): void {
  ratios.forEach((r, i) => {
    tone(ctx, out, t, { f0: f * r, dur: dur / (1 + i * 0.45), vol: vol / (1 + i * 0.6), attack: 0.003 });
  });
}

/**
 * A short voiced grunt: a buzzing source shaped by two vowel formants, plus breath noise
 * through the same formants. Used for the fighters' hit reactions.
 */
export function grunt(ctx: Ctx, out: AudioNode, t: number, pitch: number, f1: number, f2: number, dur: number, vol: number): void {
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(pitch * 1.08, t);
  osc.frequency.exponentialRampToValueAtTime(pitch * 0.78, t + dur);
  const g = ctx.createGain();
  pluckEnv(g.gain, t, 0.014, dur, vol);
  for (const [f, q, w] of [
    [f1, 5, 1],
    [f2, 7, 0.5],
  ] as const) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = q;
    const w8 = ctx.createGain();
    w8.gain.value = w;
    osc.connect(bp).connect(w8).connect(g);
  }
  g.connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.03);
  noise(ctx, out, t, { filter: 'bandpass', f0: f1 * 1.1, q: 3, dur: dur * 0.9, vol: vol * 0.9, attack: 0.01, offset: pitch / 97 });
  noise(ctx, out, t, { filter: 'bandpass', f0: f2, q: 4, dur: dur * 0.7, vol: vol * 0.5, attack: 0.01, offset: pitch / 53 });
}

// ------------------------------------------------------------------ sampled instruments

const EDGE = 0.004;
/** Short fades at both ends so a buffer never clicks when it starts or is cut off. */
function fadeEdges(d: Float32Array, sr: number): void {
  const n = Math.min(d.length >> 1, Math.round(EDGE * sr));
  for (let i = 0; i < n; i++) {
    d[i] *= i / n;
    d[d.length - 1 - i] *= i / n;
  }
}

/** Plucked string (Karplus–Strong), the koto voice. Rendered once per base pitch. */
export function kotoBuffer(ctx: Ctx, midi: number): AudioBuffer {
  const f = mtof(midi);
  return makeBuffer(ctx, 1.8, (d, sr) => {
    const n = Math.max(2, Math.round(sr / f));
    const line = new Float32Array(n);
    const rnd = prng(midi * 7919);
    // Excitation: noise, softened a little so the pluck is woody rather than wiry.
    let lp = 0;
    for (let i = 0; i < n; i++) {
      lp += (rnd() * 2 - 1 - lp) * 0.6;
      line[i] = lp;
    }
    // Applied once per period, so higher strings die faster, as on a real koto.
    const loss = 0.988;
    for (let i = 0; i < d.length; i++) {
      const k = i % n;
      const y = line[k];
      d[i] = y;
      line[k] = (y + line[(k + 1) % n]) * 0.5 * loss;
    }
    let peak = 0;
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    for (let i = 0; i < d.length; i++) d[i] /= peak || 1;
    fadeEdges(d, sr);
  });
}

const KOTO_BASES = [50, 62, 74] as const; // D3, D4, D5
const kotoStore = new Map<number, AudioBuffer[]>();
/** Buffer and playback rate for a koto note: the nearest base pitch, shifted by at most ±6 semitones. */
export function koto(ctx: Ctx, midi: number): { buffer: AudioBuffer; rate: number } {
  const bufs = cached(kotoStore, ctx, () => KOTO_BASES.map((m) => kotoBuffer(ctx, m)));
  let best = 0;
  for (let i = 1; i < KOTO_BASES.length; i++) if (Math.abs(midi - KOTO_BASES[i]) < Math.abs(midi - KOTO_BASES[best])) best = i;
  return { buffer: bufs[best], rate: 2 ** ((midi - KOTO_BASES[best]) / 12) };
}

/** Plays a koto note into `out` (used by both music and the UI chimes). */
export function pluck(ctx: Ctx, out: AudioNode, t: number, midi: number, vol: number, len = 1.6): void {
  const { buffer, rate } = koto(ctx, midi);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  // Damp the string when the note's time is up rather than letting every note ring out.
  const end = t + Math.min(len, buffer.duration / rate);
  g.gain.setTargetAtTime(0, end, 0.06);
  src.connect(g).connect(out);
  src.start(t);
  src.stop(end + 0.3);
}

/** Where the bass sample's sustain loop starts (after its attack and decay). */
const BASS_LOOP_AT = 0.45;

/**
 * Bass tone: a band-limited saw plus a sine for weight, through a fixed low-pass, with the
 * attack and decay baked in and a loopable sustain. Playing one is a single sample player,
 * far cheaper than building oscillators and a filter for every short note.
 */
function bassBuffer(ctx: Ctx, midi: number): { buffer: AudioBuffer; loopStart: number; loopEnd: number } {
  const f = mtof(midi);
  const sr = ctx.sampleRate;
  const period = sr / f;
  const loopLen = Math.round(period * 8) / sr;
  const buffer = makeBuffer(ctx, BASS_LOOP_AT + loopLen, (d) => {
    // PolyBLEP saw: smooths the reset so the saw doesn't alias.
    const dt = f / sr;
    const blep = (p: number): number => (p < dt ? ((p /= dt), p + p - p * p - 1) : p > 1 - dt ? ((p = (p - 1) / dt), p * p + p + p + 1) : 0);
    let ph = 0;
    let a = 0;
    let b = 0;
    const k = 1 - Math.exp((-2 * Math.PI * 650) / sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const saw = 2 * ph - 1 - blep(ph);
      const sub = Math.sin(2 * Math.PI * ph);
      // Two one-pole low-passes: a gentle 12 dB/octave roll-off above ~650 Hz.
      a += (saw * 0.6 + sub * 0.7 - a) * k;
      b += (a - b) * k;
      const env = t < 0.006 ? t / 0.006 : t < 0.4 ? 1 - (0.3 * (t - 0.006)) / 0.394 : 0.7;
      d[i] = b * env;
      ph += dt;
      if (ph >= 1) ph -= 1;
    }
  });
  return { buffer, loopStart: BASS_LOOP_AT, loopEnd: BASS_LOOP_AT + loopLen };
}

const BASS_BASES = [38, 50] as const; // D2, D3
const bassStore = new Map<number, ReturnType<typeof bassBuffer>[]>();

/** Plays a bass note: the nearest base sample, re-pitched, sustained by its loop, released at `len`. */
export function bass(ctx: Ctx, out: AudioNode, t: number, midi: number, len: number, vol: number): void {
  const samples = cached(bassStore, ctx, () => BASS_BASES.map((m) => bassBuffer(ctx, m)));
  const i = Math.abs(midi - BASS_BASES[0]) <= Math.abs(midi - BASS_BASES[1]) ? 0 : 1;
  const s = samples[i];
  const src = ctx.createBufferSource();
  src.buffer = s.buffer;
  src.loop = true;
  src.loopStart = s.loopStart;
  src.loopEnd = s.loopEnd;
  src.playbackRate.value = 2 ** ((midi - BASS_BASES[i]) / 12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.setTargetAtTime(0, t + len, 0.03);
  src.connect(g).connect(out);
  src.start(t);
  src.stop(t + len + 0.15);
}

export type Drum = 'taiko' | 'shime' | 'kick' | 'clap' | 'hat' | 'crash' | 'gong';

/** Drum samples, computed sample by sample (no nodes), once per sample rate. */
function drumBuffer(ctx: Ctx, kind: Drum): AudioBuffer {
  const rnd = prng(kind.length * 101 + kind.charCodeAt(0));
  const n = () => rnd() * 2 - 1;
  switch (kind) {
    case 'taiko':
      return makeBuffer(ctx, 1.1, (d, sr) => {
        let ph = 0;
        let lp = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          ph += (2 * Math.PI * (52 + 68 * Math.exp(-t * 20))) / sr;
          lp += (n() - lp) * 0.1;
          d[i] = Math.sin(ph) * Math.exp(-t * 5.5) * 0.85 + lp * Math.exp(-t * 45) * 1.2;
        }
        fadeEdges(d, sr);
      });
    case 'shime':
      return makeBuffer(ctx, 0.3, (d, sr) => {
        let ph = 0;
        let lp = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          ph += (2 * Math.PI * (380 + 120 * Math.exp(-t * 50))) / sr;
          const x = n();
          lp += (x - lp) * 0.35;
          d[i] = Math.sin(ph) * Math.exp(-t * 22) * 0.7 + (x - lp) * Math.exp(-t * 80) * 0.6;
        }
        fadeEdges(d, sr);
      });
    case 'kick':
      return makeBuffer(ctx, 0.5, (d, sr) => {
        let ph = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          ph += (2 * Math.PI * (45 + 115 * Math.exp(-t * 28))) / sr;
          d[i] = Math.sin(ph) * Math.exp(-t * 8) + n() * Math.exp(-t * 300) * 0.3;
        }
        fadeEdges(d, sr);
      });
    case 'clap':
      return makeBuffer(ctx, 0.35, (d, sr) => {
        let lp = 0;
        let hp = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          const x = n();
          hp += (x - hp) * 0.25; // x - hp ≈ high-passed
          lp += (x - hp - lp) * 0.45; // then low-passed: a band around 1–2 kHz
          let env = Math.exp(-t * 16) * 0.5;
          for (const at of [0, 0.011, 0.022]) if (t >= at) env += Math.exp(-(t - at) * 160);
          d[i] = lp * env * 0.9;
        }
        fadeEdges(d, sr);
      });
    case 'hat':
      return makeBuffer(ctx, 0.12, (d, sr) => {
        let lp = 0;
        for (let i = 0; i < d.length; i++) {
          const x = n();
          lp += (x - lp) * 0.5;
          d[i] = (x - lp) * Math.exp(-(i / sr) * 55);
        }
        fadeEdges(d, sr);
      });
    case 'crash':
      return makeBuffer(ctx, 1.6, (d, sr) => {
        let lp = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          const x = n();
          lp += (x - lp) * 0.4;
          d[i] = (x - lp) * Math.exp(-t * 3) * Math.min(1, t / 0.004);
        }
        fadeEdges(d, sr);
      });
    case 'gong':
      return makeBuffer(ctx, 3.5, (d, sr) => {
        const parts = [
          [1, 1.3, 1],
          [1.006, 1.4, 0.6],
          [1.48, 1.9, 0.5],
          [1.99, 2.4, 0.35],
          [2.44, 3, 0.3],
          [2.91, 3.6, 0.2],
          [3.62, 4.4, 0.14],
        ];
        const f = 92;
        let lp = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          let s = 0;
          for (const [r, decay, w] of parts) s += Math.sin(2 * Math.PI * f * r * t * (1 - 0.004 * Math.min(t, 1))) * Math.exp(-t * decay) * w;
          lp += (n() - lp) * 0.2;
          // The mallet: a soft thump, and the shimmer swells in over the first 100 ms.
          d[i] = s * 0.45 * Math.min(1, 0.4 + t * 6) + lp * Math.exp(-t * 30) * 0.5;
        }
        fadeEdges(d, sr);
      });
  }
}

const drumStore = new Map<number, Map<Drum, AudioBuffer>>();
export function drum(ctx: Ctx, kind: Drum): AudioBuffer {
  const m = cached(drumStore, ctx, () => new Map<Drum, AudioBuffer>());
  let b = m.get(kind);
  if (!b) {
    b = drumBuffer(ctx, kind);
    m.set(kind, b);
  }
  return b;
}

/** Plays a buffer once: source → gain → out. */
export function playBuffer(ctx: Ctx, out: AudioNode, t: number, buffer: AudioBuffer, vol: number, rate = 1): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(g).connect(out);
  src.start(t);
  return src;
}

/** Stereo impulse response for the music's room: decaying noise that darkens as it fades. */
export function reverbImpulse(ctx: Ctx, seconds = 1.7): AudioBuffer {
  const rnd = prng(0xec40);
  return makeBuffer(
    ctx,
    seconds,
    (d, sr) => {
      const pre = Math.round(0.012 * sr);
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        if (i < pre) {
          d[i] = 0;
          continue;
        }
        const u = (i - pre) / (d.length - pre);
        lp += (rnd() * 2 - 1 - lp) * (0.65 - 0.55 * u);
        d[i] = lp * (1 - u) ** 3.2 * 0.6;
      }
    },
    2,
  );
}
