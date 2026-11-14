import Phaser from 'phaser';
import { profile } from '../services/profile';
import { audio, type VolumeKind } from '../systems/AudioManager';
import { textStyle } from './textStyles';

type Row = VolumeKind | 'mute';
const ROWS: { kind: Row; label: string }[] = [
  { kind: 'master', label: 'MASTER' },
  { kind: 'music', label: 'MUSIC' },
  { kind: 'sfx', label: 'EFFECTS' },
  { kind: 'mute', label: 'SOUND' },
];
const STEP = 0.1;
const BAR_W = 250;
const ROW_H = 44;

/**
 * Saves sound on/off with the player's account or guest save. Skipped when nobody is signed in
 * (the sign-in screen): saving then would write a blank save over the guest's progress.
 */
export function saveMuteSetting(): void {
  if (profile.kind === 'none') return;
  void profile.saveSettings({ muted: audio.muted });
}

/** Mute/unmute from a menu, saving the choice. */
export function toggleMuteAndSave(): void {
  audio.toggleMute();
  saveMuteSetting();
}

/**
 * Volume sliders (master, music, effects) and the sound on/off switch, driven by the keyboard:
 * W/S or ↑/↓ choose a row, A/D or ←/→ change it, Enter flips the switch. Used by the main menu
 * and the pause screen; changes apply immediately and are remembered on this device.
 */
export class AudioPanel {
  readonly container: Phaser.GameObjects.Container;
  private selected = 0;
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private readonly values: Phaser.GameObjects.Text[] = [];
  private readonly bars: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    const left = -BAR_W / 2 - 150;
    const items: Phaser.GameObjects.GameObject[] = [];
    this.bars = scene.add.graphics();
    items.push(this.bars);
    ROWS.forEach((row, i) => {
      const label = scene.add.text(left, i * ROW_H, row.label, textStyle(22, '#ffffff', { italic: false })).setOrigin(0, 0.5);
      const value = scene.add.text(BAR_W / 2 + 70, i * ROW_H, '', textStyle(20, '#ffffff', { italic: false })).setOrigin(0.5);
      this.labels.push(label);
      this.values.push(value);
      items.push(label, value);
    });
    const hint = scene.add
      .text(0, ROWS.length * ROW_H + 6, 'W/S choose    A/D adjust    M sound on/off', textStyle(14, '#9a90b0', { italic: false }))
      .setOrigin(0.5, 0);
    items.push(hint);
    this.container = scene.add.container(x, y, items);

    const off = audio.onChange(() => this.refresh());
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
    this.refresh();
  }

  /** Handles a key press; returns false for keys the panel doesn't use. */
  handleKey(code: string): boolean {
    switch (code) {
      case 'KeyW':
      case 'ArrowUp':
        this.selected = (this.selected + ROWS.length - 1) % ROWS.length;
        audio.play('select');
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.selected = (this.selected + 1) % ROWS.length;
        audio.play('select');
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.adjust(-1);
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.adjust(1);
        break;
      case 'Enter':
      case 'Space':
      case 'KeyJ':
        if (ROWS[this.selected].kind !== 'mute') return false;
        toggleMuteAndSave();
        break;
      default:
        return false;
    }
    this.refresh();
    return true;
  }

  private adjust(dir: 1 | -1): void {
    const kind = ROWS[this.selected].kind;
    if (kind === 'mute') {
      toggleMuteAndSave();
      return;
    }
    const v = audio.volumes[kind];
    const next = Math.min(1, Math.max(0, Math.round((v + dir * STEP) * 10) / 10));
    if (next === v) return;
    audio.setVolume(kind, next);
    // Let the player hear the new level: a hit for effects, a menu tick otherwise (the music is already playing).
    audio.play(kind === 'sfx' ? 'punchLight' : 'select');
  }

  setVisible(visible: boolean): this {
    this.container.setVisible(visible);
    return this;
  }

  refresh(): void {
    const s = audio.volumes;
    const g = this.bars;
    g.clear();
    ROWS.forEach((row, i) => {
      const on = i === this.selected;
      this.labels[i].setColor(on ? '#ffd23f' : '#ffffff').setText(`${on ? '▶ ' : '   '}${row.label}`);
      if (row.kind === 'mute') {
        this.values[i].setText(s.muted ? 'OFF' : 'ON').setColor(s.muted ? '#ff8a7a' : '#7dffb0');
        return;
      }
      const v = s[row.kind];
      const y = i * ROW_H - 7;
      g.fillStyle(0x000000, 0.55).fillRect(-BAR_W / 2, y, BAR_W, 14);
      g.fillStyle(on ? 0xffd23f : 0xc8b6ff, s.muted ? 0.35 : 1).fillRect(-BAR_W / 2, y, BAR_W * v, 14);
      g.lineStyle(2, on ? 0xffd23f : 0x6b5f86, 1).strokeRect(-BAR_W / 2, y, BAR_W, 14);
      this.values[i].setText(`${Math.round(v * 100)}%`).setColor(on ? '#ffd23f' : '#ffffff');
    });
  }
}
