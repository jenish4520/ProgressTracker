/**
 * Pure food/nutrition helpers.
 *
 * Deliberately free of server-only imports: the same portion maths runs in the
 * browser while the user drags a quantity slider and on the server when the
 * entry is persisted, and both must agree to the last calorie.
 */

export interface NormalisedFood {
  barcode: string | null;
  name: string;
  brand: string | null;
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  fiberPer100: number | null;
  sugarPer100: number | null;
  saltPer100: number | null;
  servingName: string | null;
  servingGrams: number | null;
  isLiquid: boolean;
}

export interface OffNutriments {
  "energy-kcal_100g"?: number | string;
  energy_100g?: number | string;
  proteins_100g?: number | string;
  carbohydrates_100g?: number | string;
  fat_100g?: number | string;
  fiber_100g?: number | string;
  sugars_100g?: number | string;
  salt_100g?: number | string;
}

export interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_de?: string;
  brands?: string;
  nutriments?: OffNutriments;
  serving_size?: string;
  serving_quantity?: number | string;
  categories_tags?: string[];
}

/** kJ per kcal — European labels lead with kilojoules. */
const KJ_PER_KCAL = 4.184;

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Converts a crowd-sourced Open Food Facts product into our per-100g shape.
 *
 * Returns null rather than a partial record when the essentials are missing.
 * OFF entries are user-contributed and frequently incomplete; a product with
 * no energy value would log as 0 kcal and quietly corrupt the day's total,
 * which is worse than telling the user to enter it by hand.
 */
export function normaliseProduct(p: OffProduct): NormalisedFood | null {
  const n = p.nutriments ?? {};

  // Prefer the explicit kcal figure, fall back to converting kJ.
  let kcal = num(n["energy-kcal_100g"]);
  if (kcal === null) {
    const kj = num(n.energy_100g);
    if (kj !== null) kcal = kj / KJ_PER_KCAL;
  }
  // Nothing edible exceeds ~900 kcal/100g (pure fat); above that the entry is
  // bad data, most often a kJ value mislabelled as kcal.
  if (kcal === null || kcal > 1000) return null;

  const name = (p.product_name_de || p.product_name || "").trim();
  if (!name) return null;

  const isLiquid = (p.categories_tags ?? []).some((t) =>
    /beverage|drink|water|juice|soda|milk|getr(a|ä)nke/i.test(t),
  );

  return {
    barcode: p.code?.trim() || null,
    name: name.slice(0, 160),
    brand: p.brands?.split(",")[0]?.trim().slice(0, 120) || null,
    kcalPer100: Math.round(kcal * 10) / 10,
    proteinPer100: num(n.proteins_100g) ?? 0,
    carbsPer100: num(n.carbohydrates_100g) ?? 0,
    fatPer100: num(n.fat_100g) ?? 0,
    fiberPer100: num(n.fiber_100g),
    sugarPer100: num(n.sugars_100g),
    saltPer100: num(n.salt_100g),
    servingName: p.serving_size?.trim().slice(0, 60) || null,
    servingGrams: num(p.serving_quantity),
    isLiquid,
  };
}

export interface Macros {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface Per100 {
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
}

/** Scales a per-100g food to an actual portion. */
export function macrosForQuantity(food: Per100, grams: number): Macros {
  const factor = grams / 100;
  return {
    kcal: round1(food.kcalPer100 * factor),
    proteinG: round1(food.proteinPer100 * factor),
    carbsG: round1(food.carbsPer100 * factor),
    fatG: round1(food.fatPer100 * factor),
  };
}

export function sumMacros(items: Macros[]): Macros {
  return items.reduce<Macros>(
    (acc, m) => ({
      kcal: round1(acc.kcal + m.kcal),
      proteinG: round1(acc.proteinG + m.proteinG),
      carbsG: round1(acc.carbsG + m.carbsG),
      fatG: round1(acc.fatG + m.fatG),
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}

/**
 * Parses a free-text serving size such as "30 g", "250ml" or "1 portion (45g)"
 * into grams. OFF's serving_size is a human-typed string, so this is
 * best-effort and returns null rather than guessing.
 */
export function parseServingGrams(text: string | null | undefined): number | null {
  if (!text) return null;
  // Prefer a value in parentheses, e.g. "1 Riegel (21,5 g)".
  const paren = text.match(/\(([^)]*)\)/);
  const candidates = paren ? [paren[1], text] : [text];

  for (const c of candidates) {
    const m = c.replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(g|ml)\b/i);
    if (m) {
      const value = Number(m[1]);
      if (Number.isFinite(value) && value > 0 && value <= 5000) return value;
    }
  }
  return null;
}

/** Percentage of a target hit so far, clamped for progress bars. */
export function pctOf(value: number, target: number): number {
  if (!(target > 0)) return 0;
  return Math.max(0, Math.min(999, Math.round((value / target) * 100)));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
