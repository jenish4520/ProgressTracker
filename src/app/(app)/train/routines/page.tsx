import { and, asc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { exercises, routineExercises, routines } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import RoutineManager from "@/components/RoutineManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Routines · ProgressTracker" };

export default async function RoutinesPage() {
  const user = await requireUser();

  const [catalogue, mine] = await Promise.all([
    db
      .select()
      .from(exercises)
      .where(or(isNull(exercises.ownerId), eq(exercises.ownerId, user.id)))
      .orderBy(asc(exercises.muscleGroup), asc(exercises.name)),
    db
      .select()
      .from(routines)
      .where(and(eq(routines.userId, user.id), isNull(routines.archivedAt)))
      .orderBy(asc(routines.position), asc(routines.createdAt)),
  ]);

  const items = mine.length
    ? await db.select().from(routineExercises).orderBy(asc(routineExercises.position))
    : [];
  const mineIds = new Set(mine.map((r) => r.id));

  return (
    <RoutineManager
      exercises={catalogue}
      routines={mine.map((r) => ({
        id: r.id,
        name: r.name,
        note: r.note,
        items: items
          .filter((i) => i.routineId === r.id && mineIds.has(i.routineId))
          .map((i) => ({
            exerciseId: i.exerciseId,
            targetSets: i.targetSets,
            targetReps: i.targetReps,
            restSeconds: i.restSeconds,
          })),
      }))}
    />
  );
}
