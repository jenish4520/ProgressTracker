import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normaliseProduct,
  macrosForQuantity,
  sumMacros,
  parseServingGrams,
  pctOf,
  type OffProduct,
} from "../src/lib/food.ts";

/**
 * Fixtures mirror the shape Open Food Facts actually returns, including the
 * inconsistencies: numbers arriving as strings, German-only product names,
 * missing macros, and kJ-only energy values on European labels.
 */

test("parses a well-formed product", () => {
  const p: OffProduct = {
    code: "3017620422003",
    product_name: "Nutella",
    brands: "Ferrero",
    nutriments: {
      "energy-kcal_100g": 539,
      proteins_100g: 6.3,
      carbohydrates_100g: 57.5,
      fat_100g: 30.9,
      sugars_100g: 56.3,
      salt_100g: 0.107,
    },
    serving_size: "15 g",
    serving_quantity: 15,
  };
  const f = normaliseProduct(p)!;

  assert.equal(f.name, "Nutella");
  assert.equal(f.brand, "Ferrero");
  assert.equal(f.kcalPer100, 539);
  assert.equal(f.proteinPer100, 6.3);
  assert.equal(f.servingGrams, 15);
  assert.equal(f.barcode, "3017620422003");
});

test("converts kJ-only energy, as European labels often carry", () => {
  // 1500 kJ / 4.184 = 358.5 kcal
  const f = normaliseProduct({
    product_name: "Haferflocken",
    nutriments: { energy_100g: 1500, proteins_100g: 13 },
  })!;
  assert.equal(f.kcalPer100, 358.5);
});

test("prefers the German product name when present", () => {
  const f = normaliseProduct({
    product_name: "Whole Milk",
    product_name_de: "Vollmilch",
    nutriments: { "energy-kcal_100g": 64 },
  })!;
  assert.equal(f.name, "Vollmilch");
});

test("copes with numeric fields arriving as strings", () => {
  const f = normaliseProduct({
    product_name: "Skyr",
    nutriments: { "energy-kcal_100g": "63", proteins_100g: "11", fat_100g: "0.2" },
    serving_quantity: "150",
  })!;
  assert.equal(f.kcalPer100, 63);
  assert.equal(f.proteinPer100, 11);
  assert.equal(f.servingGrams, 150);
});

test("rejects entries that would silently log as zero calories", () => {
  assert.equal(normaliseProduct({ product_name: "Mystery Item", nutriments: {} }), null);
  assert.equal(normaliseProduct({ nutriments: { "energy-kcal_100g": 100 } }), null, "no name");
  assert.equal(
    normaliseProduct({ product_name: "Bad Data", nutriments: { "energy-kcal_100g": 5000 } }),
    null,
    "5000 kcal/100g is a mislabelled kJ value, not a food",
  );
});

test("missing macros default to zero rather than breaking the record", () => {
  const f = normaliseProduct({
    product_name: "Black Coffee",
    nutriments: { "energy-kcal_100g": 2 },
  })!;
  assert.equal(f.proteinPer100, 0);
  assert.equal(f.carbsPer100, 0);
  assert.equal(f.fatPer100, 0);
  assert.equal(f.fiberPer100, null, "genuinely unknown stays null, unlike a real zero");
});

test("detects drinks so portions can be offered in ml", () => {
  const drink = normaliseProduct({
    product_name: "Apfelschorle",
    nutriments: { "energy-kcal_100g": 24 },
    categories_tags: ["en:beverages", "en:juices"],
  })!;
  assert.equal(drink.isLiquid, true);

  const solid = normaliseProduct({
    product_name: "Brot",
    nutriments: { "energy-kcal_100g": 250 },
    categories_tags: ["en:breads"],
  })!;
  assert.equal(solid.isLiquid, false);
});

test("takes only the first brand from OFF's comma-joined list", () => {
  const f = normaliseProduct({
    product_name: "Joghurt",
    brands: "Ehrmann, Ehrmann GmbH, ehrmann-ag",
    nutriments: { "energy-kcal_100g": 100 },
  })!;
  assert.equal(f.brand, "Ehrmann");
});

test("portion maths scales per-100g values correctly", () => {
  const food = { kcalPer100: 539, proteinPer100: 6.3, carbsPer100: 57.5, fatPer100: 30.9 };

  const fifteen = macrosForQuantity(food, 15);
  assert.equal(fifteen.kcal, 80.9); // 539 * 0.15
  assert.equal(fifteen.proteinG, 0.9);

  assert.equal(macrosForQuantity(food, 100).kcal, 539);
  assert.equal(macrosForQuantity(food, 0).kcal, 0);

  const doubled = macrosForQuantity(food, 200);
  assert.equal(doubled.kcal, 1078);
});

test("daily totals sum without floating point drift", () => {
  const day = sumMacros([
    { kcal: 80.9, proteinG: 0.9, carbsG: 8.6, fatG: 4.6 },
    { kcal: 250.1, proteinG: 12.2, carbsG: 30.0, fatG: 8.1 },
    { kcal: 610.0, proteinG: 45.5, carbsG: 55.2, fatG: 20.3 },
  ]);
  assert.equal(day.kcal, 941);
  assert.equal(day.proteinG, 58.6);
  assert.ok(Number.isInteger(day.carbsG * 10), "no 93.80000000000001 in the UI");
});

test("free-text serving sizes are parsed, or honestly refused", () => {
  assert.equal(parseServingGrams("30 g"), 30);
  assert.equal(parseServingGrams("250ml"), 250);
  assert.equal(parseServingGrams("1 Riegel (21,5 g)"), 21.5, "German decimal comma");
  assert.equal(parseServingGrams("1 portion"), null, "no number means no guess");
  assert.equal(parseServingGrams(null), null);
});

test("progress percentages stay sane at the edges", () => {
  assert.equal(pctOf(1000, 2000), 50);
  assert.equal(pctOf(2500, 2000), 125, "going over target must be visible, not clipped to 100");
  assert.equal(pctOf(0, 2000), 0);
  assert.equal(pctOf(100, 0), 0, "no target means no division by zero");
});
