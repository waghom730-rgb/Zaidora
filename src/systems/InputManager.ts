import Phaser from 'phaser';
import type { FighterInput } from '../combat/types';

type Action = keyof FighterInput;
export type KeyBindings = Record<Action, number[]>;

const K = Phaser.Input.Keyboard.KeyCodes;

export const P1_KEYS: KeyBindings = {
  left: [K.A],
  right: [K.D],
  up: [K.W],
  block: [K.S],
  punch: [K.J],
  kick: [K.K],
  special: [K.L],
};

/**
 * Turns keyboard state into a FighterInput once per logic step.
 * Attack presses are captured by key events (not polled), so a tap is never missed
 * even if it starts and ends between two logic steps.
 */
export class InputManager {
  private readonly keys: Record<Action, Phaser.Input.Keyboard.Key[]>;
  private readonly pressed = { punch: false, kick: false, special: false };
  private readonly onPunch = (): void => {
    this.pressed.punch = true;
  };
  private readonly onKick = (): void => {
    this.pressed.kick = true;
  };
  private readonly onSpecial = (): void => {
    this.pressed.special = true;
  };

  constructor(scene: Phaser.Scene, bindings: KeyBindings = P1_KEYS) {
    const kb = scene.input.keyboard;
    if (!kb) throw new Error('Keyboard input is not available');
    const add = (codes: number[]) => codes.map((c) => kb.addKey(c, true, false));
    this.keys = {
      left: add(bindings.left),
      right: add(bindings.right),
      up: add(bindings.up),
      block: add(bindings.block),
      punch: add(bindings.punch),
      kick: add(bindings.kick),
      special: add(bindings.special),
    };
    this.keys.punch.forEach((k) => k.on('down', this.onPunch));
    this.keys.kick.forEach((k) => k.on('down', this.onKick));
    this.keys.special.forEach((k) => k.on('down', this.onSpecial));
  }

  poll(): FighterInput {
    const held = (a: Action) => this.keys[a].some((k) => k.isDown);
    const input: FighterInput = {
      left: held('left'),
      right: held('right'),
      up: held('up'),
      block: held('block'),
      punch: this.pressed.punch,
      kick: this.pressed.kick,
      special: this.pressed.special,
    };
    this.clear();
    return input;
  }

  clear(): void {
    this.pressed.punch = false;
    this.pressed.kick = false;
    this.pressed.special = false;
  }

  destroy(): void {
    this.keys.punch.forEach((k) => k.off('down', this.onPunch));
    this.keys.kick.forEach((k) => k.off('down', this.onKick));
    this.keys.special.forEach((k) => k.off('down', this.onSpecial));
  }
}
