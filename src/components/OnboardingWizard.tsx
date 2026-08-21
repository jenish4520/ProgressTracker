"use client";

import { useMemo, useState } from "react";
import { api, ApiError } from "@/lib/client";
import type { ActivityLevel, GoalType, Sex, UnitSystem } from "@/db/schema";
import { ACTIVITY_LABELS, bmr, calorieTarget, defaultRate, macroTargets, maxSafeRate, tdeeFromFormula } from "@/lib/nutrition";
import { ageOn } from "@/lib/dates";
import { displayWeight, lengthUnit, storeLength, storeWeight, weightUnit } from "@/lib/units";

interface Initial {
  name: string;
  sex: Sex | null;
  birthDate: string | null;
  heightCm: number | null;
  activityLevel: ActivityLevel;
  unitSystem: UnitSystem;
  timezone: string;
}

const GOAL_COPY: Record<GoalType, { title: string; blurb: string }> = {
  cut: { title: "Lose fat", blurb: "Eat below maintenance and drop weight steadily." },
  maintain: { title: "Maintain", blurb: "Hold your weight and focus on getting stronger." },
  bulk: { title: "Build muscle", blurb: "Eat above maintenance to support growth." },
};

/**
 * Three-step setup: who you are, what you weigh, what you are aiming for.
 *
 * The projected numbers update live from step two onward, so the effect of a
 * choice is visible before it is committed — picking a rate without seeing the
 * calorie target it implies is how people end up on accidental crash diets.
 */
