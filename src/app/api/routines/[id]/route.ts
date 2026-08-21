import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { routineExercises, routines } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fail, handler, ok, parseBody } from "@/lib/api";
import { routineSchema } from "@/lib/validation";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser();
    const { id } = await params;
    const body = await parseBody(request, routineSchema);

    const [existing] = await db
      .select({ id: routines.id })
      .from(routines)
      .where(and(eq(routines.id, id), eq(routines.userId, user.id)))
      .limit(1);
    if (!existing) return fail("No such routine.", 404);

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(routines)
        .set({ name: body.name, note: body.note ?? null })
        .where(eq(routines.id, id))
        .returning();

      await tx.delete(routineExercises).where(eq(routineExercises.routineId, id));
      if (body.exercises.length) {
        await tx.insert(routineExercises).values(
          body.exercises.map((e, i) => ({
            routineId: id,
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

    return ok(updated);
  });
}

/**
 * Archives rather than deletes: past workouts reference the routine they came
 * from, and losing that link would erase the context of old sessions.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser();
    const { id } = await params;

    const archived = await db
      .update(routines)
      .set({ archivedAt: new Date() })
      .where(and(eq(routines.id, id), eq(routines.userId, user.id)))
      .returning({ id: routines.id });

    if (!archived.length) return fail("No such routine.", 404);
    return ok({ archived: id });
  });
}
