/**
 * Weight trend analysis.
 *
 * Scale weight is noisy: water, glycogen, salt and gut content swing daily
 * weight by 1-2 kg, which dwarfs a 0.5 kg/week change you are actually trying
 * to see. Reading raw daily numbers is how people conclude a working diet has
 * "stopped" on day three. Everything user-facing therefore reports the
 * smoothed trend, not the last reading on the scale.
 */

import { addDays, daysBetween, type IsoDate } from "./dates";

/** Energy density of body mass change, kcal per kg. */
export const KCAL_PER_KG = 7700;

/**
 * Smoothing factor for the exponential moving average, in the spirit of
 * The Hacker's Diet. 0.12 gives a ~2 week half-life: responsive enough to show
 * a real change within days, damped enough to ignore a salty dinner.
 */
const EMA_ALPHA = 0.12;

export interface WeighIn {
  date: IsoDate;
  weightKg: number;
}

export interface TrendPoint {
  date: IsoDate;
  /** Raw scale reading, if the user weighed in that day. */
  actual: number | null;
  /** Smoothed trend value, carried forward across missed days. */
  trend: number;
}

/**
 * Builds a continuous daily trend line from sparse weigh-ins.
 *
 * Missed days are carried forward rather than interpolated: a skipped weigh-in
 * is missing information, not evidence of change, so the trend should hold
 * steady until the scale says otherwise.
 */
export function buildTrend(entries: WeighIn[]): TrendPoint[] {
  const clean = entries
    .filter((e) => Number.isFinite(e.weightKg) && e.weightKg > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (clean.length === 0) return [];

  const byDate = new Map(clean.map((e) => [e.date, e.weightKg] as const));
  const first = clean[0].date;
  const last = clean[clean.length - 1].date;

  const points: TrendPoint[] = [];
  let ema = clean[0].weightKg;

  for (let d = first; daysBetween(d, last) >= 0; d = addDays(d, 1)) {
    const actual = byDate.get(d) ?? null;
    if (actual !== null) ema = EMA_ALPHA * actual + (1 - EMA_ALPHA) * ema;
    points.push({ date: d, actual, trend: round(ema, 2) });
  }
  return points;
}

/**
 * Least-squares slope of the trend line over the trailing `windowDays`,
 * expressed as kg per week.
 *
 * Regression over the window beats "first minus last" because it uses every
 * point, so one freak reading at either end cannot dominate the answer.
 */
export function rateKgPerWeek(points: TrendPoint[], windowDays = 28): number | null {
  const window = points.slice(-windowDays);
  if (window.length < 7) return null;

  const n = window.length;
  const xs = window.map((_, i) => i);
  const ys = window.map((p) => p.trend);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return null;
  return round((num / den) * 7, 3); // slope is kg/day -> kg/week
}

/** Most recent smoothed weight, which is what the dashboard should show. */
export function currentTrendWeight(points: TrendPoint[]): number | null {
  return points.length ? points[points.length - 1].trend : null;
}

export interface Projection {
  /** Days until the target weight at the current observed rate. */
  days: number;
  date: IsoDate;
  weeks: number;
}

/**
 * Projects when the target weight is reached at the currently observed rate.
 *
 * Returns null when the rate is flat or pointing away from the target — an
 * honest "not on track" beats a made-up date years out.
 */
export function projectTarget(
  currentKg: number,
  targetKg: number,
  observedRateKgPerWeek: number | null,
  from: IsoDate,
): Projection | null {
  if (observedRateKgPerWeek === null) return null;

  const remaining = targetKg - currentKg;
  if (Math.abs(remaining) < 0.1) return { days: 0, date: from, weeks: 0 };

  // Rate and remaining distance must share a sign, else you are moving away.
  if (Math.sign(remaining) !== Math.sign(observedRateKgPerWeek)) return null;
  if (Math.abs(observedRateKgPerWeek) < 0.02) return null; // effectively a plateau

  const weeks = remaining / observedRateKgPerWeek;
  if (!Number.isFinite(weeks) || weeks > 260) return null; // beyond 5 years is noise

  const days = Math.ceil(weeks * 7);
  return { days, weeks: round(weeks, 1), date: addDays(from, days) };
}

export function round(n: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
