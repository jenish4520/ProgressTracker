import { test } from "node:test";
import assert from "node:assert/strict";

import { bmr, tdeeFromFormula, calorieTarget, macroTargets, estimateAdaptiveTdee, maxSafeRate } from "../src/lib/nutrition.ts";
import { buildTrend, rateKgPerWeek, projectTarget, currentTrendWeight, KCAL_PER_KG } from "../src/lib/trend.ts";
import { estimateOneRepMax, totalVolumeKg, estimateCaloriesBurned, workingSetCount, type SetLike, type ExerciseMeta } from "../src/lib/training.ts";
import { addDays, daysBetween, ageOn, toIsoDate, dateRange } from "../src/lib/dates.ts";
import { displayWeight, storeWeight, formatRate } from "../src/lib/units.ts";

/* ---------------------------- energy engine ---------------------------- */

test("BMR matches Mifflin-St Jeor by hand", () => {
  // 10*80 + 6.25*180 - 5*22 + 5 = 1820
  assert.equal(bmr({ weightKg: 80, heightCm: 180, ageYears: 22, sex: "male" }), 1820);
  // female offset is -161
  assert.equal(bmr({ weightKg: 65, heightCm: 168, ageYears: 30, sex: "female" }), 10 * 65 + 6.25 * 168 - 5 * 30 - 161);
});

test("a 0.5 kg/week cut produces a ~550 kcal daily deficit", () => {
  const b = bmr({ weightKg: 80, heightCm: 180, ageYears: 22, sex: "male" });
  const tdee = tdeeFromFormula(b, "light");
  const t = calorieTarget({ tdee, bmr: b, goalType: "cut", rateKgPerWeek: 0.5, sex: "male" });

  assert.equal(t.adjustment, -550); // 0.5 * 7700 / 7
  assert.equal(t.target, tdee - 550);
  assert.equal(t.floored, false);
});

test("an unsafely aggressive cut is clamped to the floor, and says so", () => {
  const b = bmr({ weightKg: 80, heightCm: 180, ageYears: 22, sex: "male" });
  const tdee = tdeeFromFormula(b, "light");
  const t = calorieTarget({ tdee, bmr: b, goalType: "cut", rateKgPerWeek: 1.5, sex: "male" });

  assert.equal(t.floored, true, "must flag that the requested rate was overridden");
  assert.equal(t.target, b, "floor is BMR here, which exceeds the 1500 absolute minimum");
  assert.ok(t.target > tdee - 1650, "must not hand back a starvation target");
});

test("bulk adds a surplus and maintain changes nothing", () => {
  const args = { tdee: 2500, bmr: 1800, sex: "male" as const };
  assert.equal(calorieTarget({ ...args, goalType: "bulk", rateKgPerWeek: 0.25 }).target, 2500 + 275);
  assert.equal(calorieTarget({ ...args, goalType: "maintain", rateKgPerWeek: 0 }).target, 2500);
});

test("macros hit the calorie target and scale protein up on a cut", () => {
  const cut = macroTargets({ kcal: 2000, weightKg: 80, goalType: "cut" });
  const bulk = macroTargets({ kcal: 2000, weightKg: 80, goalType: "bulk" });

  assert.equal(cut.proteinG, 160); // 2.0 g/kg
  assert.equal(bulk.proteinG, 144); // 1.8 g/kg
  assert.ok(cut.proteinG > bulk.proteinG, "cutting should prioritise protein");

  const kcalFromMacros = cut.proteinG * 4 + cut.carbsG * 4 + cut.fatG * 9;
  assert.ok(Math.abs(kcalFromMacros - 2000) <= 4, `macros should reconstruct the target, got ${kcalFromMacros}`);
});

test("safe-rate ceiling scales with bodyweight", () => {
  assert.equal(maxSafeRate("cut", 60), 0.6); // 1% of bodyweight
  assert.equal(maxSafeRate("cut", 120), 1.0); // hard cap
});

/* --------------------------- adaptive TDEE ----------------------------- */

test("adaptive TDEE falls back to the formula without enough data", () => {
  const trend = buildTrend([
    { date: "2026-08-01", weightKg: 80 },
    { date: "2026-08-05", weightKg: 79.8 },
  ]);
  const est = estimateAdaptiveTdee(2500, { intakeByDate: new Map(), trend });

  assert.equal(est.method, "formula");
  assert.equal(est.value, 2500);
  assert.equal(est.confidence, 0);
});

