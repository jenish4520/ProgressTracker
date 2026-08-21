"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ActivityLevel, GoalType, Sex, UnitSystem } from "@/db/schema";
import type { ActiveGoal } from "@/server/energy";
import type { CalorieTarget, MacroTargets, TdeeEstimate } from "@/lib/nutrition";
import { ACTIVITY_LABELS, defaultRate, maxSafeRate } from "@/lib/nutrition";
import { api, ApiError } from "@/lib/client";
import { displayWeight, lengthUnit, storeLength, storeWeight, weightUnit } from "@/lib/units";
import PageHeader from "@/components/PageHeader";

interface Props {
  user: {
    name: string;
    email: string;
    sex: Sex | null;
    birthDate: string | null;
    heightCm: number | null;
    activityLevel: ActivityLevel;
    unitSystem: UnitSystem;
  };
  goal: ActiveGoal | null;
  target: CalorieTarget | null;
  macros: MacroTargets | null;
  tdee: TdeeEstimate | null;
  trendWeightKg: number | null;
  invites: { code: string; note: string | null; uses: number; maxUses: number; expiresAt: string | null }[];
}

export default function SettingsScreen({ user, goal, macros, trendWeightKg, invites }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [goalType, setGoalType] = useState<GoalType>(goal?.type ?? "maintain");
  const [rate, setRate] = useState(goal?.rateKgPerWeek ?? defaultRate(goal?.type ?? "maintain"));
  const [targetWeight, setTargetWeight] = useState(
    goal?.targetWeightKg != null ? String(displayWeight(goal.targetWeightKg, user.unitSystem)) : "",
  );

  const [profile, setProfile] = useState({
    activityLevel: user.activityLevel,
    unitSystem: user.unitSystem,
    heightCm: user.heightCm != null ? String(Math.round(user.heightCm * 10) / 10) : "",
  });

  const wUnit = weightUnit(profile.unitSystem);
  const ceiling = trendWeightKg ? maxSafeRate(goalType, trendWeightKg) : 1;

  async function run(key: string, fn: () => Promise<void>, success?: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (success) setNotice(success);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title="Settings" subtitle={user.email} />

      {notice && (
        <p className="card mb-4 p-3 text-sm" style={{ color: "var(--success-text)" }}>{notice}</p>
      )}
      {error && (
        <p role="alert" className="card mb-4 p-3 text-sm" style={{ color: "var(--status-critical)" }}>{error}</p>
      )}

      <section className="card mb-4 p-4">
        <h2 className="mb-3 text-base font-semibold">Your goal</h2>

        <div className="mb-3 flex gap-2">
          {(["cut", "maintain", "bulk"] as GoalType[]).map((t) => (
            <button
              key={t}
              className="btn flex-1 capitalize"
              onClick={() => {
                setGoalType(t);
                setRate(defaultRate(t));
              }}
              style={{
                background: goalType === t ? "var(--accent)" : "var(--surface-raised)",
                color: goalType === t ? "var(--accent-contrast)" : "var(--text-primary)",
                borderColor: goalType === t ? "var(--accent)" : "var(--border-strong)",
              }}
            >
              {t === "cut" ? "Lose" : t === "bulk" ? "Gain" : "Maintain"}
            </button>
          ))}
        </div>

        {goalType !== "maintain" && (
          <div className="mb-3">
            <label className="label" htmlFor="grate">
              Pace: {displayWeight(rate, profile.unitSystem, 2)} {wUnit} per week
            </label>
            <input
              id="grate"
              type="range"
              min={0.1}
              max={ceiling}
              step={0.05}
              value={Math.min(rate, ceiling)}
              onChange={(e) => setRate(Number(e.target.value))}
              className="w-full"
              style={{ accentColor: "var(--accent)" }}
            />
          </div>
        )}

        <div className="mb-3">
          <label className="label" htmlFor="gtarget">Goal weight ({wUnit}) — optional</label>
          <input
            id="gtarget"
            type="number"
            inputMode="decimal"
            step="0.1"
            className="field"
            value={targetWeight}
            onChange={(e) => setTargetWeight(e.target.value)}
          />
        </div>

        {macros && (
          <p className="tnum mb-3 text-sm" style={{ color: "var(--text-secondary)" }}>
            Current target: <strong>{macros.kcal.toLocaleString("en-GB")} kcal</strong> · {macros.proteinG} g protein ·{" "}
            {macros.carbsG} g carbs · {macros.fatG} g fat
          </p>
        )}

        <button
          className="btn btn-primary w-full"
          disabled={busy === "goal"}
          onClick={() =>
            run(
              "goal",
              async () => {
                await api.put("/api/goal", {
                  type: goalType,
                  rateKgPerWeek: goalType === "maintain" ? 0 : rate,
                  targetWeightKg: targetWeight ? storeWeight(Number(targetWeight), profile.unitSystem) : null,
                });
              },
              "Goal updated. Your daily targets have been recalculated.",
            )
          }
        >
          {busy === "goal" ? "Saving…" : "Save goal"}
        </button>
      </section>

      <section className="card mb-4 p-4">
        <h2 className="mb-3 text-base font-semibold">Profile</h2>

        <div className="mb-3">
          <label className="label" htmlFor="sactivity">Daily activity</label>
          <select
            id="sactivity"
            className="field"
            value={profile.activityLevel}
            onChange={(e) => setProfile({ ...profile, activityLevel: e.target.value as ActivityLevel })}
          >
            {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((k) => (
              <option key={k} value={k}>{ACTIVITY_LABELS[k]}</option>
            ))}
          </select>
        </div>

        <div className="mb-3">
          <label className="label" htmlFor="sheight">Height ({lengthUnit(profile.unitSystem)})</label>
          <input
            id="sheight"
            type="number"
            inputMode="decimal"
            step="0.5"
            className="field"
            value={profile.heightCm}
            onChange={(e) => setProfile({ ...profile, heightCm: e.target.value })}
          />
        </div>

        <div className="mb-3">
          <span className="label">Units</span>
          <div className="flex gap-2">
            {(["metric", "imperial"] as UnitSystem[]).map((u) => (
              <button
                key={u}
                className="btn flex-1"
                onClick={() => setProfile({ ...profile, unitSystem: u })}
                style={{
                  background: profile.unitSystem === u ? "var(--accent)" : "var(--surface-raised)",
                  color: profile.unitSystem === u ? "var(--accent-contrast)" : "var(--text-primary)",
                  borderColor: profile.unitSystem === u ? "var(--accent)" : "var(--border-strong)",
                }}
              >
                {u === "metric" ? "kg / cm" : "lb / in"}
              </button>
            ))}
          </div>
        </div>

        <button
          className="btn btn-secondary w-full"
          disabled={busy === "profile"}
          onClick={() =>
            run(
              "profile",
              async () => {
                await api.patch("/api/profile", {
                  activityLevel: profile.activityLevel,
                  unitSystem: profile.unitSystem,
                  ...(profile.heightCm
                    ? { heightCm: storeLength(Number(profile.heightCm), profile.unitSystem) }
                    : {}),
                });
              },
              "Profile saved.",
            )
          }
        >
          {busy === "profile" ? "Saving…" : "Save profile"}
        </button>
      </section>

      {/* Invites are how friends join. Data stays entirely separate per account. */}
      <section className="card mb-4 p-4">
        <h2 className="text-base font-semibold">Invite a friend</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Generate a code and send it over. Their log is completely separate from yours — nobody can see anyone
          else&rsquo;s weight, food or training.
        </p>

        <button
          className="btn btn-secondary mt-3 w-full"
          disabled={busy === "invite"}
          onClick={() => run("invite", async () => { await api.post("/api/invites", { maxUses: 1, expiresInDays: 30 }); }, "Invite code created.")}
        >
          {busy === "invite" ? "Creating…" : "Create invite code"}
        </button>

        {invites.length > 0 && (
          <ul className="m-0 mt-3 flex list-none flex-col p-0">
            {invites.map((i) => {
              const spent = i.uses >= i.maxUses;
              const expired = i.expiresAt ? new Date(i.expiresAt) < new Date() : false;
              return (
                <li key={i.code} className="flex items-center justify-between gap-3 border-b py-2 last:border-0" style={{ borderColor: "var(--border)" }}>
                  <div className="min-w-0">
                    <p className="tnum font-mono text-sm font-semibold" style={{ opacity: spent || expired ? 0.5 : 1 }}>
                      {i.code}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {expired ? "Expired" : spent ? "Used" : `${i.maxUses - i.uses} use left`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {!spent && !expired && (
                      <button
                        className="btn btn-secondary px-2 py-1 text-xs"
                        style={{ minHeight: 32 }}
                        onClick={() => {
                          void navigator.clipboard?.writeText(i.code);
                          setNotice(`Copied ${i.code}`);
                        }}
                      >
                        Copy
                      </button>
                    )}
                    <button
                      className="btn btn-ghost px-2 py-1 text-xs"
                      style={{ minHeight: 32 }}
                      onClick={() => run("revoke", async () => { await api.del(`/api/invites?code=${i.code}`); })}
                    >
                      Revoke
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-3 text-base font-semibold">Account</h2>
        <button
          className="btn btn-secondary w-full"
          onClick={async () => {
            await api.post("/api/auth/logout");
            window.location.href = "/login";
          }}
        >
          Sign out
        </button>
      </section>

      <p className="mt-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>
        Food data from Open Food Facts (ODbL). Calorie and metabolic estimates are guidance, not medical advice.
      </p>
    </>
  );
}
