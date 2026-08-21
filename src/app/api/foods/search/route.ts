import { NextResponse } from "next/server";
import { and, desc, eq, isNull, or, sql as raw } from "drizzle-orm";
import { db } from "@/db";
import { foods } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/api";
import { searchProducts } from "@/server/openfoodfacts";

/**
 * Food search: the user's own library first, then Open Food Facts.
 *
 * Local results lead because a food you have logged before is far more likely
 * to be what you want than a fuzzy match from a database of three million
 * products — and it stays fast and works offline-ish when OFF is unreachable.
 */
export async function GET(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser();
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const remote = url.searchParams.get("remote") !== "false";

    if (q.length < 2) return ok({ local: [], remote: [] });

    const local = await db
      .select()
      .from(foods)
      .where(
        and(
          // The shared OFF cache plus this user's own foods; never another
          // user's private entries.
          or(eq(foods.ownerId, user.id), isNull(foods.ownerId)),
          raw`${foods.name} ILIKE ${"%" + q + "%"}`,
        ),
      )
      // Personal foods rank above cached ones.
      .orderBy(raw`${foods.ownerId} IS NULL`, desc(foods.createdAt))
      .limit(25);

    // A network failure here degrades to local-only rather than erroring: the
    // user can still log something.
    const remoteResults = remote ? await searchProducts(q) : [];
    const knownBarcodes = new Set(local.map((f) => f.barcode).filter(Boolean));

    return ok({
      local,
      remote: remoteResults.filter((r) => !r.barcode || !knownBarcodes.has(r.barcode)),
    });
  });
}
