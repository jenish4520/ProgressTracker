"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Meal } from "@/db/schema";
import type { MacroTargets } from "@/lib/nutrition";
import type { DayNutrition } from "@/server/energy";
import { addDays, formatDayLabel } from "@/lib/dates";
import { api } from "@/lib/client";
import MacroMeters from "@/components/charts/MacroMeters";
import AddFoodSheet from "@/components/AddFoodSheet";
import PageHeader from "@/components/PageHeader";

interface Entry {
  id: string;
  meal: Meal;
  nameSnapshot: string;
  quantityG: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

const MEALS: { key: Meal; label: string }[] = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
  { key: "snack", label: "Snacks" },
];

export default function FoodDay({
  date,
  todayRef,
  entries,
  totals,
  targets,
}: {
  date: string;
  /** The user's current day, resolved server-side in their timezone. */
  todayRef: string;
  entries: Entry[];
  totals: DayNutrition;
  targets: MacroTargets | null;
}) {
  const router = useRouter();
  const [sheetMeal, setSheetMeal] = useState<Meal | null>(null);

  const remaining = targets ? Math.round(targets.kcal - totals.kcal) : null;

  async function remove(id: string) {
    await api.del(`/api/log?id=${id}`);
    router.refresh();
  }

  function go(offset: number) {
    const next = addDays(date, offset);
    router.push(`/food?date=${next}`);
  }

  return (
    <>
      <PageHeader
        title="Food"
        subtitle={
          <span className="flex items-center gap-2">
            <button onClick={() => go(-1)} aria-label="Previous day" className="px-1" style={{ color: "var(--accent)" }}>‹</button>
            <span className="min-w-[7ch] text-center">{formatDayLabel(date, todayRef)}</span>
            <button
              onClick={() => go(1)}
              aria-label="Next day"
              className="px-1"
              disabled={date >= todayRef}
              style={{ color: date >= todayRef ? "var(--text-muted)" : "var(--accent)" }}
            >
              ›
            </button>
          </span>
        }
      />

      <section className="card mb-4 p-4">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="tnum text-3xl font-semibold leading-none">
              {Math.round(totals.kcal).toLocaleString("en-GB")}
            </p>
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              kcal eaten{targets ? ` of ${targets.kcal.toLocaleString("en-GB")}` : ""}
            </p>
          </div>
          {remaining !== null && (
            <p
              className="tnum text-right text-sm font-semibold"
              style={{ color: remaining >= 0 ? "var(--success-text)" : "var(--status-serious)" }}
            >
              {remaining >= 0 ? `${remaining.toLocaleString("en-GB")} left` : `${Math.abs(remaining).toLocaleString("en-GB")} over`}
            </p>
          )}
        </div>

        {targets && (
          <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <MacroMeters
              protein={{ current: totals.proteinG, target: targets.proteinG }}
              carbs={{ current: totals.carbsG, target: targets.carbsG }}
              fat={{ current: totals.fatG, target: targets.fatG }}
            />
          </div>
        )}
      </section>

      {MEALS.map((meal) => {
        const rows = entries.filter((e) => e.meal === meal.key);
        const mealKcal = rows.reduce((s, e) => s + e.kcal, 0);

        return (
          <section key={meal.key} className="card mb-3 p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-base font-semibold">{meal.label}</h2>
              <span className="tnum text-sm" style={{ color: "var(--text-muted)" }}>
                {mealKcal > 0 ? `${Math.round(mealKcal)} kcal` : ""}
              </span>
            </div>

            {rows.length > 0 && (
              <ul className="m-0 mb-2 flex list-none flex-col p-0">
                {rows.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 border-b py-2 last:border-0" style={{ borderColor: "var(--border)" }}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{e.nameSnapshot}</p>
                      <p className="tnum text-xs" style={{ color: "var(--text-muted)" }}>
                        {Math.round(e.quantityG)} g · P{Math.round(e.proteinG)} C{Math.round(e.carbsG)} F{Math.round(e.fatG)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="tnum text-sm font-semibold">{Math.round(e.kcal)}</span>
                      <button onClick={() => remove(e.id)} aria-label={`Remove ${e.nameSnapshot}`} style={{ color: "var(--text-muted)" }}>
                        ×
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <button className="btn btn-secondary w-full" onClick={() => setSheetMeal(meal.key)}>
              + Add to {meal.label.toLowerCase()}
            </button>
          </section>
        );
      })}

      {sheetMeal && (
        <AddFoodSheet
          date={date}
          meal={sheetMeal}
          onClose={() => setSheetMeal(null)}
          onAdded={() => {
            setSheetMeal(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
