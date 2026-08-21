"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GoalType, UnitSystem } from "@/db/schema";
import type { Projection, TrendPoint } from "@/lib/trend";
import { api, ApiError } from "@/lib/client";
import { formatDateMedium, formatDayLabel } from "@/lib/dates";
import { displayLength, displayWeight, formatRate, lengthUnit, storeLength, storeWeight, weightUnit } from "@/lib/units";
import WeightTrendChart from "@/components/charts/WeightTrendChart";
import StatTile from "@/components/StatTile";

interface Entry {
  id: string;
  date: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  waistCm: number | null;
  chestCm: number | null;
  hipsCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  neckCm: number | null;
  note: string | null;
}

interface Props {
  unitSystem: UnitSystem;
  /** The user's current day, resolved server-side in their timezone. */
  todayRef: string;
  entries: Entry[];
  trend: TrendPoint[];
  trendWeightKg: number | null;
  observedRateKgPerWeek: number | null;
  goalTargetKg: number | null;
  goalType: GoalType;
  goalRate: number;
  projection: Projection | null;
}

const MEASUREMENTS = [
  { key: "waistCm", label: "Waist" },
  { key: "chestCm", label: "Chest" },
  { key: "hipsCm", label: "Hips" },
  { key: "armCm", label: "Arm" },
  { key: "thighCm", label: "Thigh" },
  { key: "neckCm", label: "Neck" },
] as const;

export default function BodyLogger(props: Props) {
  const { unitSystem, todayRef, entries, trend, trendWeightKg, observedRateKgPerWeek, goalTargetKg, goalType, goalRate, projection } = props;
  const router = useRouter();

  const [date, setDate] = useState(todayRef);
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [showMore, setShowMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wUnit = weightUnit(unitSystem);
  const lUnit = lengthUnit(unitSystem);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { date };
      if (weight) payload.weightKg = storeWeight(Number(weight), unitSystem);
      if (bodyFat) payload.bodyFatPct = Number(bodyFat);
      for (const m of MEASUREMENTS) {
        const v = extra[m.key];
        if (v) payload[m.key] = storeLength(Number(v), unitSystem);
      }

      await api.put("/api/body", payload);
      setWeight("");
      setBodyFat("");
      setExtra({});
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save. Are you online?");
    } finally {
      setBusy(false);
    }
  }

  async function remove(entryDate: string) {
    if (!confirm(`Delete the entry for ${formatDayLabel(entryDate, todayRef)}?`)) return;
    try {
      await api.del(`/api/body?date=${entryDate}`);
      router.refresh();
    } catch {
      setError("Could not delete that entry.");
    }
  }

  // Comparing the measured rate against the intended one answers the question
  // people actually have: is this working, or am I kidding myself?
  const intended = goalType === "cut" ? -goalRate : goalType === "bulk" ? goalRate : 0;
  const onTrack =
    observedRateKgPerWeek === null
      ? null
      : goalType === "maintain"
        ? Math.abs(observedRateKgPerWeek) < 0.25
        : Math.sign(observedRateKgPerWeek) === Math.sign(intended) &&
          Math.abs(observedRateKgPerWeek) >= Math.abs(intended) * 0.5;

  return (
    <>
      <section className="card mb-4 p-4">
        <h2 className="mb-3 text-base font-semibold">Weight trend</h2>
        <WeightTrendChart points={trend} targetKg={goalTargetKg} unitSystem={unitSystem} todayRef={todayRef} />
      </section>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <StatTile
          label="Trend weight"
          value={<span className="tnum">{trendWeightKg !== null ? displayWeight(trendWeightKg, unitSystem) : "—"}</span>}
          sub={`${wUnit} · smoothed`}
        />
        <StatTile
          label="Actual rate"
          value={<span className="tnum">{observedRateKgPerWeek !== null ? formatRate(observedRateKgPerWeek, unitSystem).replace(`${wUnit}/week`, "") : "—"}</span>}
          sub={
            observedRateKgPerWeek === null
              ? "Needs 7 days of data"
              : onTrack
                ? "On track for your goal"
                : goalType === "maintain"
                  ? "Drifting from maintenance"
                  : "Slower than planned"
          }
          tone={onTrack === null ? "neutral" : onTrack ? "good" : "warning"}
        />
      </div>

      {projection && goalTargetKg !== null && (
        <section className="card mb-4 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            At your current rate
          </p>
          <p className="mt-1 text-lg font-semibold">
            {displayWeight(goalTargetKg, unitSystem)} {wUnit} around{" "}
            {formatDateMedium(projection.date)}
          </p>
          <p className="mt-0.5 text-sm" style={{ color: "var(--text-secondary)" }}>
            About {projection.weeks} weeks away, based on what has actually happened — not the plan.
          </p>
        </section>
      )}

      <section className="card mb-4 p-4">
        <h2 className="mb-3 text-base font-semibold">Log a measurement</h2>
        <form onSubmit={save} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="bdate">Date</label>
              <input id="bdate" type="date" className="field" value={date} max={todayRef} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="bweight">Weight ({wUnit})</label>
              <input
                id="bweight"
                type="number"
                inputMode="decimal"
                step="0.1"
                className="field"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="—"
              />
            </div>
          </div>

          <button
            type="button"
            className="btn btn-ghost self-start px-0"
            onClick={() => setShowMore((s) => !s)}
            aria-expanded={showMore}
          >
            {showMore ? "− Fewer fields" : "+ Body fat and measurements"}
          </button>

          {showMore && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="bfat">Body fat (%)</label>
                <input id="bfat" type="number" inputMode="decimal" step="0.1" className="field" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} />
              </div>
              {MEASUREMENTS.map((m) => (
                <div key={m.key}>
                  <label className="label" htmlFor={m.key}>{m.label} ({lUnit})</label>
                  <input
                    id={m.key}
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    className="field"
                    value={extra[m.key] ?? ""}
                    onChange={(e) => setExtra((x) => ({ ...x, [m.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}

          {error && <p role="alert" className="text-sm" style={{ color: "var(--status-critical)" }}>{error}</p>}

          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save entry"}
          </button>
          <p className="hint">
            Weighing more than once a day is fine — the entry for a date is replaced, not added to.
          </p>
        </form>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 text-base font-semibold">History</h2>
        {entries.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nothing logged yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {entries.slice(0, 60).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 border-b py-2.5 last:border-0" style={{ borderColor: "var(--border)" }}>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{formatDayLabel(e.date, todayRef)}</p>
                  <p className="tnum text-xs" style={{ color: "var(--text-muted)" }}>
                    {[
                      e.bodyFatPct !== null ? `${e.bodyFatPct}% fat` : null,
                      e.waistCm !== null ? `waist ${displayLength(e.waistCm, unitSystem)}${lUnit}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || formatDateMedium(e.date)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="tnum text-sm font-semibold">
                    {e.weightKg !== null ? `${displayWeight(e.weightKg, unitSystem)} ${wUnit}` : "—"}
                  </span>
                  <button
                    onClick={() => remove(e.date)}
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                    aria-label={`Delete entry for ${e.date}`}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
