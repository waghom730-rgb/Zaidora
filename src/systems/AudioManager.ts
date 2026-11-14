import { MusicPlayer, panner, type TrackName } from './audio/music';
import { SFX, SFX_NAMES, type Sfx } from './audio/sfx';

export type { Sfx } from './audio/sfx';
export type { TrackName } from './audio/music';

// ------------------------------------------------------------------ settings

export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
}

export type VolumeKind = 'master' | 'music' | 'sfx';

export const DEFAULT_SETTINGS: Readonly<AudioSettings> = { master: 0.9, music: 0.7, sfx: 0.9, muted: false };
export const SETTINGS_KEY = 'zaikora.audio';

const clamp01 = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, Math.round(v * 100) / 100)) : fallback;

/** Reads saved settings; anything missing, out of range or corrupt falls back to the defaults. */
export function parseSettings(raw: string | null): AudioSettings {
  let o: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') o = parsed as Record<string, unknown>;
  } catch {
    // corrupt: use defaults
  }
  const d = DEFAULT_SETTINGS;
  return { master: clamp01(o.master, d.master), music: clamp01(o.music, d.music), sfx: clamp01(o.sfx, d.sfx), muted: o.muted === true };
}

/** Slider position → gain. Squared, so half way on the slider sounds about half as loud. */
export const volumeToGain = (v: number): number => v * v;

/**
 * The reference mix. At the default settings a heavy hit peaks around -4 dBFS and the battle
 * music averages around -26 dBFS (measured from offline renders), so hits sit clearly on top.
 */
const SFX_TRIM = 1;
const MUSIC_TRIM = 1;
/** Live-synthesis fallback level (its peaks aren't normalised like the pre-rendered buffers). */
const LIVE_TRIM = 0.6;

// ------------------------------------------------------------------ duplicate protection

/**
 * Decides whether a sound may start: drops repeats of the same sound closer than its minimum gap,
 * more simultaneous copies than it allows, and anything past the overall voice limit.
 */
export class VoiceGate {
  private readonly voices: { key: string; end: number }[] = [];
  private readonly last = new Map<string, number>();

  constructor(readonly maxVoices = 24) {}

  admit(key: string, now: number, dur: number, gapMs: number, maxSame: number): boolean {
    for (let i = this.voices.length - 1; i >= 0; i--) if (this.voices[i].end <= now) this.voices.splice(i, 1);
    const prev = this.last.get(key);
    if (prev !== undefined && (now - prev) * 1000 < gapMs) return false;
    let same = 0;
    for (const v of this.voices) if (v.key === key) same++;
    if (same >= maxSame || this.voices.length >= this.maxVoices) return false;
    this.voices.push({ key, end: now + dur });
    this.last.set(key, now);
    return true;
  }

  get active(): number {
    return this.voices.length;
  }

  clear(): void {
    this.voices.length = 0;
    this.last.clear();
  }
}

// ------------------------------------------------------------------ scenes → music

/**
 * The music each scene wants. `null` means silence; `undefined` leaves whatever is playing.
 * The VS screen is silent so its slam lands; the fight brings its own build-in.
 */
export function sceneMusic(scene: string, data?: unknown): TrackName | null | undefined {
  switch (scene) {
    case 'AccountScene':
    case 'MenuScene':
    case 'DojoScene':
    case 'ProfileScene':
      return 'menu';
    case 'CharacterSelectScene':
      return 'select';
    case 'VersusScene':
      return null;
    case 'FightScene':
      return 'battle';
    case 'ResultScene': {
      const outcome = (data as { outcome?: string } | undefined)?.outcome;
      return outcome === 'win' ? 'victory' : outcome === 'lose' ? 'defeat' : 'menu';
    }
    default:
      return undefined;
  }
}

/**
 * Recorded audio that replaces a generated sound or track (a path under public/, or any URL).
 * Empty: every sound and track is generated in code. A file that fails to load falls back to the
 * generated version. Effects load with the pre-render after the first key press; a track loads the
 * first time it's wanted, never up front.
 */
export const AUDIO_FILES: { sfx: Partial<Record<Sfx, string>>; music: Partial<Record<TrackName, string>> } = { sfx: {}, music: {} };

// ------------------------------------------------------------------ the manager

interface Voice {
  cat: 'game' | 'ui';
  end: number;
  out: GainNode;
  tail: AudioNode;
  done: boolean;
}

type ACtor = typeof AudioContext;
type OACtor = typeof OfflineAudioContext;