test("adaptive TDEE measures a real burn above logged intake when weight falls", () => {
  // 28 days eating 2200 kcal, losing 0.8 kg. True TDEE is about
  // 2200 + (0.8 * 7700 / 28) = 2420 kcal.
  const start = "2026-06-01";
  const entries = [];
  const intakeByDate = new Map<string, number>();
  for (let i = 0; i < 28; i++) {
    const date = addDays(start, i);
    entries.push({ date, weightKg: 80 - (0.8 * i) / 27 });
    intakeByDate.set(date, 2200);
  }
  const trend = buildTrend(entries);
  const est = estimateAdaptiveTdee(2000, { intakeByDate, trend });

  assert.equal(est.method, "adaptive");
  assert.equal(est.confidence, 1);
  assert.ok(est.value > 2200, `measured TDEE must exceed intake while losing weight, got ${est.value}`);
  assert.ok(est.value > 2000, "must move away from the wrong formula estimate");
  assert.ok(Math.abs(est.value - 2420) < 120, `expected roughly 2420, got ${est.value}`);
});

test("adaptive TDEE rejects a physiologically implausible measurement", () => {
  // Logging only 500 kcal/day while holding weight steady means the food log
  // is incomplete, not that the user burns 500 kcal a day.
  const start = "2026-06-01";
  const entries = [];
  const intakeByDate = new Map<string, number>();
  for (let i = 0; i < 28; i++) {
    const date = addDays(start, i);
    entries.push({ date, weightKg: 80 });
    intakeByDate.set(date, 500);
  }
  const est = estimateAdaptiveTdee(2500, { intakeByDate, trend: buildTrend(entries) });
  assert.equal(est.method, "formula", "should refuse the absurd measurement");
  assert.equal(est.value, 2500);
});

/* ------------------------------- trend --------------------------------- */

test("trend smooths daily water-weight noise", () => {
  const noisy = [80.0, 81.4, 79.2, 80.8, 79.6, 80.9, 79.4].map((w, i) => ({
    date: addDays("2026-07-01", i),
    weightKg: w,
  }));
  const points = buildTrend(noisy);
  const trendValues = points.map((p) => p.trend);
  const spread = Math.max(...trendValues) - Math.min(...trendValues);

  assert.equal(points.length, 7);
  assert.ok(spread < 1.0, `trend should be far calmer than the 2.2 kg raw spread, got ${spread.toFixed(2)}`);
});

test("trend carries forward across missed weigh-ins without inventing data", () => {
  const points = buildTrend([
    { date: "2026-07-01", weightKg: 80 },
    { date: "2026-07-05", weightKg: 79 },
  ]);
  assert.equal(points.length, 5, "gap days must be filled so the chart has no holes");
  assert.equal(points[1].actual, null, "a missed day has no scale reading");
  assert.equal(points[1].trend, points[0].trend, "trend holds steady rather than drifting");
});

test("rate is reported in kg per week and needs a week of data", () => {
  const losing = Array.from({ length: 30 }, (_, i) => ({
    date: addDays("2026-06-01", i),
    weightKg: 85 - i * 0.07, // ~0.49 kg/week
  }));
  const rate = rateKgPerWeek(buildTrend(losing));
  assert.ok(rate !== null && rate < 0, "losing weight must report a negative rate");
  assert.ok(Math.abs(rate!) > 0.2 && Math.abs(rate!) < 0.6, `expected roughly -0.5, got ${rate}`);

  assert.equal(rateKgPerWeek(buildTrend(losing.slice(0, 3))), null, "3 days is not a trend");
});

test("projection only predicts a date when actually heading towards the goal", () => {
  const onTrack = projectTarget(80, 75, -0.5, "2026-08-21");
  assert.ok(onTrack, "should project when moving toward the target");
  assert.equal(onTrack!.weeks, 10);
  assert.equal(onTrack!.date, addDays("2026-08-21", 70));

  assert.equal(projectTarget(80, 75, 0.3, "2026-08-21"), null, "gaining while trying to cut has no ETA");
  assert.equal(projectTarget(80, 75, 0.0, "2026-08-21"), null, "a plateau has no ETA");
  assert.equal(projectTarget(80, 75, null, "2026-08-21"), null, "no rate means no ETA");
});

test("energy constant is the standard 7700 kcal per kg", () => {
  assert.equal(KCAL_PER_KG, 7700);
  assert.equal(currentTrendWeight([]), null);
});

/* ------------------------------ training ------------------------------- */

