"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client";
import type { ExerciseRow } from "@/components/TrainScreen";
import ExercisePicker from "@/components/ExercisePicker";
import PageHeader from "@/components/PageHeader";

interface Item {
  exerciseId: string;
  targetSets: number;
  targetReps: number;
  restSeconds: number;
}

interface Routine {
  id: string;
  name: string;
  note: string | null;
  items: Item[];
}

/** Sensible starting points, so a beginner is not staring at an empty screen. */
const TEMPLATES: { name: string; note: string; match: string[][] }[] = [
  {
    name: "Push Day",
    note: "Chest, shoulders, triceps",
    match: [["Bench Press"], ["Overhead Press"], ["Incline Dumbbell Press"], ["Lateral Raise"], ["Triceps Pushdown"]],
  },
  {
    name: "Pull Day",
    note: "Back and biceps",
    match: [["Deadlift"], ["Pull-Up"], ["Barbell Row"], ["Face Pull"], ["Barbell Curl"]],
  },
  {
    name: "Leg Day",
    note: "Quads, hamstrings, glutes",
    match: [["Back Squat"], ["Romanian Deadlift"], ["Leg Press"], ["Leg Curl"], ["Calf Raise"]],
  },
  {
    name: "Full Body",
    note: "A solid three-times-a-week starting point",
    match: [["Back Squat"], ["Bench Press"], ["Barbell Row"], ["Overhead Press"], ["Plank"]],
  },
];

export default function RoutineManager({ exercises, routines }: { exercises: ExerciseRow[]; routines: Routine[] }) {
  const router = useRouter();
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const byName = new Map(exercises.map((e) => [e.name.toLowerCase(), e]));

  const [editing, setEditing] = useState<Routine | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function blank(): Routine {
    return { id: "", name: "", note: null, items: [] };
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      const payload = { name: editing.name, note: editing.note, exercises: editing.items };
      if (editing.id) await api.put(`/api/routines/${editing.id}`, payload);
      else await api.post("/api/routines", payload);
      setEditing(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save that routine.");
    } finally {
      setBusy(false);
    }
  }

  async function archive(id: string) {
    if (!confirm("Remove this routine? Past workouts that used it are kept.")) return;
    await api.del(`/api/routines/${id}`);
    router.refresh();
  }

  async function fromTemplate(t: (typeof TEMPLATES)[number]) {
    setBusy(true);
    try {
      const items = t.match
        .map(([name]) => byName.get(name.toLowerCase()))
        .filter((e): e is ExerciseRow => Boolean(e))
        .map((e) => ({ exerciseId: e.id, targetSets: 3, targetReps: 8, restSeconds: 120 }));

      await api.post("/api/routines", { name: t.name, note: t.note, exercises: items });
      router.refresh();
    } catch {
      setError("Could not create that routine.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <>
        <PageHeader title={editing.id ? "Edit routine" : "New routine"} />

        <div className="card mb-4 flex flex-col gap-3 p-4">
          <div>
            <label className="label" htmlFor="rname">Name</label>
            <input
              id="rname"
              className="field"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="Push Day"
              autoFocus
            />
          </div>
          <div>
            <label className="label" htmlFor="rnote">Note (optional)</label>
            <input
              id="rnote"
              className="field"
              value={editing.note ?? ""}
              onChange={(e) => setEditing({ ...editing, note: e.target.value || null })}
              placeholder="Chest, shoulders, triceps"
            />
          </div>
        </div>

        <ul className="m-0 mb-3 flex list-none flex-col gap-2 p-0">
          {editing.items.map((item, i) => {
            const ex = byId.get(item.exerciseId);
            return (
              <li key={`${item.exerciseId}-${i}`} className="card p-3">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <p className="truncate font-medium">{ex?.name ?? "Unknown exercise"}</p>
                  <button
                    className="shrink-0 text-xs"
                    style={{ color: "var(--text-muted)" }}
                    onClick={() => setEditing({ ...editing, items: editing.items.filter((_, j) => j !== i) })}
                  >
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ["targetSets", "Sets"],
                    ["targetReps", "Reps"],
                    ["restSeconds", "Rest (s)"],
                  ] as const).map(([key, label]) => (
                    <div key={key}>
                      <label className="label" htmlFor={`${key}-${i}`}>{label}</label>
                      <input
                        id={`${key}-${i}`}
                        type="number"
                        inputMode="numeric"
                        className="field px-2 py-1.5"
                        value={item[key]}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            items: editing.items.map((it, j) =>
                              j === i ? { ...it, [key]: Number(e.target.value) || 0 } : it,
                            ),
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>

        <button className="btn btn-secondary mb-4 w-full" onClick={() => setPicking(true)}>
          + Add exercise
        </button>

        {error && <p role="alert" className="mb-3 text-sm" style={{ color: "var(--status-critical)" }}>{error}</p>}

        <div className="flex gap-3">
          <button className="btn btn-secondary flex-1" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
          <button className="btn btn-primary flex-1" onClick={save} disabled={busy || !editing.name.trim()}>
            {busy ? "Saving…" : "Save routine"}
          </button>
        </div>

        {picking && (
          <ExercisePicker
            exercises={exercises}
            onClose={() => setPicking(false)}
            onPick={(ex) => {
              setEditing({
                ...editing,
                items: [...editing.items, { exerciseId: ex.id, targetSets: 3, targetReps: 8, restSeconds: 120 }],
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
        title="Routines"
        subtitle="Saved sessions that pre-fill with last time's numbers"
        action={
          <Link href="/train" className="btn btn-secondary px-3 text-sm">
            Back
          </Link>
        }
      />

      <button className="btn btn-primary mb-4 w-full" onClick={() => setEditing(blank())}>
        + New routine
      </button>

      {routines.length > 0 ? (
        <ul className="m-0 mb-6 flex list-none flex-col gap-2 p-0">
          {routines.map((r) => (
            <li key={r.id} className="card flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{r.name}</p>
                <p className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                  {r.items.length} exercise{r.items.length === 1 ? "" : "s"}
                  {r.note ? ` · ${r.note}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button className="btn btn-secondary px-3 py-1 text-xs" style={{ minHeight: 34 }} onClick={() => setEditing(r)}>
                  Edit
                </button>
                <button className="btn btn-ghost px-2 py-1 text-xs" style={{ minHeight: 34 }} onClick={() => archive(r.id)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Start from a template
          </h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {TEMPLATES.map((t) => (
              <li key={t.name}>
                <button className="card w-full p-3 text-left" onClick={() => fromTemplate(t)} disabled={busy}>
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>{t.note}</p>
                </button>
              </li>
            ))}
          </ul>
          {error && <p role="alert" className="mt-3 text-sm" style={{ color: "var(--status-critical)" }}>{error}</p>}
        </section>
      )}
    </>
  );
}
