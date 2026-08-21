import { asc, eq, isNull, or, and } from "drizzle-orm";
import { db } from "@/db";
import { exercises, routineExercises, routines } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { lastPerformance, listWorkouts } from "@/server/workouts";
import TrainScreen from "@/components/TrainScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Train · ProgressTracker" };

export default async function TrainPage() {
  const user = await requireUser();

  const [catalogue, myRoutines, history, last] = await Promise.all([
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
    listWorkouts(user.id, 20),
    lastPerformance(user.id),
  ]);

  const routineItems = myRoutines.length
    ? await db
        .select()
        .from(routineExercises)
        .orderBy(asc(routineExercises.position))
    : [];

  const mine = new Set(myRoutines.map((r) => r.id));

  return (
    <TrainScreen
      unitSystem={user.unitSystem}
      exercises={catalogue}
      routines={myRoutines.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        archivedAt: r.archivedAt?.toISOString() ?? null,
        items: routineItems.filter((i) => i.routineId === r.id && mine.has(i.routineId)),
      }))}
      history={history.map((w) => ({
        id: w.id,
        name: w.name,
        date: w.date,
        caloriesBurned: w.caloriesBurned,
        startedAt: w.startedAt.toISOString(),
        endedAt: w.endedAt?.toISOString() ?? null,
        sets: w.sets.map((s) => ({
          exerciseId: s.exerciseId,
          reps: s.reps,
          weightKg: s.weightKg,
          isWarmup: s.isWarmup,
          completed: s.completed,
          durationSeconds: s.durationSeconds,
          distanceM: s.distanceM,
        })),
      }))}
      lastPerformance={Object.fromEntries(last)}
    />
  );
}
