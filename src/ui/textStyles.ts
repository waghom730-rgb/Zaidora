import type Phaser from 'phaser';

export const FONT = '"Arial Black", "Segoe UI Black", "Helvetica Neue", Impact, sans-serif';

export function textStyle(
  size: number,
  color = '#ffffff',
  opts: { stroke?: string; italic?: boolean; strokeRatio?: number } = {},
): Phaser.Types.GameObjects.Text.TextStyle {
  const { stroke = '#140c22', italic = true, strokeRatio = 0.14 } = opts;
  return {
    fontFamily: FONT,
    fontSize: `${size}px`,
    fontStyle: italic ? 'italic' : 'normal',
    color,
    stroke,
    strokeThickness: Math.max(2, Math.round(size * strokeRatio)),
    // Italic glyphs overhang their measured box; pad so they aren't clipped.
    padding: { x: Math.round(size * 0.18), y: Math.round(size * 0.08) },
    shadow: { offsetX: 0, offsetY: Math.max(2, size / 20), color: '#000000', blur: 0, fill: true, stroke: true },
  };
}
