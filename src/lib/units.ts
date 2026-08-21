/**
 * Unit conversion and display.
 *
 * Everything is stored in metric — kg, cm, grams — and converted only at the
 * edges. Storing whatever the user happened to type would mean every
 * calculation had to know which unit each row was in.
 */
import type { UnitSystem } from "@/db/schema";
import { round } from "./trend";

const LB_PER_KG = 2.2046226218;
const CM_PER_INCH = 2.54;

export const kgToLb = (kg: number) => kg * LB_PER_KG;
export const lbToKg = (lb: number) => lb / LB_PER_KG;
export const cmToIn = (cm: number) => cm / CM_PER_INCH;
export const inToCm = (inch: number) => inch * CM_PER_INCH;

export function weightUnit(system: UnitSystem): string {
  return system === "metric" ? "kg" : "lb";
}
export function lengthUnit(system: UnitSystem): string {
  return system === "metric" ? "cm" : "in";
}

/** Converts a stored kg value into the user's display unit. */
export function displayWeight(kg: number, system: UnitSystem, dp = 1): number {
  return round(system === "metric" ? kg : kgToLb(kg), dp);
}

/** Converts a user-entered weight back into kg for storage. */
export function storeWeight(value: number, system: UnitSystem): number {
  return system === "metric" ? value : lbToKg(value);
}

export function displayLength(cm: number, system: UnitSystem, dp = 1): number {
  return round(system === "metric" ? cm : cmToIn(cm), dp);
}

export function storeLength(value: number, system: UnitSystem): number {
  return system === "metric" ? value : inToCm(value);
}

export function formatWeight(kg: number | null, system: UnitSystem, dp = 1): string {
  if (kg === null || !Number.isFinite(kg)) return "—";
  return `${displayWeight(kg, system, dp).toFixed(dp)} ${weightUnit(system)}`;
}

/** Signed rate for display, e.g. "-0.42 kg/week". */
export function formatRate(kgPerWeek: number | null, system: UnitSystem): string {
  if (kgPerWeek === null || !Number.isFinite(kgPerWeek)) return "—";
  const v = system === "metric" ? kgPerWeek : kgToLb(kgPerWeek);
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)} ${weightUnit(system)}/week`;
}

export function formatKcal(kcal: number | null): string {
  if (kcal === null || !Number.isFinite(kcal)) return "—";
  return `${Math.round(kcal).toLocaleString("en-GB")} kcal`;
}
