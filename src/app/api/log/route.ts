import { NextResponse } from "next/server";
import { and, eq, isNull, or, desc } from "drizzle-orm";
import { db } from "@/db";
import { foodLogEntries, foods } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fail, handler, ok, parseBody } from "@/lib/api";
import { foodLogSchema } from "@/lib/validation";
import { isValidIsoDate, todayInZone } from "@/lib/dates";
import { macrosForQuantity } from "@/lib/food";
import { loadDayNutrition, loadEnergyState } from "@/server/energy";

/** A day's food log, with the targets it should be read against. */
export async function GET(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser();
    const date = new URL(request.url).searchParams.get("date") ?? todayInZone(user.timezone);
    if (!isValidIsoDate(date)) return fail("A valid date is required.", 422);

    const [entries, totals, state] = await Promise.all([
      db
        .select()
        .from(foodLogEntries)
        .where(and(eq(foodLogEntries.userId, user.id), eq(foodLogEntries.date, date)))
        .orderBy(foodLogEntries.createdAt),
      loadDayNutrition(user.id, date),
      loadEnergyState(user, date),
    ]);

    return ok({
      date,
      entries,
      totals,
      targets: state.macros,
      tdee: state.tdee,
    });
  });
}

/**
 * Adds an entry to the log.
 *
 * Macros are resolved here and stored on the row. Recomputing them later from
 * the food record would let an OFF data correction silently rewrite what you
 * ate last month; the log is a record of the past, not a live view of it.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser();
    const body = await parseBody(request, foodLogSchema);

    let per100: { kcalPer100: number; proteinPer100: number; carbsPer100: number; fatPer100: number };
    let name: string;
    let foodId: string | null = null;

    if (body.foodId) {
      const [food] = await db
        .select()
        .from(foods)
        .where(
          and(
            eq(foods.id, body.foodId),
            // Readable foods are the shared cache plus the caller's own.
            or(eq(foods.ownerId, user.id), isNull(foods.ownerId)),
          ),
        )
        .limit(1);
      if (!food) return fail("That food is not in your library.", 404);

      per100 = food;
      name = food.brand ? `${food.name} (${food.brand})` : food.name;
      foodId = food.id;
    } else if (body.manual) {
      const m = body.manual;
      if (typeof m.kcalPer100 !== "number" || !m.name) {
        return fail("A manual entry needs a name and calories per 100 g.", 422);
      }
      per100 = {
        kcalPer100: m.kcalPer100,
        proteinPer100: m.proteinPer100 ?? 0,
        carbsPer100: m.carbsPer100 ?? 0,
        fatPer100: m.fatPer100 ?? 0,
      };
      name = m.name;
    } else {
      return fail("Pick a food or enter one manually.", 422);
    }

    const macros = macrosForQuantity(per100, body.quantityG);

    const [entry] = await db
      .insert(foodLogEntries)
      .values({
        userId: user.id,
        date: body.date,
        meal: body.meal,
        foodId,
        quantityG: body.quantityG,
        nameSnapshot: name,
        kcal: macros.kcal,
        proteinG: macros.proteinG,
        carbsG: macros.carbsG,
        fatG: macros.fatG,
      })
      .returning();

    return ok({ entry, totals: await loadDayNutrition(user.id, body.date) }, 201);
  });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return fail("Which entry?", 422);

    const [deleted] = await db
      .delete(foodLogEntries)
      .where(and(eq(foodLogEntries.id, id), eq(foodLogEntries.userId, user.id)))
      .returning({ date: foodLogEntries.date });

    if (!deleted) return fail("No such log entry.", 404);
    return ok({ deleted: id, totals: await loadDayNutrition(user.id, deleted.date) });
  });
}

/** Recently logged foods, for one-tap repeat logging. */
export async function PATCH(): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser();
    const rows = await db
      .selectDistinctOn([foodLogEntries.nameSnapshot], {
        nameSnapshot: foodLogEntries.nameSnapshot,
        foodId: foodLogEntries.foodId,
        quantityG: foodLogEntries.quantityG,
        kcal: foodLogEntries.kcal,
        createdAt: foodLogEntries.createdAt,
      })
      .from(foodLogEntries)
      .where(eq(foodLogEntries.userId, user.id))
      .orderBy(foodLogEntries.nameSnapshot, desc(foodLogEntries.createdAt))
      .limit(30);
    return ok(rows);
  });
}
