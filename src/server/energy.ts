import "server-only";
import { and, eq, gte, sql as raw } from "drizzle-orm";
import { db } from "@/db";
import { bodyEntries, foodLogEntries, goals } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import { addDays, ageOn, todayInZone, type IsoDate } from "@/lib/dates";
import {
  bmr as calcBmr,
  calorieTarget,
  estimateAdaptiveTdee,
  macroTargets,
  tdeeFromFormula,
  type CalorieTarget,
  type MacroTargets,
  type TdeeEstimate,
} from "@/lib/nutrition";
import {
  buildTrend,
  currentTrendWeight,
  projectTarget,
  rateKgPerWeek,
  type Projection,
  type TrendPoint,
} from "@/lib/trend";

export type ActiveGoal = typeof goals.$inferSelect;

export interface EnergyState {
  goal: ActiveGoal | null;
  /** Full daily trend line, oldest first. */
  trend: TrendPoint[];
  /** Smoothed weight — the number to show the user. */
  trendWeightKg: number | null;
  /** Last raw scale reading. */
  latestScaleKg: number | null;
  /** Measured rate over the trailing 28 days, kg/week. */
  observedRateKgPerWeek: number | null;
  bmr: number | null;
  tdee: TdeeEstimate | null;
  target: CalorieTarget | null;
  macros: MacroTargets | null;
  projection: Projection | null;
  /** False until sex, birth date and height are known — the engine needs all three. */
  profileComplete: boolean;
}

/**
 * Assembles everything the app knows about a user's energy balance.
 *
 * Deliberately one function: targets, TDEE and trend are mutually dependent
 * (the target depends on TDEE, which depends on the trend, which is compared
 * against the goal), so computing them in separate places would mean either
 * duplicated queries or numbers that disagree between two screens.
 */
export async function loadEnergyState(
  user: SessionUser,
  on: IsoDate = todayInZone(user.timezone),
): Promise<EnergyState> {
  // A year of history is plenty for charts while staying a small result set.
  const since = addDays(on, -365);

  const [goalRows, weightRows, intakeRows] = await Promise.all([
    db
      .select()
      .from(goals)
      .where(and(eq(goals.userId, user.id), eq(goals.isActive, true)))
      .limit(1),
    db
      .select({ date: bodyEntries.date, weightKg: bodyEntries.weightKg })
      .from(bodyEntries)
      .where(and(eq(bodyEntries.userId, user.id), gte(bodyEntries.date, since)))
      .orderBy(bodyEntries.date),
    db
      .select({ date: foodLogEntries.date, kcal: raw<number>`sum(${foodLogEntries.kcal})::double precision` })
      .from(foodLogEntries)
      .where(and(eq(foodLogEntries.userId, user.id), gte(foodLogEntries.date, since)))
      .groupBy(foodLogEntries.date),
  ]);

  const goal = goalRows[0] ?? null;
  const weighIns = weightRows
    .filter((r): r is { date: string; weightKg: number } => r.weightKg !== null)
    .map((r) => ({ date: r.date, weightKg: r.weightKg }));

  const trend = buildTrend(weighIns);
  const trendWeightKg = currentTrendWeight(trend);
  const latestScaleKg = weighIns.length ? weighIns[weighIns.length - 1].weightKg : null;
  const observedRateKgPerWeek = rateKgPerWeek(trend);

  const profileComplete = Boolean(user.sex && user.birthDate && user.heightCm);

  // Without a profile or a single weigh-in there is nothing to compute from;
  // return the raw trend so charts still render and the UI can prompt for the
  // missing pieces rather than showing invented numbers.
  if (!profileComplete || trendWeightKg === null) {
    return {
      goal,
      trend,
      trendWeightKg,
      latestScaleKg,
      observedRateKgPerWeek,
      bmr: null,
      tdee: null,
      target: null,
      macros: null,
      projection: null,
      profileComplete,
    };
  }

  const bmrValue = calcBmr({
    weightKg: trendWeightKg,
    heightCm: user.heightCm!,
    ageYears: ageOn(user.birthDate!, on),
    sex: user.sex!,
  });

  const formulaTdee = tdeeFromFormula(bmrValue, user.activityLevel ?? "light");
  const intakeByDate = new Map(intakeRows.map((r) => [r.date, Number(r.kcal)] as const));
  const tdee = estimateAdaptiveTdee(formulaTdee, { intakeByDate, trend });

  const goalType = goal?.type ?? "maintain";
  const target = calorieTarget({
    tdee: tdee.value,
    bmr: bmrValue,
    goalType,
    rateKgPerWeek: goal?.rateKgPerWeek ?? 0,
    sex: user.sex!,
  });

  // An explicit override means the user has decided; the engine reports the
  // number it would have chosen but does not overrule them.
  const effectiveKcal = goal?.calorieOverride ?? target.target;
  const macros = macroTargets({
    kcal: effectiveKcal,
    weightKg: trendWeightKg,
    goalType,
    proteinOverrideG: goal?.proteinOverrideG,
    fatOverrideG: goal?.fatOverrideG,
  });

  const projection =
    goal?.targetWeightKg != null
      ? projectTarget(trendWeightKg, goal.targetWeightKg, observedRateKgPerWeek, on)
      : null;

  return {
    goal,
    trend,
    trendWeightKg,
    latestScaleKg,
    observedRateKgPerWeek,
    bmr: bmrValue,
    tdee,
    target: { ...target, target: effectiveKcal },
    macros,
    projection,
    profileComplete,
  };
}

