"use client";

import { useMemo, useState } from "react";
import type { ExerciseRow } from "@/components/TrainScreen";

export default function ExercisePicker({
  exercises,
  onPick,
  onClose,
}: {
  exercises: ExerciseRow[];
  onPick: (e: ExerciseRow) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>("all");

  const groups = useMemo(
    () => ["all", ...Array.from(new Set(exercises.map((e) => e.muscleGroup))).sort()],
    [exercises],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises.filter(
      (e) =>
        (group === "all" || e.muscleGroup === group) &&
        (!q || e.name.toLowerCase().includes(q) || (e.equipment ?? "").toLowerCase().includes(q)),
    );
  }, [exercises, query, group]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Choose an exercise"
    >
      <div
        className="flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-2xl"
        style={{ background: "var(--surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Add exercise</h2>
            <button onClick={onClose} className="btn btn-ghost px-2" aria-label="Close">✕</button>
          </div>
          <input
            className="field"
            placeholder="Search exercises…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {groups.map((g) => (
              <button
                key={g}
                onClick={() => setGroup(g)}
                className="btn shrink-0 px-2.5 py-1 text-xs capitalize"
                style={{
                  minHeight: 32,
                  background: group === g ? "var(--accent)" : "var(--surface-raised)",
                  color: group === g ? "var(--accent-contrast)" : "var(--text-secondary)",
                  borderColor: group === g ? "var(--accent)" : "var(--border-strong)",
                }}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
          {filtered.map((e) => (
            <li key={e.id}>
              <button
                onClick={() => onPick(e)}
                className="flex w-full items-center justify-between gap-3 border-b px-4 py-3 text-left"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{e.name}</p>
                  <p className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                    {e.muscleGroup}
                    {e.equipment ? ` · ${e.equipment}` : ""}
                  </p>
                </div>
                <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>+</span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
              No exercises match. You can add custom ones in Settings.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
