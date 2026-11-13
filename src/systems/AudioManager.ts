export type Sfx =
  | 'whoosh'
  | 'hitLight'
  | 'hitHeavy'
  | 'block'
  | 'jump'
  | 'land'
  | 'thud'
  | 'ko'
  | 'select'
  | 'confirm'
  | 'round'
  | 'count'
  | 'fight'
  | 'powerup'
  | 'fireball'
  | 'dash'
  | 'step'
  | 'parry'
  | 'counter'
  | 'denied';

/**
 * Tiny Web Audio synthesizer for placeholder sound effects — no audio files needed.
 * Swap for recorded SFX later without touching game code (same play() calls).
 */
class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private _muted = false;

  get muted(): boolean {
    return this._muted;
  }

  /** Must be called from a user gesture (key press) before sound can play. */
  unlock(): void {
    if (!this.ctx) {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.45;
      this.master.connect(this.ctx.destination);

      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.setMuted(!this._muted);
    return this._muted;
  }

  /** Applies the saved sound setting (e.g. after logging in). */
  setMuted(muted: boolean): void {
    this._muted = muted;
    if (this.master) this.master.gain.value = this._muted ? 0 : 0.45;
  }

  play(name: Sfx): void {
    const ctx = this.ctx;
    if (!ctx || this._muted || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    switch (name) {
      case 'whoosh':
        this.noiseBurst('bandpass', 500, 2200, 1.4, 0.13, 0.22, t);
        break;
      case 'hitLight':
        this.noiseBurst('lowpass', 2600, 500, 0.8, 0.09, 0.55, t);
        this.tone('sine', 190, 70, 0.11, 0.7, t);
        break;
      case 'hitHeavy':
        this.noiseBurst('lowpass', 2000, 250, 0.8, 0.24, 0.75, t);
        this.tone('sine', 130, 38, 0.28, 0.95, t);
        this.tone('square', 95, 45, 0.12, 0.12, t);
        break;
      case 'block':
        this.tone('triangle', 1500, 900, 0.07, 0.3, t);
        this.noiseBurst('highpass', 3500, 2500, 0.7, 0.05, 0.3, t);
        break;
      case 'jump':
        this.tone('sine', 280, 520, 0.1, 0.12, t);
        break;
      case 'land':
        this.noiseBurst('lowpass', 700, 200, 0.7, 0.08, 0.25, t);
        break;
      case 'thud':
        this.tone('sine', 95, 35, 0.3, 0.75, t);
        this.noiseBurst('lowpass', 900, 120, 0.7, 0.25, 0.45, t);
        break;
      case 'ko':
        this.tone('sine', 80, 28, 1.1, 0.95, t);
        this.noiseBurst('lowpass', 1400, 90, 0.7, 0.9, 0.6, t);
        this.tone('sawtooth', 220, 55, 0.6, 0.08, t);
        break;
      case 'select':
        this.tone('square', 660, 660, 0.05, 0.08, t);
        break;
      case 'confirm':
        this.tone('square', 520, 1040, 0.14, 0.1, t);
        break;
      case 'round':
        this.tone('triangle', 880, 880, 0.45, 0.18, t);
        this.tone('triangle', 1320, 1320, 0.45, 0.1, t + 0.05);
        break;
      case 'count':
        // Countdown beat: a short, bright tick (lower than the ROUND chime).
        this.tone('triangle', 660, 660, 0.12, 0.16, t);
        this.noiseBurst('bandpass', 1800, 1800, 2, 0.05, 0.08, t);
        break;
      case 'fight':
        this.tone('sawtooth', 330, 660, 0.25, 0.12, t);
        this.noiseBurst('bandpass', 800, 3000, 1, 0.3, 0.2, t);
        break;
      case 'fireball':
        this.noiseBurst('lowpass', 2400, 300, 0.9, 0.38, 0.55, t);
        this.tone('sawtooth', 220, 70, 0.32, 0.14, t);
        this.tone('sine', 120, 50, 0.3, 0.5, t);
        break;
      case 'dash':
        this.noiseBurst('bandpass', 3000, 600, 1.6, 0.22, 0.4, t);
        this.tone('triangle', 900, 200, 0.18, 0.12, t);
        break;
      case 'step':
        // Quick scuff for movement dashes and evades.
        this.noiseBurst('bandpass', 1800, 700, 1.2, 0.1, 0.28, t);
        break;
      case 'parry':
        // Bright metallic "ting" with a short shimmer.
        this.tone('triangle', 2100, 2100, 0.22, 0.28, t);
        this.tone('sine', 3150, 3150, 0.3, 0.12, t + 0.01);
        this.noiseBurst('highpass', 5000, 3000, 0.8, 0.08, 0.3, t);
        break;
      case 'counter':
        this.tone('sawtooth', 600, 1200, 0.12, 0.1, t);
        this.tone('square', 900, 900, 0.1, 0.06, t + 0.08);
        break;
      case 'denied':
        this.tone('square', 140, 110, 0.12, 0.12, t);
        this.tone('square', 140, 110, 0.1, 0.1, t + 0.13);
        break;
      case 'powerup':
        this.noiseBurst('bandpass', 300, 2400, 1.2, 0.45, 0.3, t);
        this.tone('sawtooth', 110, 440, 0.4, 0.08, t);
        this.tone('sine', 70, 140, 0.35, 0.5, t);
        break;
    }
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, t: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noiseBurst(
    type: BiquadFilterType,
    f0: number,
    f1: number,
    q: number,
    dur: number,
    vol: number,
    t: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }
}

export const audio = new AudioManager();
