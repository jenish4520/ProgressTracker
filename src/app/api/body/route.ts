import { NextResponse } from "next/server";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { bodyEntries } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fail, handler, ok, parseBody } from "@/lib/api";
import { bodyEntrySchema } from "@/lib/validation";
import { addDays, isValidIsoDate, today } from "@/lib/dates";
import { loadEnergyState } from "@/server/energy";

export async function GET(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser();
    const url = new URL(request.url);
    const days = Math.min(Number(url.searchParams.get("days") ?? 180) || 180, 730);

    const entries = await db
      .select()
      .from(bodyEntries)
      .where(and(eq(bodyEntries.userId, user.id), gte(bodyEntries.date, addDays(today(), -days))))
      .orderBy(desc(bodyEntries.date));

    const state = await loadEnergyState(user);
    return ok({
      entries,
      trend: state.trend,
      trendWeightKg: state.trendWeightKg,
      observedRateKgPerWeek: state.observedRateKgPerWeek,
      projection: state.projection,
      goal: state.goal,
    });
  });
}

/**
 * Upserts the entry for a day.
 *
 * Weighing twice in a morning should correct the day rather than add a second
 * point the trend then averages — hence one row per user per day, enforced by
 * a unique index and resolved here.
 */
export async function PUT(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser();
    const body = await parseBody(request, bodyEntrySchema);

    const measurements = {
      weightKg: body.weightKg ?? null,
      bodyFatPct: body.bodyFatPct ?? null,
      waistCm: body.waistCm ?? null,
      chestCm: body.chestCm ?? null,
      hipsCm: body.hipsCm ?? null,
      armCm: body.armCm ?? null,
      thighCm: body.thighCm ?? null,
      neckCm: body.neckCm ?? null,
      note: body.note ?? null,
    };

    if (Object.values(measurements).every((v) => v === null)) {
      return fail("Enter at least one measurement.", 422);
    }

    const [entry] = await db
      .insert(bodyEntries)
      .values({ userId: user.id, date: body.date, ...measurements })
      .onConflictDoUpdate({
        target: [bodyEntries.userId, bodyEntries.date],
        set: { ...measurements, updatedAt: new Date() },
      })
      .returning();

    return ok(entry);
  });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser();
    const date = new URL(request.url).searchParams.get("date");
    if (!isValidIsoDate(date)) return fail("A valid date is required.", 422);

    const deleted = await db
      .delete(bodyEntries)
      // Scoped by user id as well as date: an id alone would let one account
      // delete another's row by guessing.
      .where(and(eq(bodyEntries.userId, user.id), eq(bodyEntries.date, date)))
      .returning({ id: bodyEntries.id });

    if (!deleted.length) return fail("No entry on that date.", 404);
    return ok({ deleted: date });
  });
}
