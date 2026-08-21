import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { goals } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { handler, ok, parseBody } from "@/lib/api";
import { goalSchema } from "@/lib/validation";
import { loadEnergyState } from "@/server/energy";
import { today } from "@/lib/dates";

export async function GET(): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser();
    const state = await loadEnergyState(user);
    return ok({
      goal: state.goal,
      tdee: state.tdee,
      target: state.target,
      macros: state.macros,
      projection: state.projection,
      trendWeightKg: state.trendWeightKg,
      observedRateKgPerWeek: state.observedRateKgPerWeek,
    });
  });
}

/**
 * Replaces the active goal.
 *
 * The previous goal is retired rather than overwritten, so the history of what
 * was being aimed for when stays intact — useful later when looking back at
 * why a given block went the way it did.
 */
export async function PUT(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser();
    const body = await parseBody(request, goalSchema);
    const state = await loadEnergyState(user);

    const created = await db.transaction(async (tx) => {
      await tx
        .update(goals)
        .set({ isActive: false, endedAt: new Date() })
        .where(and(eq(goals.userId, user.id), eq(goals.isActive, true)));

      const [row] = await tx
        .insert(goals)
        .values({
          userId: user.id,
          type: body.type,
          // Maintenance has no rate by definition; ignore whatever was sent.
          rateKgPerWeek: body.type === "maintain" ? 0 : body.rateKgPerWeek,
          startWeightKg: body.startWeightKg ?? state.trendWeightKg ?? null,
          targetWeightKg: body.targetWeightKg ?? null,
          startDate: today(),
          calorieOverride: body.calorieOverride ?? null,
          proteinOverrideG: body.proteinOverrideG ?? null,
          fatOverrideG: body.fatOverrideG ?? null,
          isActive: true,
        })
        .returning();
      return row;
    });

    const refreshed = await loadEnergyState(user);
    return ok({
      goal: created,
      tdee: refreshed.tdee,
      target: refreshed.target,
      macros: refreshed.macros,
      projection: refreshed.projection,
    });
  });
}