function loadSettings(): AudioSettings {
  try {
    return parseSettings(typeof window === 'undefined' ? null : window.localStorage.getItem(SETTINGS_KEY));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * The one place ZAIKORA makes sound. Owns the Web Audio context and the mix
 * (master → limiter; effects bus; music bus → pause dip → K.O. dip), the volume settings,
 * duplicate protection, scene music and browser rules (autoplay, hidden tabs, interruptions).
 * Phaser's own sound system stays switched off.
 */
class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private pauseDip: GainNode | null = null;
  private koDip: GainNode | null = null;
  private player: MusicPlayer | null = null;
  private readonly gate = new VoiceGate();
  private readonly buffers = new Map<Sfx, AudioBuffer[]>();
  private readonly nextVariant = new Map<Sfx, number>();
  private voices: Voice[] = [];
  private readonly trackFiles = new Map<TrackName, AudioBuffer | null>();
  private readonly listeners = new Set<() => void>();
  private settings: AudioSettings = loadSettings();
  /** The track that should be playing; remembered before the first key press unlocks audio. */
  private wanted: TrackName | null = null;
  private installed = false;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  private warned = false;
  private prerender: 'no' | 'running' | 'done' | 'failed' = 'no';
  private readonly stats = { played: 0, dropped: 0, liveSynth: 0 };

  get muted(): boolean {
    return this.settings.muted;
  }

  get volumes(): Readonly<AudioSettings> {
    return this.settings;
  }

  /** Browser hooks: unlock on the first gesture, M to mute anywhere, pause with the tab. Call once. */
  install(onMuteToggled?: (muted: boolean) => void): void {
    if (this.installed || typeof window === 'undefined') return;
    this.installed = true;
    const gesture = (): void => this.unlock();
    // Touch browsers only count the end of a tap as a gesture, hence pointerup/touchend/click too.
    for (const type of ['pointerdown', 'pointerup', 'keydown', 'touchstart', 'touchend', 'click']) {
      window.addEventListener(type, gesture, { capture: true, passive: true });
    }
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyM' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      this.toggleMute();
      onMuteToggled?.(this.muted);
    });
    document.addEventListener('visibilitychange', () => this.applyRunState());
  }

  /** Must be called from a user gesture (key press) before sound can play. Safe to call often. */
  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC: ACtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: ACtor }).webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        return;
      }
      this.buildGraph(this.ctx);
      void this.prerenderSfx();
    }
    this.applyRunState();
    this.syncMusic();
  }

  private buildGraph(ctx: AudioContext): void {
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 4;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    limiter.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(limiter);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.koDip = ctx.createGain();
    this.koDip.connect(this.master);
    this.pauseDip = ctx.createGain();
    this.pauseDip.connect(this.koDip);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.pauseDip);
    this.player = new MusicPlayer(ctx, this.musicBus);
    // Settle any suspend/resume that raced a later change (M pressed twice quickly, a quick tab
    // switch), then start the wanted music once the clock runs.
    ctx.onstatechange = () => {
      this.applyRunState();
      this.syncMusic();
      this.emit();
    };
    const s = this.settings;
    this.master.gain.value = s.muted ? 0 : volumeToGain(s.master);
    this.sfxBus.gain.value = volumeToGain(s.sfx) * SFX_TRIM;
    this.musicBus.gain.value = volumeToGain(s.music) * MUSIC_TRIM;
  }

  private shouldRun(): boolean {
    return !this.settings.muted && !(typeof document !== 'undefined' && document.hidden);
  }

  /** Runs the context only while it's audible: muted or hidden tabs suspend it (and its CPU use). */
  private applyRunState(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.shouldRun()) {
      if (this.suspendTimer !== null) clearTimeout(this.suspendTimer);
      this.suspendTimer = null;
      // 'interrupted' (Safari, after a call or another app took the audio device) also resumes here.
      if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    } else if (ctx.state === 'running' && this.suspendTimer === null) {
      // Let the master fade (about 20 ms) finish first, so muting doesn't click.
      this.suspendTimer = setTimeout(() => {
        this.suspendTimer = null;
        if (!this.shouldRun() && ctx.state === 'running') void ctx.suspend().catch(() => {});
      }, 120);
    }
  }

  // ---------------------------------------------------------------- settings

  setVolume(kind: VolumeKind, value: number): void {
    this.settings = { ...this.settings, [kind]: clamp01(value, this.settings[kind]) };
    this.saveAndApply();
  }

  /** Mute or unmute (also applies the setting saved with an account). */
  setMuted(muted: boolean): void {
    this.settings = { ...this.settings, muted };
    this.saveAndApply();
    this.applyRunState();
  }

  toggleMute(): boolean {
    this.setMuted(!this.settings.muted);
    return this.settings.muted;
  }

  /** Called whenever settings or playback state change (UI refresh). Returns an unsubscribe. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  private saveAndApply(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // storage blocked (private mode): settings still apply for this visit
    }
    const ctx = this.ctx;
    if (ctx && this.master && this.sfxBus && this.musicBus) {
      const t = ctx.currentTime;
      const s = this.settings;
      this.master.gain.setTargetAtTime(s.muted ? 0 : volumeToGain(s.master), t, 0.02);
      this.sfxBus.gain.setTargetAtTime(volumeToGain(s.sfx) * SFX_TRIM, t, 0.02);
      this.musicBus.gain.setTargetAtTime(volumeToGain(s.music) * MUSIC_TRIM, t, 0.02);
    }
    this.emit();
  }

  // ---------------------------------------------------------------- sound effects

  play(name: Sfx, opts: { pan?: number } = {}): void {
    // Sound must never be able to break the game: any audio error is logged once and ignored.
    try {
      this.playSfx(name, opts.pan ?? 0);
    } catch (e) {
      this.warnOnce(e);
    }
  }

  private warnOnce(e: unknown): void {
    if (this.warned) return;
    this.warned = true;
    console.warn('ZAIKORA audio error (sound continues without it):', e);
  }

  private playSfx(name: Sfx, pan: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || this.settings.muted || ctx.state !== 'running') return;
    const spec = SFX[name];
    const now = ctx.currentTime;
    if (!this.gate.admit(name, now, spec.dur, spec.gapMs, spec.max)) {
      this.stats.dropped++;
      return;
    }
    const out = ctx.createGain();
    let tail: AudioNode = out;
    if (pan) {
      tail = panner(ctx, Math.max(-1, Math.min(1, pan)));
      out.connect(tail);
    }
    tail.connect(this.sfxBus);
    const voice: Voice = { cat: spec.cat, end: now + spec.dur, out, tail, done: false };
    this.voices.push(voice);
    this.stats.played++;

    const variant = this.nextVariant.get(name) ?? 0;
    this.nextVariant.set(name, variant + 1);
    const bufs = this.buffers.get(name);
    if (bufs?.length) {
      const src = ctx.createBufferSource();
      src.buffer = bufs[variant % bufs.length];
      src.connect(out);
      src.onended = () => this.release(voice);
      src.start(now);
    } else {
      // Not pre-rendered (yet): synthesize it live.
      this.stats.liveSynth++;
      out.gain.value = spec.level * LIVE_TRIM;
      spec.render(ctx, out, now, variant % spec.variants);
      setTimeout(() => this.release(voice), spec.dur * 1000 + 100);
    }
  }

  private release(v: Voice): void {
    if (v.done) return;
    v.done = true;
    v.tail.disconnect();
    if (v.tail !== v.out) v.out.disconnect();
    this.voices = this.voices.filter((x) => x !== v);
  }

  /** Cuts the fight's sounds when its scene ends (menu sounds are left to finish). */
  stopGameSfx(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const v of this.voices) {
      if (v.cat !== 'game' || v.done) continue;
      v.out.gain.cancelScheduledValues(ctx.currentTime);
      v.out.gain.setTargetAtTime(0, ctx.currentTime, 0.012);
      setTimeout(() => this.release(v), 80);
    }
    this.gate.clear();
  }

  /** Renders every effect (and its variants) to a buffer once, so playing one is a single source node. */
  private async prerenderSfx(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || this.prerender !== 'no') return;
    this.prerender = 'running';
    try {
      for (const name of SFX_NAMES) {
        const url = AUDIO_FILES.sfx[name];
        const file = url ? await this.loadFile(url) : null;
        if (file) this.buffers.set(name, [file]);
      }
      const OAC: OACtor | undefined = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: OACtor }).webkitOfflineAudioContext;
      if (!OAC) throw new Error('OfflineAudioContext is not available');
      const sr = ctx.sampleRate;
      for (const name of SFX_NAMES) {
        if (this.buffers.has(name)) continue;
        const spec = SFX[name];
        const list: AudioBuffer[] = [];
        for (let v = 0; v < spec.variants; v++) {
          // One small context per render: a context processes all its nodes for its whole length.
          const off = new OAC(1, Math.ceil(spec.dur * sr), sr);
          spec.render(off, off.destination, 0, v);
          list.push(normalise(await off.startRendering(), spec.level));
        }
        this.buffers.set(name, list);
      }
      this.prerender = 'done';
    } catch (e) {
      this.prerender = 'failed';
      console.warn('ZAIKORA audio: pre-rendering failed, sounds will be synthesized live.', e);
    }
    this.emit();
  }

  private async loadFile(url: string): Promise<AudioBuffer | null> {
    const ctx = this.ctx;
    if (!ctx) return null;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await ctx.decodeAudioData(await res.arrayBuffer());
    } catch (e) {
      console.warn(`ZAIKORA audio: couldn't load ${url}; using the generated version.`, e);
      return null;
    }
  }

  // ---------------------------------------------------------------- music

  /** Switches to a track (crossfading), or fades to silence with `null`. Same track: nothing happens. */
  music(name: TrackName | null, fade = 0.8): void {
    this.wanted = name;
    const player = this.player;
    if (!player || !this.ctx) return; // starts on the first key press
    try {
      if (this.ctx.state !== 'running') {
        // Muted or hidden: the clock is frozen, so don't queue notes against it. Drop a track
        // that's no longer wanted; the wanted one starts when sound comes back (syncMusic).
        if (player.playing !== name) player.stopAll();
      } else if (name === null) player.stop(fade);
      else this.startTrack(name, fade, 0.02);
    } catch (e) {
      this.warnOnce(e);
    }
    this.emit();
  }

  /** Once the clock runs: start the wanted track if something else (or nothing) is playing. */
  private syncMusic(): void {
    const player = this.player;
    if (!player || this.ctx?.state !== 'running' || player.playing === this.wanted) return;
    try {
      if (this.wanted === null) player.stop(0.8);
      else this.startTrack(this.wanted, 0.3, 0.8);
    } catch (e) {
      this.warnOnce(e);
    }
  }

  private startTrack(name: TrackName, fadeOut: number, fadeIn: number): void {
    const player = this.player;
    if (!player) return;
    const url = AUDIO_FILES.music[name];
    if (url && !this.trackFiles.has(name)) {
      // Loaded the first time the track is wanted, not up front. The generated version plays meanwhile.
      this.trackFiles.set(name, null);
      void this.loadFile(url).then((buf) => {
        this.trackFiles.set(name, buf);
        if (buf && this.wanted === name) {
          player.stop(0.4);
          player.play(name, 0.4, 0.4, buf);
        }
      });
    }
    player.play(name, fadeOut, fadeIn, this.trackFiles.get(name) ?? undefined);
  }

  /** Dips the music for a moment (a K.O.), then brings it back. */
  duckMusic(level: number, seconds: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.koDip) return;
    const g = this.koDip.gain;
    const t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(level, t, 0.05);
    g.setTargetAtTime(1, t + seconds, 0.4);
  }

  /** Lowers the music while the game is paused. */
  setPaused(paused: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.pauseDip) return;
    this.pauseDip.gain.setTargetAtTime(paused ? 0.35 : 1, ctx.currentTime, 0.08);
  }

  /** A scene ended: cut its game sounds and clear any dips it left behind. */
  sceneEnded(): void {
    this.stopGameSfx();
    this.setPaused(false);
    if (this.ctx && this.koDip) {
      this.koDip.gain.cancelScheduledValues(this.ctx.currentTime);
      this.koDip.gain.setTargetAtTime(1, this.ctx.currentTime, 0.1);
    }
  }

  // ---------------------------------------------------------------- inspection (tests, dev console)

  debug(): Record<string, unknown> {
    const now = this.ctx?.currentTime ?? 0;
    return {
      state: this.ctx?.state ?? 'none',
      track: this.player?.playing ?? null,
      wanted: this.wanted,
      tracksAlive: this.player?.alive ?? 0,
      loops: this.player?.loops ?? 0,
      voices: this.voices.length,
      gameVoices: this.voices.filter((v) => v.cat === 'game' && !v.done && v.end > now).length,
      ...this.stats,
      prerender: this.prerender,
      buffers: this.buffers.size,
      settings: { ...this.settings },
      gains: {
        master: this.master?.gain.value ?? null,
        sfx: this.sfxBus?.gain.value ?? null,
        music: this.musicBus?.gain.value ?? null,
        pause: this.pauseDip?.gain.value ?? null,
        ko: this.koDip?.gain.value ?? null,
      },
    };
  }
}

/** Scales a rendered effect to its target peak, in place (a buffer can play in any context). */
function normalise(buf: AudioBuffer, level: number): AudioBuffer {
  const d = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const k = peak > 0 ? level / peak : 0;
  for (let i = 0; i < d.length; i++) d[i] *= k;
  return buf;
}

export const audio = new AudioManager();
