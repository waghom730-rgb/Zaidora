import Phaser from 'phaser';
import type { FighterInput } from '../combat/types';

type Action = keyof FighterInput;
export type KeyBindings = Record<Action, number[]>;

/** Actions that are presses (captured by key events) rather than held state. */
const PRESS_ACTIONS = ['punch', 'kick', 'heavy', 'special', 'dash'] as const;
type PressAction = (typeof PRESS_ACTIONS)[number];
const HELD_ACTIONS = ['left', 'right', 'up', 'block'] as const;

const K = Phaser.Input.Keyboard.KeyCodes;

export const P1_KEYS: KeyBindings = {
  left: [K.A],
  right: [K.D],
  up: [K.W],
  block: [K.S],
  punch: [K.J],
  kick: [K.K],
  heavy: [K.U],
  special: [K.L],
  dash: [K.SPACE],
};

/**
 * Turns keyboard state into a FighterInput once per logic step.
 * Presses are captured by key events (not polled), so a tap is never missed
 * even if it starts and ends between two logic steps.
 */
export class InputManager {
  private readonly keys: Record<Action, Phaser.Input.Keyboard.Key[]>;
  private readonly pressed: Record<PressAction, boolean> = {
    punch: false,
    kick: false,
    heavy: false,
    special: false,
    dash: false,
  };
  private readonly handlers: Array<{ key: Phaser.Input.Keyboard.Key; fn: () => void }> = [];

  constructor(scene: Phaser.Scene, bindings: KeyBindings = P1_KEYS) {
    const kb = scene.input.keyboard;
    if (!kb) throw new Error('Keyboard input is not available');
    // enableCapture = true: Space etc. don't scroll the page.
    const add = (codes: number[]) => codes.map((c) => kb.addKey(c, true, false));
    this.keys = {} as Record<Action, Phaser.Input.Keyboard.Key[]>;
    for (const a of [...HELD_ACTIONS, ...PRESS_ACTIONS]) this.keys[a] = add(bindings[a]);
    for (const a of PRESS_ACTIONS) {
      const fn = (): void => {
        this.pressed[a] = true;
      };
      for (const key of this.keys[a]) {
        key.on('down', fn);
        this.handlers.push({ key, fn });
      }
    }
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
      heavy: this.pressed.heavy,
      special: this.pressed.special,
      dash: this.pressed.dash,
    };
    this.clear();
    return input;
  }

  clear(): void {
    for (const a of PRESS_ACTIONS) this.pressed[a] = false;
  }

  destroy(): void {
    for (const { key, fn } of this.handlers) key.off('down', fn);
    this.handlers.length = 0;
  }
}

/**
 * Registers a scene-level key handler that runs exactly once per key press.
 *
 * Phaser can re-process its keyboard queue within a frame, and its duplicate guard only
 * compares against the previous event — so when two different key events land in the same
 * frame (e.g. releasing a direction while pressing Esc), the second reaches 'keydown'
 * listeners twice. Keys registered with addKey are safe (they track isDown); scene-level
 * handlers for menus, pause, mute etc. must go through this.
 */
export function onKeyPress(scene: Phaser.Scene, handler: (e: KeyboardEvent) => void): void {
  const handled = new WeakSet<KeyboardEvent>();
  scene.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
    if (handled.has(e)) return;
    handled.add(e);
    handler(e);
  });
}
