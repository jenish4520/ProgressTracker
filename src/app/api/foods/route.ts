import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { foods } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fail, handler, ok, parseBody } from "@/lib/api";
import { foodSchema } from "@/lib/validation";

/** The user's own saved foods. */
export async function GET(): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser();
    const rows = await db
      .select()
      .from(foods)
      .where(eq(foods.ownerId, user.id))
      .orderBy(desc(foods.createdAt))
      .limit(200);
    return ok(rows);
  });
}

/** Creates a personal food — a home recipe, or a product OFF has never heard of. */
export async function POST(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser();
    const body = await parseBody(request, foodSchema);

    const [row] = await db
      .insert(foods)
      .values({
        ownerId: user.id,
        source: "custom",
        barcode: body.barcode ?? null,
        name: body.name,
        brand: body.brand ?? null,
        kcalPer100: body.kcalPer100,
        proteinPer100: body.proteinPer100,
        carbsPer100: body.carbsPer100,
        fatPer100: body.fatPer100,
        fiberPer100: body.fiberPer100 ?? null,
        sugarPer100: body.sugarPer100 ?? null,
        saltPer100: body.saltPer100 ?? null,
        servingName: body.servingName ?? null,
        servingGrams: body.servingGrams ?? null,
        isLiquid: body.isLiquid,
      })
      .returning();

    return ok(row, 201);
  });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return fail("Which food?", 422);

    // Only ever the caller's own food; shared cache rows are not deletable.
    const deleted = await db
      .delete(foods)
      .where(and(eq(foods.id, id), eq(foods.ownerId, user.id)))
      .returning({ id: foods.id });

    if (!deleted.length) return fail("No such food in your library.", 404);
    return ok({ deleted: id });
  });
}