test("estimated 1RM refuses rep ranges where the formula breaks down", () => {
  assert.equal(estimateOneRepMax(100, 1), 100);
  assert.equal(estimateOneRepMax(100, 5), 116.7); // 100 * (1 + 5/30)
  assert.equal(estimateOneRepMax(100, 20), null, "20-rep sets measure conditioning, not max strength");
  assert.equal(estimateOneRepMax(0, 5), null);
});

test("volume counts working sets only", () => {
  const sets: SetLike[] = [
    { exerciseId: "a", reps: 10, weightKg: 60, isWarmup: true, completed: true, durationSeconds: null, distanceM: null },
    { exerciseId: "a", reps: 8, weightKg: 100, isWarmup: false, completed: true, durationSeconds: null, distanceM: null },
    { exerciseId: "a", reps: 8, weightKg: 100, isWarmup: false, completed: false, durationSeconds: null, distanceM: null },
  ];
  assert.equal(totalVolumeKg(sets), 800, "only the one completed working set counts");
  assert.equal(workingSetCount(sets), 1);
});

test("calories burned follows the MET formula", () => {
  const exercises = new Map<string, ExerciseMeta>([
    ["a", { id: "a", name: "Squat", kind: "strength", met: 5, isBodyweight: false }],
  ]);
  const sets: SetLike[] = Array.from({ length: 5 }, () => ({
    exerciseId: "a", reps: 8, weightKg: 100, isWarmup: false, completed: true, durationSeconds: null, distanceM: null,
  }));

  // 5 MET * 3.5 * 80 kg / 200 = 7 kcal/min, over 60 min = 420 kcal
  const est = estimateCaloriesBurned({ sets, exercises, bodyweightKg: 80, sessionMinutes: 60 });
  assert.equal(est.kcal, 420);

  // A heavier person burns more for the identical session.
  const heavier = estimateCaloriesBurned({ sets, exercises, bodyweightKg: 100, sessionMinutes: 60 });
  assert.ok(heavier.kcal > est.kcal);
});

test("a forgotten timer cannot bill a nine-hour session", () => {
  const exercises = new Map<string, ExerciseMeta>([
    ["a", { id: "a", name: "Squat", kind: "strength", met: 5, isBodyweight: false }],
  ]);
  const sets: SetLike[] = [
    { exerciseId: "a", reps: 8, weightKg: 100, isWarmup: false, completed: true, durationSeconds: null, distanceM: null },
  ];
  const est = estimateCaloriesBurned({ sets, exercises, bodyweightKg: 80, sessionMinutes: 540 });
  assert.equal(est.strengthMinutes, 240, "capped at the 4 hour ceiling");
});

/* -------------------------------- dates -------------------------------- */

test("date helpers survive month and year boundaries", () => {
  assert.equal(addDays("2026-01-31", 1), "2026-02-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(daysBetween("2026-01-01", "2026-12-31"), 364);
  assert.equal(dateRange("2026-01-01", "2026-01-05").length, 5);
});

test("date helpers survive the European DST switch", () => {
  // Clocks go forward on 29 March 2026 in Germany; a naive UTC-hours
  // implementation loses or repeats a day here.
  assert.equal(addDays("2026-03-28", 1), "2026-03-29");
  assert.equal(addDays("2026-03-29", 1), "2026-03-30");
  assert.equal(daysBetween("2026-03-28", "2026-03-30"), 2);
  assert.equal(addDays("2026-10-24", 3), "2026-10-27"); // clocks go back 25 Oct
});

test("local date is used rather than UTC", () => {
  // 00:30 local must file under today, which toISOString() would get wrong for
  // anyone east of Greenwich.
  const justAfterMidnight = new Date(2026, 7, 21, 0, 30);
  assert.equal(toIsoDate(justAfterMidnight), "2026-08-21");
});

test("age accounts for whether the birthday has happened yet", () => {
  assert.equal(ageOn("2004-01-15", "2026-08-21"), 22);
  assert.equal(ageOn("2004-12-15", "2026-08-21"), 21, "birthday later this year");
  assert.equal(ageOn("2004-08-21", "2026-08-21"), 22, "birthday today");
});

/* -------------------------------- units -------------------------------- */

test("weights round-trip through imperial without drift", () => {
  assert.equal(displayWeight(100, "metric"), 100);
  assert.equal(displayWeight(100, "imperial"), 220.5);
  assert.ok(Math.abs(storeWeight(displayWeight(82.5, "imperial"), "imperial") - 82.5) < 0.01);
  assert.equal(formatRate(-0.42, "metric"), "-0.42 kg/week");
  assert.equal(formatRate(null, "metric"), "—");
});
