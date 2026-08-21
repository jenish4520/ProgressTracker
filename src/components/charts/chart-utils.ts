/** Shared geometry helpers for the inline SVG charts. */

export interface Scale {
  min: number;
  max: number;
  /** Maps a data value to a y pixel inside the plot area. */
  y: (v: number) => number;
}

/**
 * Builds a y scale with a little headroom.
 *
 * Bodyweight charts deliberately do NOT start at zero: the interesting range is
 * a couple of kilos, and a zero baseline would flatten a real 4 kg loss into a
 * line that looks like nothing happened.
 */
export function niceScale(values: number[], top: number, bottom: number, padRatio = 0.12): Scale {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return { min: 0, max: 1, y: () => bottom };

  let min = Math.min(...finite);
  let max = Math.max(...finite);
  const span = max - min;
  const pad = span === 0 ? Math.max(1, Math.abs(max) * 0.05) : span * padRatio;

  min -= pad;
  max += pad;

  const range = max - min || 1;
  return { min, max, y: (v) => bottom - ((v - min) / range) * (bottom - top) };
}

/** Scale anchored at zero — correct for bar charts of counts and totals. */
export function zeroScale(values: number[], top: number, bottom: number): Scale {
  const max = Math.max(1, ...values.filter(Number.isFinite));
  const headroom = max * 1.15;
  return { min: 0, max: headroom, y: (v) => bottom - (v / headroom) * (bottom - top) };
}

/** Evenly spaced x positions across the plot area. */
export function xAt(index: number, count: number, left: number, right: number): number {
  if (count <= 1) return (left + right) / 2;
  return left + (index / (count - 1)) * (right - left);
}

/** Roughly `count` round tick values spanning a scale. */
export function ticks(scale: Scale, count = 4): number[] {
  const raw = (scale.max - scale.min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;

  const out: number[] = [];
  for (let v = Math.ceil(scale.min / step) * step; v <= scale.max; v += step) {
    out.push(Math.round(v * 1000) / 1000);
  }
  return out;
}

/** Smooth-ish path through points; straight segments keep the data honest. */
export function linePath(points: { x: number; y: number }[]): string {
  if (!points.length) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
}

/**
 * Bar path with rounded top corners and a square base.
 *
 * A rect with `rx` rounds all four corners, which visually detaches the bar
 * from its axis and turns a magnitude into a floating pill. Only the data-end
 * should be rounded; the baseline end stays flat because that is where the
 * value is measured from.
 */
export function barPath(x: number, y: number, width: number, baseline: number, radius = 4): string {
  const height = Math.max(0, baseline - y);
  if (height <= 0.5) return "";
  const r = Math.min(radius, width / 2, height);
  return [
    `M${x},${baseline}`,
    `L${x},${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `L${x + width - r},${y}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `L${x + width},${baseline}`,
    "Z",
  ].join(" ");
}