export interface DayNutrition {
  date: IsoDate;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  entryCount: number;
}

/** Intake totals for a single day. */
export async function loadDayNutrition(userId: string, date: IsoDate): Promise<DayNutrition> {
  const [row] = await db
    .select({
      kcal: raw<number>`coalesce(sum(${foodLogEntries.kcal}), 0)::double precision`,
      proteinG: raw<number>`coalesce(sum(${foodLogEntries.proteinG}), 0)::double precision`,
      carbsG: raw<number>`coalesce(sum(${foodLogEntries.carbsG}), 0)::double precision`,
      fatG: raw<number>`coalesce(sum(${foodLogEntries.fatG}), 0)::double precision`,
      entryCount: raw<number>`count(*)::int`,
    })
    .from(foodLogEntries)
    .where(and(eq(foodLogEntries.userId, userId), eq(foodLogEntries.date, date)));

  return {
    date,
    kcal: Number(row?.kcal ?? 0),
    proteinG: Number(row?.proteinG ?? 0),
    carbsG: Number(row?.carbsG ?? 0),
    fatG: Number(row?.fatG ?? 0),
    entryCount: Number(row?.entryCount ?? 0),
  };
}

/** Intake totals per day across a range, for the weekly adherence view. */
export async function loadNutritionRange(
  userId: string,
  from: IsoDate,
  to: IsoDate,
): Promise<Map<IsoDate, DayNutrition>> {
  const rows = await db
    .select({
      date: foodLogEntries.date,
      kcal: raw<number>`sum(${foodLogEntries.kcal})::double precision`,
      proteinG: raw<number>`sum(${foodLogEntries.proteinG})::double precision`,
      carbsG: raw<number>`sum(${foodLogEntries.carbsG})::double precision`,
      fatG: raw<number>`sum(${foodLogEntries.fatG})::double precision`,
      entryCount: raw<number>`count(*)::int`,
    })
    .from(foodLogEntries)
    .where(
      and(
        eq(foodLogEntries.userId, userId),
        gte(foodLogEntries.date, from),
        raw`${foodLogEntries.date} <= ${to}`,
      ),
    )
    .groupBy(foodLogEntries.date);

  return new Map(
    rows.map((r) => [
      r.date,
      {
        date: r.date,
        kcal: Number(r.kcal),
        proteinG: Number(r.proteinG),
        carbsG: Number(r.carbsG),
        fatG: Number(r.fatG),
        entryCount: Number(r.entryCount),
      },
    ]),
  );
}
