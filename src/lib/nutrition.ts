/**
 * Energy balance engine: how many calories you burn, how many you should eat,
 * and how those split into macros.
 */

import { KCAL_PER_KG, rateKgPerWeek, type TrendPoint, round } from "./trend";
import type { ActivityLevel, GoalType, Sex } from "@/db/schema";

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2, // desk job, little deliberate movement
  light: 1.375, // training 1-3x/week
  moderate: 1.55, // training 3-5x/week
  very: 1.725, // training 6-7x/week
  extra: 1.9, // physical job on top of daily training
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Sedentary — desk job, little movement",
  light: "Light — training 1-3x per week",
  moderate: "Moderate — training 3-5x per week",
  very: "Very active — training 6-7x per week",
  extra: "Extra active — physical job plus training",
};

/**
 * Resting metabolic rate via Mifflin-St Jeor, the equation that validates
 * best against indirect calorimetry in the general population.
 */
export function bmr(params: {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  sex: Sex;
}): number {
  const { weightKg, heightCm, ageYears, sex } = params;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  return Math.round(base + (sex === "male" ? 5 : -161));
}

/** Formula-based maintenance calories, used until real data accumulates. */
export function tdeeFromFormula(bmrValue: number, activity: ActivityLevel): number {
  return Math.round(bmrValue * ACTIVITY_MULTIPLIERS[activity]);
}

export interface AdaptiveInput {
  /** Daily intake totals; days the user did not log are simply absent. */
  intakeByDate: Map<string, number>;
  trend: TrendPoint[];
  windowDays?: number;
}

export interface TdeeEstimate {
  value: number;
  /** "formula" until enough logged data exists to measure the real number. */
  method: "formula" | "adaptive" | "blended";
  /** 0-1. Drives how much the adaptive number is trusted over the formula. */
  confidence: number;
  daysOfData: number;
  loggedDays: number;
}

/**
 * Measures actual maintenance calories from observed intake and weight change.
 *
 * The formula-based number is a population average and can be off by 300+ kcal
 * for any individual. Energy balance gives the real one:
 *
 *     TDEE = average intake + (weight change in kcal / days)
 *
 * If you averaged 2200 kcal and lost 0.4 kg over 14 days, you burned roughly
 * 2200 + (0.4 * 7700 / 14) = 2420 kcal/day. That is measured, not assumed.
 *
 * The estimate is blended with the formula in proportion to how much data
 * backs it, so the number moves smoothly from "textbook guess" to "measured"
 * instead of lurching once a threshold is crossed.
 */
export function estimateAdaptiveTdee(
  formulaTdee: number,
  { intakeByDate, trend, windowDays = 28 }: AdaptiveInput,
): TdeeEstimate {
  const window = trend.slice(-windowDays);
  const daysOfData = window.length;

  const logged = window
    .map((p) => intakeByDate.get(p.date))
    .filter((v): v is number => typeof v === "number" && v > 0);

  // Below roughly two weeks of data the weight signal is still buried in
  // water-weight noise, so the measurement is not yet worth trusting.
  const MIN_DAYS = 14;
  const MIN_LOGGED = 10;

  if (daysOfData < MIN_DAYS || logged.length < MIN_LOGGED) {
    return {
      value: formulaTdee,
      method: "formula",
      confidence: 0,
      daysOfData,
      loggedDays: logged.length,
    };
  }

  const avgIntake = logged.reduce((a, b) => a + b, 0) / logged.length;
  const weeklyRate = rateKgPerWeek(window, windowDays);
  if (weeklyRate === null) {
    return {
      value: formulaTdee,
      method: "formula",
      confidence: 0,
      daysOfData,
      loggedDays: logged.length,
    };
  }

  const dailyKgChange = weeklyRate / 7;
  const measured = Math.round(avgIntake - dailyKgChange * KCAL_PER_KG);

  // Confidence grows with both the length of the window and how completely it
  // was logged — 28 fully logged days is the point of full trust.
  const coverage = logged.length / daysOfData;
  const span = Math.min(1, daysOfData / 28);
  const confidence = round(Math.max(0, Math.min(1, coverage * span)), 2);

  // A measurement wildly outside plausible physiology means the intake log is
  // incomplete rather than that the metabolism is extraordinary.
  const plausible = measured > formulaTdee * 0.6 && measured < formulaTdee * 1.6;
  if (!plausible) {
    return {
      value: formulaTdee,
      method: "formula",
      confidence: 0,
      daysOfData,
      loggedDays: logged.length,
    };
  }

  const blended = Math.round(formulaTdee * (1 - confidence) + measured * confidence);
  return {
    value: blended,
    method: confidence >= 0.85 ? "adaptive" : "blended",
    confidence,
    daysOfData,
    loggedDays: logged.length,
  };
}

