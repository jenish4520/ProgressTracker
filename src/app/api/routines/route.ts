import { NextResponse } from "next/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { exercises, routineExercises, routines } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fail, handler, ok, parseBody } from "@/lib/api";
import { routineSchema } from "@/lib/validation";
import { lastPerformance } from "@/server/workouts";

export async function GET(): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser();

    const rows = await db
      .select()
      .from(routines)
      .where(and(eq(routines.userId, user.id), isNull(routines.archivedAt)))
      .orderBy(asc(routines.position), asc(routines.createdAt));

    if (!rows.length) return ok({ routines: [], lastPerformance: {} });

    const items = await db
      .select({
        id: routineExercises.id,
        routineId: routineExercises.routineId,
        exerciseId: routineExercises.exerciseId,
        position: routineExercises.position,
        targetSets: routineExercises.targetSets,
        targetReps: routineExercises.targetReps,
        restSeconds: routineExercises.restSeconds,
        name: exercises.name,
        muscleGroup: exercises.muscleGroup,
        kind: exercises.kind,
        isBodyweight: exercises.isBodyweight,
      })
      .from(routineExercises)
      .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
      .where(inArray(routineExercises.routineId, rows.map((r) => r.id)))
      .orderBy(asc(routineExercises.position));

    const last = await lastPerformance(user.id);

    return ok({
      routines: rows.map((r) => ({ ...r, exercises: items.filter((i) => i.routineId === r.id) })),
      // Serialised as a plain object so it survives JSON.
      lastPerformance: Object.fromEntries(last),
    });
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser();
    const body = await parseBody(request, routineSchema);

    // Every referenced exercise must be built-in or the caller's own.
    const ids = body.exercises.map((e) => e.exerciseId);
    if (ids.length) {
      const valid = await db
        .select({ id: exercises.id })
        .from(exercises)
        .where(and(inArray(exercises.id, ids), isNull(exercises.ownerId)));
      const own = await db
        .select({ id: exercises.id })
        .from(exercises)
        .where(and(inArray(exercises.id, ids), eq(exercises.ownerId, user.id)));
      const allowed = new Set([...valid, ...own].map((e) => e.id));
      if (ids.some((id) => !allowed.has(id))) return fail("Unknown exercise in routine.", 422);
    }

    const routine = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(routines)
        .values({ userId: user.id, name: body.name, note: body.note ?? null })
        .returning();

      if (body.exercises.length) {
        await tx.insert(routineExercises).values(
          body.exercises.map((e, i) => ({
            routineId: row.id,
            exerciseId: e.exerciseId,
            position: i,
            targetSets: e.targetSets,
            targetReps: e.targetReps,
            restSeconds: e.restSeconds,
          })),
        );
      }
      return row;
    });

    return ok(routine, 201);
  });
}
