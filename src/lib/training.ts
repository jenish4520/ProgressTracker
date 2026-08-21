/**
 * Training analysis: how much work was done, how strong you are getting, and
 * roughly what it cost in calories.
 */

import { round } from "./trend";

export interface SetLike {
  exerciseId: string;
  reps: number | null;
  weightKg: number | null;
  isWarmup: boolean;
  completed: boolean;
  durationSeconds: number | null;
  distanceM: number | null;
}

export interface ExerciseMeta {
  id: string;
  name: string;
  kind: "strength" | "cardio";
  met: number;
  isBodyweight: boolean;
}

/**
 * Total tonnage: reps x weight, summed over working sets.
 *
 * Warm-ups are excluded deliberately. They scale with how cautious you felt
 * that day, so counting them makes week-to-week volume comparisons noise.
 */
export function totalVolumeKg(sets: SetLike[]): number {
  return round(
    sets
      .filter((s) => s.completed && !s.isWarmup && s.reps && s.weightKg)
      .reduce((sum, s) => sum + s.reps! * s.weightKg!, 0),
    1,
  );
}

export function totalReps(sets: SetLike[]): number {
  return sets
    .filter((s) => s.completed && !s.isWarmup)
    .reduce((sum, s) => sum + (s.reps ?? 0), 0);
}

export function workingSetCount(sets: SetLike[]): number {
  return sets.filter((s) => s.completed && !s.isWarmup).length;
}

/**
 * Estimated one-rep max via the Epley formula.
 *
 * Accuracy degrades badly above ~12 reps — a 20-rep set is limited by
 * conditioning, not maximal strength — so high-rep sets are not estimated
 * rather than reported as a confident but wrong number.
 */
export function estimateOneRepMax(weightKg: number, reps: number): number | null {
  if (!(weightKg > 0) || !(reps > 0) || reps > 12) return null;
  if (reps === 1) return round(weightKg, 1);
  return round(weightKg * (1 + reps / 30), 1);
}

/** Best estimated 1RM across a group of sets, used for personal records. */
export function bestOneRepMax(sets: SetLike[]): number | null {
  let best: number | null = null;
  for (const s of sets) {
    if (!s.completed || s.isWarmup || !s.reps || !s.weightKg) continue;
    const e1rm = estimateOneRepMax(s.weightKg, s.reps);
    if (e1rm !== null && (best === null || e1rm > best)) best = e1rm;
  }
  return best;
}

/**
 * MET fallback for resistance training when an exercise has no value set.
 * 5.0 sits at "vigorous effort, free weights" in the Compendium of Physical
 * Activities.
 */
const DEFAULT_STRENGTH_MET = 5.0;

/** A forgotten "finish workout" tap should not bill you for a 9 hour session. */
const MAX_SESSION_MINUTES = 240;

export interface BurnInput {
  sets: SetLike[];
  exercises: Map<string, ExerciseMeta>;
  bodyweightKg: number;
  sessionMinutes: number | null;
}

export interface BurnEstimate {
  kcal: number;
  strengthMinutes: number;
  cardioMinutes: number;
  averageMet: number;
}

/**
 * Estimates session energy cost from MET values.
 *
 *     kcal/min = MET x 3.5 x bodyweight(kg) / 200
 *
 * Cardio sets carry their own logged duration and MET. Whatever session time
 * is left over is attributed to resistance work at a set-count-weighted
 * average MET.
 *
 * This is an estimate, and MET tables are population averages — treat the
 * number as a consistent relative signal between your own sessions, not as a
 * calorie budget to eat back.
 */
export function estimateCaloriesBurned({
  sets,
  exercises,
  bodyweightKg,
  sessionMinutes,
}: BurnInput): BurnEstimate {
  const kcalPerMinute = (met: number) => (met * 3.5 * bodyweightKg) / 200;

  let cardioMinutes = 0;
  let cardioKcal = 0;
  let strengthSetCount = 0;
  let strengthMetSum = 0;

  for (const s of sets) {
    if (!s.completed) continue;
    const meta = exercises.get(s.exerciseId);
    const met = meta?.met ?? DEFAULT_STRENGTH_MET;

    if (meta?.kind === "cardio" && s.durationSeconds) {
      const minutes = s.durationSeconds / 60;
      cardioMinutes += minutes;
      cardioKcal += kcalPerMinute(met) * minutes;
    } else if (meta?.kind !== "cardio") {
      strengthSetCount++;
      strengthMetSum += met;
    }
  }

  const capped = Math.min(sessionMinutes ?? 0, MAX_SESSION_MINUTES);
  // With no clock running, fall back to a conservative 3 min per working set
  // (the set itself plus its rest).
  const assumed = strengthSetCount * 3;
  const totalMinutes = capped > 0 ? capped : cardioMinutes + assumed;
  const strengthMinutes = Math.max(0, totalMinutes - cardioMinutes);

  const strengthMet =
    strengthSetCount > 0 ? strengthMetSum / strengthSetCount : DEFAULT_STRENGTH_MET;
  const strengthKcal = kcalPerMinute(strengthMet) * strengthMinutes;

  const kcal = Math.round(cardioKcal + strengthKcal);
  const averageMet =
    totalMinutes > 0
      ? round((strengthMet * strengthMinutes + avgCardioMet(sets, exercises) * cardioMinutes) / totalMinutes, 1)
      : strengthMet;

  return {
    kcal,
    strengthMinutes: Math.round(strengthMinutes),
    cardioMinutes: Math.round(cardioMinutes),
    averageMet,
  };
}

function avgCardioMet(sets: SetLike[], exercises: Map<string, ExerciseMeta>): number {
  const mets = sets
    .filter((s) => s.completed && exercises.get(s.exerciseId)?.kind === "cardio")
    .map((s) => exercises.get(s.exerciseId)!.met);
  return mets.length ? mets.reduce((a, b) => a + b, 0) / mets.length : 0;
}

/** Human-readable duration, e.g. "1h 12m" or "48m". */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${total}s`;
}