export interface CalorieTarget {
  tdee: number;
  /** Intended daily deficit (negative) or surplus (positive). */
  adjustment: number;
  target: number;
  /** True when the safety floor overrode the requested rate. */
  floored: boolean;
  floor: number;
}

/**
 * Turns a goal rate in kg/week into a daily calorie target.
 *
 * A hard floor is applied. Very low intakes cost muscle and adherence, and a
 * 22-year-old lifting four times a week has no business eating 1200 kcal
 * because a slider was dragged to 1.5 kg/week. The floor is the larger of BMR
 * and a sex-based absolute minimum.
 */
export function calorieTarget(params: {
  tdee: number;
  bmr: number;
  goalType: GoalType;
  rateKgPerWeek: number;
  sex: Sex;
}): CalorieTarget {
  const { tdee, bmr: bmrValue, goalType, rateKgPerWeek: rate, sex } = params;

  const dailyDelta = (rate * KCAL_PER_KG) / 7;
  const adjustment =
    goalType === "cut" ? -dailyDelta : goalType === "bulk" ? dailyDelta : 0;

  const raw = Math.round(tdee + adjustment);
  const absoluteMin = sex === "male" ? 1500 : 1200;
  const floor = Math.max(Math.round(bmrValue), absoluteMin);

  const target = Math.max(raw, floor);
  return {
    tdee,
    adjustment: Math.round(adjustment),
    target,
    floored: target > raw,
    floor,
  };
}

export interface MacroTargets {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

/**
 * Splits a calorie target into macros.
 *
 * Protein and fat are set from bodyweight rather than as percentages, because
 * that is how the requirements actually scale — carbs then take the remainder
 * as training fuel. Protein is highest on a cut, where it does the most work
 * preserving muscle in a deficit.
 */
export function macroTargets(params: {
  kcal: number;
  weightKg: number;
  goalType: GoalType;
  proteinOverrideG?: number | null;
  fatOverrideG?: number | null;
}): MacroTargets {
  const { kcal, weightKg, goalType, proteinOverrideG, fatOverrideG } = params;

  const proteinPerKg = goalType === "cut" ? 2.0 : 1.8;
  const proteinG = proteinOverrideG ?? Math.round(weightKg * proteinPerKg);
  const fatG = fatOverrideG ?? Math.round(weightKg * 0.8);

  const remaining = kcal - proteinG * KCAL_PER_G.protein - fatG * KCAL_PER_G.fat;
  const carbsG = Math.max(0, Math.round(remaining / KCAL_PER_G.carbs));

  return { kcal, proteinG, carbsG, fatG };
}

/** Sensible default rate per goal, in kg/week. */
export function defaultRate(goalType: GoalType): number {
  // ~0.5 kg/week is about 0.5-0.7% of bodyweight for most people: fast enough
  // to see, slow enough to keep muscle. Lean gains are slower still.
  if (goalType === "cut") return 0.5;
  if (goalType === "bulk") return 0.25;
  return 0;
}

/**
 * Guard-rails on how aggressive a rate should be, scaled to bodyweight.
 * Losing more than ~1% of bodyweight per week reliably costs lean mass.
 */
export function maxSafeRate(goalType: GoalType, weightKg: number): number {
  if (goalType === "cut") return round(Math.min(1.0, weightKg * 0.01), 2);
  if (goalType === "bulk") return 0.5;
  return 0;
}
