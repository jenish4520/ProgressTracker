"use client";

import { pctOf } from "@/lib/food";

interface Props {
  protein: { current: number; target: number };
  carbs: { current: number; target: number };
  fat: { current: number; target: number };
}

const ROWS = [
  { key: "protein", label: "Protein", color: "var(--series-1)" },
  { key: "carbs", label: "Carbs", color: "var(--series-2)" },
  { key: "fat", label: "Fat", color: "var(--series-3)" },
] as const;

/**
 * Macro progress as labelled meters.
 *
 * Meters rather than a pie: the question is "how much of today's protein is
 * left", which is a magnitude against a target, not a share of a whole. Every
 * row carries its own text value, which is also what satisfies the contrast
 * relief rule for the lighter series colours.
 */
export default function MacroMeters({ protein, carbs, fat }: Props) {
  const data = { protein, carbs, fat };

  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {ROWS.map((row) => {
        const { current, target } = data[row.key];
        const pct = pctOf(current, target);
        const over = current > target && target > 0;

        return (
          <li key={row.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-medium">
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: row.color }} />
                {row.label}
              </span>
              <span className="tnum text-sm" style={{ color: "var(--text-secondary)" }}>
                {Math.round(current)}
                <span style={{ color: "var(--text-muted)" }}> / {Math.round(target)} g</span>
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full"
              style={{ background: "var(--grid)" }}
              role="meter"
              aria-valuenow={Math.round(current)}
              aria-valuemin={0}
              aria-valuemax={Math.round(target)}
              aria-label={`${row.label}: ${Math.round(current)} of ${Math.round(target)} grams`}
            >
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  width: `${Math.min(100, pct)}%`,
                  background: row.color,
                  // Hitting the target is the goal, not a warning; only the
                  // number turning bold flags an overshoot.
                  opacity: over ? 0.85 : 1,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
