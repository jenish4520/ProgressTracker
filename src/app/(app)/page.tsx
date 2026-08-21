import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadDayNutrition, loadEnergyState, loadNutritionRange } from "@/server/energy";
import { listWorkouts } from "@/server/workouts";
import { addDays, dateRange, formatDateLong, formatDayShort, todayInZone } from "@/lib/dates";
import { formatRate, formatWeight, weightUnit, displayWeight } from "@/lib/units";
import { pctOf } from "@/lib/food";
import MacroMeters from "@/components/charts/MacroMeters";
import CalorieBars from "@/components/charts/CalorieBars";
import StatTile from "@/components/StatTile";
import PageHeader from "@/components/PageHeader";
import CalorieRing from "@/components/CalorieRing";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  // The user's day, not the server's. Also the reference every date label
  // below is rendered against, so SSR and hydration agree.
  const day = todayInZone(user.timezone);

  const [state, totals, recentWorkouts, range] = await Promise.all([
    loadEnergyState(user, day),
    loadDayNutrition(user.id, day),
    listWorkouts(user.id, 3),
    loadNutritionRange(user.id, addDays(day, -13), day),
  ]);

  const targetKcal = state.macros?.kcal ?? null;
  const remaining = targetKcal !== null ? Math.round(targetKcal - totals.kcal) : null;
  const firstName = user.name.split(" ")[0];

  const bars = dateRange(addDays(day, -13), day).map((d) => ({
    date: d,
    kcal: range.get(d)?.kcal ?? 0,
  }));

  const rate = state.observedRateKgPerWeek;
  const goalType = state.goal?.type ?? "maintain";
  // "On track" means moving the way the goal intends, at a believable pace.
  const onTrack =
    rate === null
      ? null
      : goalType === "cut"
        ? rate < -0.05
        : goalType === "bulk"
          ? rate > 0.05
          : Math.abs(rate) < 0.25;

  return (
    <>
      <PageHeader
        title={`Hey ${firstName}`}
        subtitle={formatDateLong(day)}
      />

      {/* Today's energy budget — the one number worth leading with. */}
      <section className="card mb-4 p-4">
        <div className="flex items-center gap-4">
          <CalorieRing
            consumed={totals.kcal}
            target={targetKcal ?? 0}
            burned={recentWorkouts.find((w) => w.date === day)?.caloriesBurned ?? 0}
          />
          <div className="min-w-0 flex-1">
            {targetKcal !== null ? (
              <>
                <p className="tnum text-3xl font-semibold leading-none">
                  {Math.abs(remaining!).toLocaleString("en-GB")}
                </p>
                <p className="mt-1 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                  kcal {remaining! >= 0 ? "left today" : "over target"}
                </p>
                <p className="tnum mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  {Math.round(totals.kcal).toLocaleString("en-GB")} of{" "}
                  {targetKcal.toLocaleString("en-GB")} kcal · {pctOf(totals.kcal, targetKcal)}%
                </p>
              </>
            ) : (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Log a weigh-in to unlock your daily calorie target.
              </p>
            )}
          </div>
        </div>

        {state.macros && (
          <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <MacroMeters
              protein={{ current: totals.proteinG, target: state.macros.proteinG }}
              carbs={{ current: totals.carbsG, target: state.macros.carbsG }}
              fat={{ current: totals.fatG, target: state.macros.fatG }}
            />
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Link href="/food" className="btn btn-primary flex-1">Log food</Link>
          <Link href="/train" className="btn btn-secondary flex-1">Start workout</Link>
        </div>
      </section>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <StatTile
          label="Weight trend"
          value={
            state.trendWeightKg !== null ? (
              <span className="tnum">
                {displayWeight(state.trendWeightKg, user.unitSystem)}
                <span className="text-base font-normal" style={{ color: "var(--text-muted)" }}>
                  {" "}{weightUnit(user.unitSystem)}
                </span>
              </span>
            ) : (
              "—"
            )
          }
          sub={
            rate !== null
              ? `${formatRate(rate, user.unitSystem)}${onTrack ? " · on track" : ""}`
              : "Weigh in for 7 days to see your rate"
          }
          tone={onTrack === null ? "neutral" : onTrack ? "good" : "warning"}
        />
        <StatTile
          label={state.tdee?.method === "formula" ? "Est. daily burn" : "Measured daily burn"}
          value={<span className="tnum">{state.tdee ? state.tdee.value.toLocaleString("en-GB") : "—"}</span>}
          sub={
            state.tdee?.method === "formula"
              ? "From the standard equation"
              : `Measured from ${state.tdee?.loggedDays ?? 0} logged days`
          }
          tone={state.tdee && state.tdee.method !== "formula" ? "good" : "neutral"}
        />
      </div>

      <section className="card mb-4 p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Last 14 days</h2>
          <Link href="/progress" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
            Details
          </Link>
        </div>
        <CalorieBars days={bars} target={targetKcal} todayRef={day} />
      </section>

      <section className="card p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Recent training</h2>
          <Link href="/train" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
            All
          </Link>
        </div>

        {recentWorkouts.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No sessions logged yet. Your first one is the hardest.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {recentWorkouts.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{w.name}</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {formatDayShort(w.date)} ·{" "}
                    {w.sets.filter((s) => !s.isWarmup).length} sets
                  </p>
                </div>
                <span className="tnum shrink-0 text-sm" style={{ color: "var(--text-secondary)" }}>
                  {w.caloriesBurned ? `${w.caloriesBurned} kcal` : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-6 px-1 text-center text-xs" style={{ color: "var(--text-muted)" }}>
        Weight shown is the smoothed trend, not this morning&rsquo;s reading.{" "}
        <Link href="/body" style={{ color: "var(--accent)" }}>See why</Link>
      </p>
    </>
  );
}