export default function OnboardingWizard({ initial, todayRef }: { initial: Initial; todayRef: string }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [unitSystem, setUnitSystem] = useState<UnitSystem>(initial.unitSystem);
  const [sex, setSex] = useState<Sex | "">(initial.sex ?? "");
  const [birthDate, setBirthDate] = useState(initial.birthDate ?? "");
  const [height, setHeight] = useState(initial.heightCm ? String(initial.heightCm) : "");
  const [activity, setActivity] = useState<ActivityLevel>(initial.activityLevel);

  const [weight, setWeight] = useState("");
  const [goalType, setGoalType] = useState<GoalType>("cut");
  const [rate, setRate] = useState(defaultRate("cut"));
  const [targetWeight, setTargetWeight] = useState("");

  const heightCm = height ? storeLength(Number(height), unitSystem) : null;
  const weightKg = weight ? storeWeight(Number(weight), unitSystem) : null;

  /** Live preview of what the engine will set, given the choices so far. */
  const preview = useMemo(() => {
    if (!sex || !birthDate || !heightCm || !weightKg) return null;
    const age = ageOn(birthDate, todayRef);
    if (age < 13 || age > 100) return null;

    const b = bmr({ weightKg, heightCm, ageYears: age, sex });
    const tdee = tdeeFromFormula(b, activity);
    const target = calorieTarget({ tdee, bmr: b, goalType, rateKgPerWeek: rate, sex });
    const macros = macroTargets({ kcal: target.target, weightKg, goalType });
    return { bmr: b, tdee, target, macros };
  }, [sex, birthDate, heightCm, weightKg, activity, goalType, rate]);

  const ceiling = weightKg ? maxSafeRate(goalType, weightKg) : 1;

  const step1Valid = Boolean(sex && birthDate && heightCm && heightCm > 50 && heightCm < 260);
  const step2Valid = Boolean(weightKg && weightKg > 20 && weightKg < 500);

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      // Detected here so the very first weigh-in already lands on the right
      // calendar day for wherever the user actually is.
      let timezone = initial.timezone;
      try {
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || timezone;
      } catch {
        // Keep whatever is stored.
      }

      await api.patch("/api/profile", {
        sex,
        birthDate,
        heightCm,
        activityLevel: activity,
        unitSystem,
        timezone,
      });
      await api.put("/api/body", { date: todayRef, weightKg });
      await api.put("/api/goal", {
        type: goalType,
        rateKgPerWeek: goalType === "maintain" ? 0 : rate,
        targetWeightKg: targetWeight ? storeWeight(Number(targetWeight), unitSystem) : null,
        startWeightKg: weightKg,
      });
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save. Check your connection.");
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-6">
        <div className="mb-3 flex gap-1.5" role="presentation">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1 flex-1 rounded-full transition-colors"
              style={{ background: i <= step ? "var(--accent)" : "var(--grid)" }}
            />
          ))}
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Step {step + 1} of 3
        </p>
      </div>

      {step === 0 && (
        <section>
          <h1 className="text-2xl font-semibold tracking-tight">Hi {initial.name.split(" ")[0]} 👋</h1>
          <p className="mt-1.5 text-sm" style={{ color: "var(--text-secondary)" }}>
            A few details so the calorie maths is about you, rather than an average person.
          </p>

          <div className="mt-6 flex flex-col gap-4">
            <div>
              <span className="label">Units</span>
              <Segmented
                value={unitSystem}
                onChange={(v) => setUnitSystem(v as UnitSystem)}
                options={[
                  { value: "metric", label: "kg / cm" },
                  { value: "imperial", label: "lb / in" },
                ]}
              />
            </div>

            <div>
              <span className="label">Sex</span>
              <Segmented
                value={sex}
                onChange={(v) => setSex(v as Sex)}
                options={[
                  { value: "male", label: "Male" },
                  { value: "female", label: "Female" },
                ]}
              />
              <p className="hint mt-1.5">
                Used only by the metabolic rate equation, which is calibrated separately for each.
              </p>
            </div>

            <div>
              <label className="label" htmlFor="dob">Date of birth</label>
              <input
                id="dob"
                type="date"
                className="field"
                value={birthDate}
                max={todayRef}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>

            <div>
              <label className="label" htmlFor="height">Height ({lengthUnit(unitSystem)})</label>
              <input
                id="height"
                type="number"
                inputMode="decimal"
                step="0.5"
                className="field"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder={unitSystem === "metric" ? "178" : "70"}
              />
            </div>

            <div>
              <label className="label" htmlFor="activity">Daily activity</label>
              <select
                id="activity"
                className="field"
                value={activity}
                onChange={(e) => setActivity(e.target.value as ActivityLevel)}
              >
                {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((k) => (
                  <option key={k} value={k}>
                    {ACTIVITY_LABELS[k]}
                  </option>
                ))}
              </select>
              <p className="hint mt-1.5">
                A rough starting point only — once you have a couple of weeks of data, your real
                burn is measured from what actually happens.
              </p>
            </div>
          </div>

          <button
            className="btn btn-primary mt-6 w-full"
            disabled={!step1Valid}
            onClick={() => setStep(1)}
          >
            Continue
          </button>
        </section>
      )}

      {step === 1 && (
        <section>
          <h1 className="text-2xl font-semibold tracking-tight">What do you weigh today?</h1>
          <p className="mt-1.5 text-sm" style={{ color: "var(--text-secondary)" }}>
            Best measured first thing in the morning, after the toilet and before breakfast.
          </p>

          <div className="mt-6">
            <label className="label" htmlFor="weight">Current weight ({weightUnit(unitSystem)})</label>
            <input
              id="weight"
              type="number"
              inputMode="decimal"
              step="0.1"
              className="field"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder={unitSystem === "metric" ? "78.5" : "173"}
              autoFocus
            />
          </div>

          {preview && (
            <div className="card mt-5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Your maintenance estimate
              </p>
              <p className="tnum mt-1 text-3xl font-semibold">{preview.tdee.toLocaleString("en-GB")} kcal</p>
              <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                Roughly what you burn per day at rest plus your usual activity.
              </p>
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button className="btn btn-secondary flex-1" onClick={() => setStep(0)}>Back</button>
            <button className="btn btn-primary flex-1" disabled={!step2Valid} onClick={() => setStep(2)}>
              Continue
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section>
          <h1 className="text-2xl font-semibold tracking-tight">What are you aiming for?</h1>
          <p className="mt-1.5 text-sm" style={{ color: "var(--text-secondary)" }}>
            You can change this whenever you like.
          </p>

          <div className="mt-5 flex flex-col gap-2">
            {(Object.keys(GOAL_COPY) as GoalType[]).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setGoalType(t);
                  setRate(defaultRate(t));
                }}
                className="card p-3 text-left transition-colors"
                style={{
                  borderColor: goalType === t ? "var(--accent)" : "var(--border)",
                  background: goalType === t ? "color-mix(in srgb, var(--accent) 8%, var(--surface))" : "var(--surface)",
                }}
              >
                <p className="font-semibold">{GOAL_COPY[t].title}</p>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{GOAL_COPY[t].blurb}</p>
              </button>
            ))}
          </div>

          {goalType !== "maintain" && (
            <div className="mt-5">
              <label className="label" htmlFor="rate">
                Target pace: {displayWeight(rate, unitSystem, 2)} {weightUnit(unitSystem)} per week
              </label>
              <input
                id="rate"
                type="range"
                min={0.1}
                max={ceiling}
                step={0.05}
                value={Math.min(rate, ceiling)}
                onChange={(e) => setRate(Number(e.target.value))}
                className="w-full"
                style={{ accentColor: "var(--accent)" }}
              />
              <p className="hint mt-1">
                {goalType === "cut"
                  ? "Around 0.5 kg a week keeps muscle while the fat comes off. Faster costs strength."
                  : "Slow gains stay leaner. Faster than 0.5 kg a week is mostly fat."}
              </p>
            </div>
          )}

          <div className="mt-4">
            <label className="label" htmlFor="target">
              Goal weight ({weightUnit(unitSystem)}) — optional
            </label>
            <input
              id="target"
              type="number"
              inputMode="decimal"
              step="0.1"
              className="field"
              value={targetWeight}
              onChange={(e) => setTargetWeight(e.target.value)}
              placeholder="Leave blank if you have no fixed number in mind"
            />
          </div>

          {preview && (
            <div className="card mt-5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Your daily target
              </p>
              <p className="tnum mt-1 text-3xl font-semibold">
                {preview.target.target.toLocaleString("en-GB")} kcal
              </p>
              <p className="tnum mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                {preview.macros.proteinG} g protein · {preview.macros.carbsG} g carbs · {preview.macros.fatG} g fat
              </p>
              {preview.target.floored && (
                <p className="mt-2 text-sm" style={{ color: "var(--status-serious)" }}>
                  ⚠ That pace would put you below a safe intake, so the target has been held at{" "}
                  {preview.target.floor.toLocaleString("en-GB")} kcal. Consider a gentler pace.
                </p>
              )}
            </div>
          )}

          {error && (
            <p role="alert" className="mt-4 text-sm" style={{ color: "var(--status-critical)" }}>
              {error}
            </p>
          )}

          <div className="mt-6 flex gap-3">
            <button className="btn btn-secondary flex-1" onClick={() => setStep(1)} disabled={busy}>Back</button>
            <button className="btn btn-primary flex-1" onClick={finish} disabled={busy}>
              {busy ? "Saving…" : "Start tracking"}
            </button>
          </div>
        </section>
      )}
    </>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex gap-2">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className="btn flex-1"
            style={{
              background: active ? "var(--accent)" : "var(--surface-raised)",
              color: active ? "var(--accent-contrast)" : "var(--text-primary)",
              borderColor: active ? "var(--accent)" : "var(--border-strong)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
