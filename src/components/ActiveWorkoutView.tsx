"use client";

import { useEffect, useState } from "react";
import type { UnitSystem } from "@/db/schema";
import type { ActiveSet, ActiveWorkout } from "@/lib/offline";
import { formatDuration } from "@/lib/training";
import { displayWeight, storeWeight, weightUnit } from "@/lib/units";
import RestTimer from "@/components/RestTimer";

interface Props {
  workout: ActiveWorkout;
  unitSystem: UnitSystem;
  onChange: (w: ActiveWorkout) => Promise<void>;
  onFinish: () => Promise<void>;
  onAddExercise: () => void;
  onDiscard: () => Promise<void>;
}

/**
 * The in-gym screen.
 *
 * Everything here writes straight to on-device storage. Big tap targets,
 * numeric keypads, and the previous session's numbers visible beside each
 * input — the three things that decide whether a set gets logged or skipped.
 */
export default function ActiveWorkoutView({
  workout,
  unitSystem,
  onChange,
  onFinish,
  onAddExercise,
  onDiscard,
}: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [restFrom, setRestFrom] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    const tick = () => setElapsed((Date.now() - new Date(workout.startedAt).getTime()) / 1000);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [workout.startedAt]);

  const unit = weightUnit(unitSystem);
  const completedSets = workout.entries.reduce((n, e) => n + e.sets.filter((s) => s.completed).length, 0);

  async function patchSet(entryIdx: number, setIdx: number, patch: Partial<ActiveSet>) {
    const entries = workout.entries.map((e, i) =>
      i !== entryIdx ? e : { ...e, sets: e.sets.map((s, j) => (j === setIdx ? { ...s, ...patch } : s)) },
    );
    await onChange({ ...workout, entries });
  }

  async function addSet(entryIdx: number) {
    const entries = workout.entries.map((e, i) => {
      if (i !== entryIdx) return e;
      const previous = e.sets[e.sets.length - 1];
      return {
        ...e,
        sets: [
          ...e.sets,
          {
            reps: previous?.reps ?? 8,
            weightKg: previous?.weightKg ?? null,
            durationSeconds: null,
            distanceM: null,
            rpe: null,
            isWarmup: false,
            completed: false,
          },
        ],
      };
    });
    await onChange({ ...workout, entries });
  }

  async function removeExercise(entryIdx: number) {
    await onChange({ ...workout, entries: workout.entries.filter((_, i) => i !== entryIdx) });
  }

  return (
    <>
      <header
        className="sticky top-0 z-30 -mx-4 mb-4 border-b px-4 py-3 backdrop-blur"
        style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--page) 92%, transparent)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <input
              value={workout.name}
              onChange={(e) => onChange({ ...workout, name: e.target.value })}
              className="w-full bg-transparent text-xl font-semibold tracking-tight outline-none"
              aria-label="Workout name"
            />
            <p className="tnum text-xs" style={{ color: "var(--text-muted)" }}>
              {formatDuration(elapsed)} · {completedSets} set{completedSets === 1 ? "" : "s"} done
            </p>
          </div>
          <button
            className="btn btn-primary shrink-0 px-3"
            onClick={async () => {
              setFinishing(true);
              await onFinish();
            }}
            disabled={finishing}
          >
            {finishing ? "Saving…" : "Finish"}
          </button>
        </div>
      </header>

      {workout.entries.length === 0 && (
        <p className="card mb-4 p-4 text-sm" style={{ color: "var(--text-muted)" }}>
          No exercises yet. Add your first one below.
        </p>
      )}

      {workout.entries.map((entry, entryIdx) => (
        <section key={`${entry.exerciseId}-${entryIdx}`} className="card mb-3 p-3">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="truncate font-semibold">{entry.exerciseName}</h2>
            <button
              onClick={() => removeExercise(entryIdx)}
              className="shrink-0 text-xs"
              style={{ color: "var(--text-muted)" }}
              aria-label={`Remove ${entry.exerciseName}`}
            >
              Remove
            </button>
          </div>

          <div
            className="mb-1 grid items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-wide"
            style={{ gridTemplateColumns: "1.6rem 1fr 1fr 2.4rem", color: "var(--text-muted)" }}
          >
            <span>Set</span>
            <span>{entry.kind === "cardio" ? "Minutes" : unit}</span>
            <span>{entry.kind === "cardio" ? "Distance (m)" : "Reps"}</span>
            <span className="text-right">Done</span>
          </div>

          {entry.sets.map((set, setIdx) => (
            <div
              key={setIdx}
              className="grid items-center gap-2 py-1"
              style={{ gridTemplateColumns: "1.6rem 1fr 1fr 2.4rem" }}
            >
              <span className="tnum text-sm" style={{ color: set.isWarmup ? "var(--text-muted)" : "var(--text-primary)" }}>
                {set.isWarmup ? "W" : setIdx + 1}
              </span>

              {entry.kind === "cardio" ? (
                <>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="field px-2 py-1.5"
                    value={set.durationSeconds !== null ? String(set.durationSeconds / 60) : ""}
                    onChange={(e) =>
                      patchSet(entryIdx, setIdx, {
                        durationSeconds: e.target.value ? Math.round(Number(e.target.value) * 60) : null,
                      })
                    }
                    placeholder="—"
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    className="field px-2 py-1.5"
                    value={set.distanceM ?? ""}
                    onChange={(e) => patchSet(entryIdx, setIdx, { distanceM: e.target.value ? Number(e.target.value) : null })}
                    placeholder="—"
                  />
                </>
              ) : (
                <>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    className="field px-2 py-1.5"
                    value={set.weightKg !== null ? displayWeight(set.weightKg, unitSystem) : ""}
                    onChange={(e) =>
                      patchSet(entryIdx, setIdx, {
                        weightKg: e.target.value ? storeWeight(Number(e.target.value), unitSystem) : null,
                      })
                    }
                    placeholder="—"
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    className="field px-2 py-1.5"
                    value={set.reps ?? ""}
                    onChange={(e) => patchSet(entryIdx, setIdx, { reps: e.target.value ? Number(e.target.value) : null })}
                    placeholder="—"
                  />
                </>
              )}

              <button
                onClick={() => {
                  const nowDone = !set.completed;
                  void patchSet(entryIdx, setIdx, { completed: nowDone });
                  // Starting the rest clock on completion is the whole point of
                  // having one — nobody taps a separate timer button mid-set.
                  if (nowDone && !set.isWarmup) setRestFrom(Date.now());
                }}
                aria-pressed={set.completed}
                aria-label={`Mark set ${setIdx + 1} ${set.completed ? "not done" : "done"}`}
                className="flex h-9 w-9 items-center justify-center justify-self-end rounded-lg border"
                style={{
                  borderColor: set.completed ? "var(--success-text)" : "var(--border-strong)",
                  background: set.completed ? "color-mix(in srgb, var(--success-text) 15%, transparent)" : "transparent",
                  color: set.completed ? "var(--success-text)" : "var(--text-muted)",
                }}
              >
                ✓
              </button>
            </div>
          ))}

          <div className="mt-2 flex gap-2">
            <button className="btn btn-secondary flex-1 py-1.5 text-sm" style={{ minHeight: 38 }} onClick={() => addSet(entryIdx)}>
              + Set
            </button>
            <button
              className="btn btn-ghost px-3 py-1.5 text-sm"
              style={{ minHeight: 38 }}
              onClick={() => {
                const lastIdx = entry.sets.length - 1;
                if (lastIdx >= 0) patchSet(entryIdx, lastIdx, { isWarmup: !entry.sets[lastIdx].isWarmup });
              }}
            >
              Toggle warm-up
            </button>
          </div>
        </section>
      ))}

      <button className="btn btn-secondary mb-3 w-full" onClick={onAddExercise}>
        + Add exercise
      </button>

      <button className="btn btn-danger w-full" onClick={onDiscard}>
        Discard workout
      </button>

      <p className="mt-4 text-center text-xs" style={{ color: "var(--text-muted)" }}>
        Saved on your phone as you go. It syncs when you have signal again.
      </p>

      {restFrom !== null && <RestTimer startedAt={restFrom} onDismiss={() => setRestFrom(null)} />}
    </>
  );
}
