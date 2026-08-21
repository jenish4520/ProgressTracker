"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { UnitSystem } from "@/db/schema";
import {
  clearActive,
  loadActive,
  newClientId,
  queueWorkout,
  saveActive,
  type ActiveEntry,
  type ActiveWorkout,
} from "@/lib/offline";
import { formatDayShort, today } from "@/lib/dates";
import { estimateOneRepMax, formatDuration, totalVolumeKg, type SetLike } from "@/lib/training";
import { displayWeight, weightUnit } from "@/lib/units";
import PageHeader from "@/components/PageHeader";
import ActiveWorkoutView from "@/components/ActiveWorkoutView";
import ExercisePicker from "@/components/ExercisePicker";

export interface ExerciseRow {
  id: string;
  name: string;
  kind: "strength" | "cardio";
  muscleGroup: string;
  equipment: string | null;
  met: number;
  isBodyweight: boolean;
}

interface RoutineItem {
  routineId: string;
  exerciseId: string;
  targetSets: number;
  targetReps: number;
  restSeconds: number;
}

interface RoutineRow {
  id: string;
  name: string;
  note: string | null;
  items: RoutineItem[];
}

interface HistorySet {
  exerciseId: string;
  reps: number | null;
  weightKg: number | null;
  isWarmup: boolean;
  completed: boolean;
  durationSeconds: number | null;
  distanceM: number | null;
}

interface HistoryRow {
  id: string;
  name: string;
  date: string;
  caloriesBurned: number | null;
  startedAt: string;
  endedAt: string | null;
  sets: HistorySet[];
}

interface Props {
  unitSystem: UnitSystem;
  exercises: ExerciseRow[];
  routines: RoutineRow[];
  history: HistoryRow[];
  lastPerformance: Record<string, { date: string; reps: number | null; weightKg: number | null }>;
}

