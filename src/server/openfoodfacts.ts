import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { foods } from "@/db/schema";
import { normaliseProduct, type NormalisedFood, type OffProduct } from "@/lib/food";

/**
 * Open Food Facts client.
 *
 * OFF is a free, open, crowd-sourced product database with strong coverage of
 * German retail (Rewe, Aldi, Lidl, dm), which is what makes barcode scanning
 * viable here without a commercial nutrition API.
 *
 * Their terms ask that clients identify themselves, and results are cached
 * locally as global `foods` rows so a repeated scan of the same product costs
 * one local query instead of a round trip.
 */

const OFF_BASE = "https://world.openfoodfacts.org";
const USER_AGENT = "ProgressTracker/0.1 (self-hosted personal fitness tracker)";
const TIMEOUT_MS = 6000;

const FIELDS = [
  "code",
  "product_name",
  "product_name_de",
  "brands",
  "nutriments",
  "serving_size",
  "serving_quantity",
  "quantity",
  "categories_tags",
].join(",");

async function offFetch(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
      // Product data is stable enough that a day of caching is generous.
      next: { revalidate: 86_400 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    // Network trouble is expected and non-fatal: the caller falls back to the
    // local food library so the user can still log something.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupBarcode(barcode: string): Promise<NormalisedFood | null> {
  if (!/^\d{6,14}$/.test(barcode)) return null;
  const json = (await offFetch(
    `${OFF_BASE}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`,
  )) as { status?: number; product?: OffProduct } | null;

  if (!json || json.status !== 1 || !json.product) return null;
  return normaliseProduct(json.product);
}

export async function searchProducts(query: string, limit = 20): Promise<NormalisedFood[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const url =
    `${OFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(q)}` +
    `&search_simple=1&action=process&json=1&page_size=${limit}&fields=${FIELDS}`;

  const json = (await offFetch(url)) as { products?: OffProduct[] } | null;
  if (!json?.products) return [];

  const seen = new Set<string>();
  const out: NormalisedFood[] = [];
  for (const p of json.products) {
    const f = normaliseProduct(p);
    if (!f) continue;
    const key = `${f.name}|${f.brand ?? ""}`.toLowerCase();
    if (seen.has(key)) continue; // OFF returns near-duplicate entries routinely
    seen.add(key);
    out.push(f);
  }
  return out;
}

/**
 * Persists an OFF product as a shared food row and returns its id.
 *
 * Stored with owner_id NULL so the cache is shared: if a friend has already
 * scanned that jar of Skyr, the next scan resolves locally.
 */
export async function cacheFood(food: NormalisedFood): Promise<string> {
  if (food.barcode) {
    const existing = await db
      .select({ id: foods.id })
      .from(foods)
      .where(and(eq(foods.barcode, food.barcode), isNull(foods.ownerId)))
      .limit(1);
    if (existing[0]) return existing[0].id;
  }

  const [row] = await db
    .insert(foods)
    .values({
      ownerId: null,
      source: "openfoodfacts",
      barcode: food.barcode,
      name: food.name,
      brand: food.brand,
      kcalPer100: food.kcalPer100,
      proteinPer100: food.proteinPer100,
      carbsPer100: food.carbsPer100,
      fatPer100: food.fatPer100,
      fiberPer100: food.fiberPer100,
      sugarPer100: food.sugarPer100,
      saltPer100: food.saltPer100,
      servingName: food.servingName,
      servingGrams: food.servingGrams,
      isLiquid: food.isLiquid,
    })
    .onConflictDoNothing()
    .returning({ id: foods.id });

  if (row) return row.id;

  // Lost an insert race with a concurrent scan of the same barcode.
  const [existing] = await db
    .select({ id: foods.id })
    .from(foods)
    .where(and(eq(foods.barcode, food.barcode!), isNull(foods.ownerId)))
    .limit(1);
  return existing.id;
}
