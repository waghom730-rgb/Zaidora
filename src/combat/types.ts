/** Axis-aligned box in world space. (x, y) is the top-left corner. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * What a controller (keyboard or AI) wants a fighter to do this step.
 * Directions and block are "held"; punch/kick are presses (true only on the step they happen).
 */
export interface FighterInput {
  left: boolean;
  right: boolean;
  up: boolean;
  block: boolean;
  punch: boolean;
  kick: boolean;
  special: boolean;
}

export const EMPTY_INPUT: Readonly<FighterInput> = Object.freeze({
  left: false,
  right: false,
  up: false,
  block: false,
  punch: false,
  kick: false,
  special: false,
});

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Center of the intersection of two overlapping boxes — where hit sparks spawn. */
export function overlapCenter(a: Box, b: Box): { x: number; y: number } {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}
