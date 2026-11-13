// Secondary-motion ropes per character (headband tails, ponytail, scarf, belt/sash tails).
// Pure data + options so the animation tests can simulate them without Phaser.
import type { FighterDef } from '../entities/fighterDefs';
import type { RopeOptions } from './Rope';
import type { V } from './skeleton';

export interface RopeSpec {
  space: 'head' | 'torso';
  anchor: V;
  front: boolean;
  w0: number;
  w1: number;
  color: number;
  opts: RopeOptions;
}

export const css = (c: string): number => parseInt(c.replace('#', ''), 16);

export function ropeSpecs(def: FighterDef): RopeSpec[] {
  const L = def.look;
  if (def.id === 'kaen') {
    const band = css(L.accent);
    const belt = css(L.belt);
    const tail = (length: number, droop: number): RopeOptions => ({
      segments: 5,
      length,
      gravity: 0.16,
      damping: 0.9,
      stiffness: 0.07,
      rest: { x: -1, y: droop },
      flutter: 0.9,
    });
    const beltTail = (length: number, x: number): RopeOptions => ({
      segments: 3,
      length,
      gravity: 0.5,
      damping: 0.85,
      stiffness: 0.12,
      rest: { x, y: 1 },
      flutter: 0.15,
    });
    return [
      { space: 'head', anchor: { x: -16, y: -41 }, front: false, w0: 5, w1: 2.5, color: band, opts: tail(36, 0.25) },
      { space: 'head', anchor: { x: -16, y: -40 }, front: false, w0: 5, w1: 2.5, color: band, opts: tail(28, 0.6) },
      { space: 'torso', anchor: { x: 15, y: 2 }, front: true, w0: 5, w1: 4, color: belt, opts: beltTail(20, 0.15) },
      { space: 'torso', anchor: { x: 14, y: 2 }, front: true, w0: 5, w1: 4, color: belt, opts: beltTail(15, -0.1) },
    ];
  }
  const hair = css(L.hair[1]);
  const scarf = css(L.accent);
  const sash = css(L.belt);
  const scarfTail = (length: number, droop: number): RopeOptions => ({
    segments: 8,
    length,
    gravity: 0.2,
    damping: 0.92,
    stiffness: 0.035,
    rest: { x: -1, y: droop },
    flutter: 1.3,
  });
  return [
    {
      space: 'torso',
      anchor: { x: -11, y: -62 },
      front: false,
      w0: 10,
      w1: 6,
      color: scarf,
      opts: scarfTail(74, 0.3),
    },
    {
      space: 'torso',
      anchor: { x: -11, y: -60 },
      front: false,
      w0: 9,
      w1: 5,
      color: scarf,
      opts: scarfTail(58, 0.55),
    },
    {
      space: 'head',
      anchor: { x: -17, y: -36 },
      front: false,
      w0: 13,
      w1: 2,
      color: hair,
      opts: { segments: 7, length: 50, gravity: 0.45, damping: 0.9, stiffness: 0.06, rest: { x: -0.75, y: 0.7 }, flutter: 0.7 },
    },
    {
      space: 'torso',
      anchor: { x: 15, y: 2 },
      front: true,
      w0: 6,
      w1: 4,
      color: sash,
      opts: { segments: 3, length: 22, gravity: 0.5, damping: 0.85, stiffness: 0.12, rest: { x: 0.15, y: 1 }, flutter: 0.2 },
    },
  ];
}

