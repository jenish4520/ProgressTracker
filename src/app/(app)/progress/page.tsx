import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadEnergyState, loadNutritionRange } from "@/server/energy";
import { listWorkouts } from "@/server/workouts";
import { addDays, dateRange, todayInZone } from "@/lib/dates";
import { displayWeight, formatRate, weightUnit } from "@/lib/units";
import { ACTIVITY_LABELS } from "@/lib/nutrition";
import { totalVolumeKg, type SetLike } from "@/lib/training";
import CalorieBars from "@/components/charts/CalorieBars";
import WeightTrendChart from "@/components/charts/WeightTrendChart";
import StatTile from "@/components/StatTile";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";
export const metadata = { title: "Progress · ProgressTracker" };

export default async function ProgressPage() {
  const user = await requireUser();
  const day = todayInZone(user.timezone);
  const from = addDays(day, -29);

  const [state, range, workouts] = await Promise.all([
    loadEnergyState(user, day),
    loadNutritionRange(user.id, from, day),
    listWorkouts(user.id, 60),
  ]);

  const days = dateRange(from, day);
  const bars = days.map((d) => ({ date: d, kcal: range.get(d)?.kcal ?? 0 }));

  const loggedDays = days.filter((d) => (range.get(d)?.entryCount ?? 0) > 0).length;
  const avgIntake = loggedDays
    ? Math.round(days.reduce((s, d) => s + (range.get(d)?.kcal ?? 0), 0) / loggedDays)
    : 0;

  const last30 = workouts.filter((w) => w.date >= from);
  const volume = last30.reduce((s, w) => s + totalVolumeKg(w.sets as SetLike[]), 0);
  const burned = last30.reduce((s, w) => s + (w.caloriesBurned ?? 0), 0);

  const target = state.macros?.kcal ?? null;
  const rate = state.observedRateKgPerWeek;
  const goalType = state.goal?.type ?? "maintain";
  const intended = goalType === "cut" ? -(state.goal?.rateKgPerWeek ?? 0) : goalType === "bulk" ? (state.goal?.rateKgPerWeek ?? 0) : 0;

  return (
    <>
      <PageHeader title="Progress" subtitle="What the last 30 days actually show" />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <StatTile
          label="Avg intake"
          value={<span className="tnum">{avgIntake ? avgIntake.toLocaleString("en-GB") : "—"}</span>}
          sub={`kcal over ${loggedDays} logged day${loggedDays === 1 ? "" : "s"}`}
        />
        <StatTile
          label="Logging streak"
          value={<span className="tnum">{loggedDays}/30</span>}
          sub={loggedDays >= 24 ? "Consistent" : "More days = better estimates"}
          tone={loggedDays >= 24 ? "good" : "neutral"}
        />
        <StatTile
          label="Sessions"
          value={<span className="tnum">{last30.length}</span>}
          sub={`~${burned.toLocaleString("en-GB")} kcal burned`}
        />
        <StatTile
          label="Volume"
          value={<span className="tnum">{Math.round(displayWeight(volume, user.unitSystem, 0)).toLocaleString("en-GB")}</span>}
          sub={`${weightUnit(user.unitSystem)} lifted`}
        />
      </div>

      {/* The adaptive estimate is the app's most useful and least obvious
          number, so it gets an explanation rather than just a figure. */}
      <section className="card mb-4 p-4">
        <h2 className="text-base font-semibold">Your daily burn</h2>
        {state.tdee ? (
          <>
            <p className="tnum mt-1 text-3xl font-semibold">{state.tdee.value.toLocaleString("en-GB")} kcal</p>
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              {state.tdee.method === "formula" ? (
                <>
                  Estimated from your height, weight, age and activity level (
                  {ACTIVITY_LABELS[user.activityLevel ?? "light"].split(" — ")[0].toLowerCase()}). Once you have about
                  two weeks of food logs alongside your weigh-ins, this switches to a figure measured from your own
                  data.
                </>
              ) : (
                <>
                  Measured from your own intake and weight change over {state.tdee.daysOfData} days
                  {state.tdee.method === "blended" ? ", blended with the standard estimate while data builds up" : ""}.
                  This is your actual metabolism, not a population average.
                </>
              )}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt style={{ color: "var(--text-muted)" }}>Resting rate</dt>
                <dd className="tnum font-semibold">{state.bmr?.toLocaleString("en-GB") ?? "—"} kcal</dd>
              </div>
              <div>
                <dt style={{ color: "var(--text-muted)" }}>Confidence</dt>
                <dd className="tnum font-semibold">{Math.round(state.tdee.confidence * 100)}%</dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            Add a weigh-in to see this.
          </p>
        )}
      </section>

      <section className="card mb-4 p-4">
        <h2 className="mb-3 text-base font-semibold">Intake vs target</h2>
        <CalorieBars days={bars} target={target} todayRef={day} />
      </section>

      <section className="card mb-4 p-4">
        <h2 className="mb-3 text-base font-semibold">Weight</h2>
        <WeightTrendChart
          points={state.trend}
          targetKg={state.goal?.targetWeightKg ?? null}
          unitSystem={user.unitSystem}
          todayRef={day}
        />
      </section>

      <section className="card mb-4 p-4">
        <h2 className="text-base font-semibold">Plan vs reality</h2>
        {rate === null ? (
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            Weigh in on at least seven days and this will compare what you planned against what is happening.
          </p>
        ) : (
          <>
            <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt style={{ color: "var(--text-muted)" }}>Planned</dt>
                <dd className="tnum text-lg font-semibold">{formatRate(intended, user.unitSystem)}</dd>
              </div>
              <div>
                <dt style={{ color: "var(--text-muted)" }}>Actual</dt>
                <dd className="tnum text-lg font-semibold">{formatRate(rate, user.unitSystem)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>
              {explain(goalType, intended, rate, loggedDays)}
            </p>
          </>
        )}
      </section>

      <p className="mb-2 text-center text-xs" style={{ color: "var(--text-muted)" }}>
        Calories burned in training are an estimate from MET values. Useful for comparing your own sessions; not
        precise enough to eat back.
      </p>
      <p className="text-center text-sm">
        <Link href="/settings" style={{ color: "var(--accent)" }}>Adjust your goal</Link>
      </p>
    </>
  );
}

/** Plain-language reading of planned rate versus measured rate. */
function explain(goalType: string, intended: number, actual: number, loggedDays: number): string {
  if (loggedDays < 7) {
    return "Log your food more consistently and these numbers get a lot more trustworthy.";
  }
  if (goalType === "maintain") {
    return Math.abs(actual) < 0.25
      ? "You are holding steady, which is exactly the goal."
      : "Your weight is drifting. If that is not deliberate, nudge your intake in the opposite direction.";
  }

  const movingRightWay = Math.sign(actual) === Math.sign(intended);
  if (!movingRightWay) {
    return goalType === "cut"
      ? "Weight is going up rather than down. The most common cause is untracked food at weekends rather than anything metabolic."
      : "Weight is going down rather than up. You likely need to eat more than it feels like you do.";
  }

  const ratio = Math.abs(actual) / Math.max(Math.abs(intended), 0.01);
  if (ratio < 0.5) return "Moving the right way, but slower than planned. Give it another fortnight before changing anything.";
  if (ratio > 1.6) {
    return goalType === "cut"
      ? "Faster than planned. That often costs muscle and energy — consider easing the deficit."
      : "Faster than planned, which usually means more fat than muscle. Consider trimming the surplus.";
  }
  return "Tracking close to plan. Keep going.";
}