export default function TrainScreen({ unitSystem, exercises, routines, history, lastPerformance }: Props) {
  const router = useRouter();
  const [active, setActive] = useState<ActiveWorkout | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [picking, setPicking] = useState(false);

  const byId = new Map(exercises.map((e) => [e.id, e]));

  // Restore an in-progress session: closing the app mid-workout, or a phone
  // that decided to reboot between sets, must not lose the session.
  useEffect(() => {
    void loadActive().then((w) => {
      setActive(w);
      setLoaded(true);
    });
  }, []);

  const persist = useCallback(async (workout: ActiveWorkout | null) => {
    setActive(workout);
    if (workout) await saveActive(workout);
    else await clearActive();
  }, []);

  const startWorkout = useCallback(
    async (routine: RoutineRow | null) => {
      const entries: ActiveEntry[] = (routine?.items ?? []).flatMap((item) => {
        const ex = byId.get(item.exerciseId);
        if (!ex) return [];
        const prev = lastPerformance[item.exerciseId];
        return [
          {
            exerciseId: ex.id,
            exerciseName: ex.name,
            kind: ex.kind,
            // Pre-filled from last time so progressive overload is a decision,
            // not an archaeology exercise between sets.
            sets: Array.from({ length: item.targetSets }, () => ({
              reps: prev?.reps ?? item.targetReps,
              weightKg: prev?.weightKg ?? null,
              durationSeconds: null,
              distanceM: null,
              rpe: null,
              isWarmup: false,
              completed: false,
            })),
          },
        ];
      });

      await persist({
        clientId: newClientId(),
        name: routine?.name ?? "Workout",
        date: today(),
        routineId: routine?.id ?? null,
        startedAt: new Date().toISOString(),
        note: null,
        entries,
      });
    },
    [byId, lastPerformance, persist],
  );

  const finish = useCallback(async () => {
    if (!active) return;

    const sets = active.entries.flatMap((entry, position) =>
      entry.sets
        .filter((s) => s.completed)
        .map((s, i) => ({
          exerciseId: entry.exerciseId,
          position,
          setIndex: i + 1,
          reps: s.reps,
          weightKg: s.weightKg,
          rpe: s.rpe,
          isWarmup: s.isWarmup,
          durationSeconds: s.durationSeconds,
          distanceM: s.distanceM,
          completed: true,
        })),
    );

    // Queued first, then synced. Writing to the device before the network
    // means a dropped connection at the moment you tap "finish" costs nothing.
    await queueWorkout({
      clientId: active.clientId,
      name: active.name,
      date: active.date,
      routineId: active.routineId,
      startedAt: active.startedAt,
      endedAt: new Date().toISOString(),
      note: active.note,
      sets,
    });
    await clearActive();
    setActive(null);

    window.dispatchEvent(new CustomEvent("tracker:queued"));
    try {
      const { flushQueue } = await import("@/lib/offline");
      await flushQueue();
      router.refresh();
    } catch {
      // Stays queued; OfflineSync retries when the connection returns.
    }
  }, [active, router]);

  if (!loaded) {
    return <p className="py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>;
  }

  if (active) {
    return (
      <>
        <ActiveWorkoutView
          workout={active}
          unitSystem={unitSystem}
          onChange={persist}
          onFinish={finish}
          onAddExercise={() => setPicking(true)}
          onDiscard={async () => {
            if (confirm("Discard this workout? Nothing will be saved.")) await persist(null);
          }}
        />
        {picking && (
          <ExercisePicker
            exercises={exercises}
            onClose={() => setPicking(false)}
            onPick={async (ex) => {
              const prev = lastPerformance[ex.id];
              await persist({
                ...active,
                entries: [
                  ...active.entries,
                  {
                    exerciseId: ex.id,
                    exerciseName: ex.name,
                    kind: ex.kind,
                    sets: [
                      {
                        reps: prev?.reps ?? (ex.kind === "cardio" ? null : 8),
                        weightKg: prev?.weightKg ?? null,
                        durationSeconds: null,
                        distanceM: null,
                        rpe: null,
                        isWarmup: false,
                        completed: false,
                      },
                    ],
                  },
                ],
              });
              setPicking(false);
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Train"
        subtitle="Start from a routine, or just begin and add as you go"
        action={
          <Link href="/train/routines" className="btn btn-secondary px-3 text-sm">
            Routines
          </Link>
        }
      />

      <button className="btn btn-primary mb-4 w-full" onClick={() => startWorkout(null)}>
        Start empty workout
      </button>

      {routines.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Your routines
          </h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {routines.map((r) => (
              <li key={r.id}>
                <button className="card flex w-full items-center justify-between gap-3 p-3 text-left" onClick={() => startWorkout(r)}>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.name}</p>
                    <p className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                      {r.items.length} exercise{r.items.length === 1 ? "" : "s"}
                      {r.note ? ` · ${r.note}` : ""}
                    </p>
                  </div>
                  <span className="btn btn-secondary shrink-0 px-3 py-1 text-xs" style={{ minHeight: 32 }}>Start</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          History
        </h2>
        {history.length === 0 ? (
          <p className="card p-4 text-sm" style={{ color: "var(--text-muted)" }}>
            Nothing logged yet. Start a workout and it will show up here.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {history.map((w) => {
              const working = w.sets.filter((s) => !s.isWarmup && s.completed);
              const volume = totalVolumeKg(w.sets as SetLike[]);
              const best = working.reduce<number | null>((acc, s) => {
                if (!s.reps || !s.weightKg) return acc;
                const e1rm = estimateOneRepMax(s.weightKg, s.reps);
                return e1rm !== null && (acc === null || e1rm > acc) ? e1rm : acc;
              }, null);
              const duration = w.endedAt
                ? (new Date(w.endedAt).getTime() - new Date(w.startedAt).getTime()) / 1000
                : null;

              return (
                <li key={w.id} className="card p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate font-semibold">{w.name}</p>
                    <span className="shrink-0 text-xs" style={{ color: "var(--text-muted)" }}>
                      {formatDayShort(w.date)}
                    </span>
                  </div>
                  <p className="tnum mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                    {working.length} sets
                    {volume > 0 ? ` · ${displayWeight(volume, unitSystem, 0).toLocaleString("en-GB")} ${weightUnit(unitSystem)} volume` : ""}
                    {best ? ` · best ${displayWeight(best, unitSystem)} ${weightUnit(unitSystem)} e1RM` : ""}
                    {duration ? ` · ${formatDuration(duration)}` : ""}
                    {w.caloriesBurned ? ` · ~${w.caloriesBurned} kcal` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
