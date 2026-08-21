import { NextResponse } from "next/server";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { foods } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fail, handler, ok } from "@/lib/api";
import { cacheFood, lookupBarcode } from "@/server/openfoodfacts";

/** Resolves a scanned barcode, checking the local cache before calling out. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser();
    const { code } = await params;
    if (!/^\d{6,14}$/.test(code)) return fail("That does not look like a barcode.", 422);

    const [cached] = await db
      .select()
      .from(foods)
      .where(and(eq(foods.barcode, code), or(eq(foods.ownerId, user.id), isNull(foods.ownerId))))
      .limit(1);
    if (cached) return ok({ food: cached, source: "cache" });

    const product = await lookupBarcode(code);
    if (!product) {
      return fail(
        "That product is not in Open Food Facts yet. You can add it as a custom food.",
        404,
      );
    }

    const id = await cacheFood(product);
    const [food] = await db.select().from(foods).where(eq(foods.id, id)).limit(1);
    return ok({ food, source: "openfoodfacts" });
  });
}
