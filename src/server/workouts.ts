import "server-only";
import { and, eq, desc, gte, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { bodyEntries, exercises, workouts, workoutSets } from "@/db/schema";
import { addDays, today, type IsoDate } from "@/lib/dates";
import { estimateCaloriesBurned, type ExerciseMeta, type SetLike } from "@/lib/training";
import type { WorkoutInput } from "@/lib/validation";

/**
 * Bodyweight nearest a given date, used to scale the MET burn estimate.
 *
 * Falls back to the most recent known weight, then to a neutral default: a
 * missing weigh-in should degrade the estimate, not drop the workout.
 */
async function bodyweightFor(userId: string, date: IsoDate): Promise<number> {
  const [recent] = await db
    .select({ weightKg: bodyEntries.weightKg })
    .from(bodyEntries)
    .where(and(eq(bodyEntries.userId, userId), gte(bodyEntries.date, addDays(date, -120))))
    .orderBy(desc(bodyEntries.date))
    .limit(1);
  return recent?.weightKg ?? 75;
}

/**
 * Creates or updates a workout, keyed on the device-assigned client id.
 *
 * This is the operation the offline queue replays, so it must be idempotent:
 * pushing the same workout twice after a dropped connection has to converge on
 * one row, not two. Sets are replaced wholesale rather than diffed, because
 * the device's copy is authoritative for a session it recorded.
 */
export async function upsertWorkout(userId: string, input: WorkoutInput) {
  const referenced = [...new Set(input.sets.map((s) => s.exerciseId))];

  // Exercises must be built-in or the caller's own; this both validates the
  // foreign keys and stops one account referencing another's custom exercise.
  const allowed = referenced.length
    ? await db
        .select({ id: exercises.id, name: exercises.name, kind: exercises.kind, met: exercises.met, isBodyweight: exercises.isBodyweight })
        .from(exercises)
        .where(
          and(
            inArray(exercises.id, referenced),
            // Built-in catalogue entries, or this user's own. Without the
            // ownership filter a crafted sync payload could pull another
            // account's private custom exercise into a workout.
            or(isNull(exercises.ownerId), eq(exercises.ownerId, userId)),
          ),
        )
    : [];
  const allowedIds = new Set(allowed.map((e) => e.id));
  const validSets = input.sets.filter((s) => allowedIds.has(s.exerciseId));

  const meta = new Map<string, ExerciseMeta>(allowed.map((e) => [e.id, e as ExerciseMeta]));

  const startedAt = new Date(input.startedAt);
  const endedAt = input.endedAt ? new Date(input.endedAt) : null;
  const sessionMinutes = endedAt ? (endedAt.getTime() - startedAt.getTime()) / 60_000 : null;

  const burn = estimateCaloriesBurned({
    sets: validSets as unknown as SetLike[],
    exercises: meta,
    bodyweightKg: await bodyweightFor(userId, input.date),
    sessionMinutes,
  });

  return db.transaction(async (tx) => {
    const [workout] = await tx
      .insert(workouts)
      .values({
        userId,
        clientId: input.clientId,
        routineId: input.routineId ?? null,
        name: input.name,
        date: input.date,
        startedAt,
        endedAt,
        note: input.note ?? null,
        caloriesBurned: burn.kcal,
      })
      .onConflictDoUpdate({
        target: [workouts.userId, workouts.clientId],
        set: {
          name: input.name,
          date: input.date,
          startedAt,
          endedAt,
          note: input.note ?? null,
          caloriesBurned: burn.kcal,
          routineId: input.routineId ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    await tx.delete(workoutSets).where(eq(workoutSets.workoutId, workout.id));

    if (validSets.length) {
      await tx.insert(workoutSets).values(
        validSets.map((s) => ({
          workoutId: workout.id,
          exerciseId: s.exerciseId,
          position: s.position,
          setIndex: s.setIndex,
          reps: s.reps ?? null,
          weightKg: s.weightKg ?? null,
          rpe: s.rpe ?? null,
          isWarmup: s.isWarmup,
          durationSeconds: s.durationSeconds ?? null,
          distanceM: s.distanceM ?? null,
          completed: s.completed,
        })),
      );
    }

    return { workout, setCount: validSets.length, burn };
  });
}

/** Workout history with sets attached, newest first. */
export async function listWorkouts(userId: string, limit = 30) {
  const sessions = await db
    .select()
    .from(workouts)
    .where(eq(workouts.userId, userId))
    .orderBy(desc(workouts.date), desc(workouts.startedAt))
    .limit(limit);

  if (!sessions.length) return [];

  const sets = await db
    .select()
    .from(workoutSets)
    .where(inArray(workoutSets.workoutId, sessions.map((w) => w.id)))
    .orderBy(workoutSets.position, workoutSets.setIndex);

  const byWorkout = new Map<string, typeof sets>();
  for (const s of sets) {
    const list = byWorkout.get(s.workoutId) ?? [];
    list.push(s);
    byWorkout.set(s.workoutId, list);
  }

  return sessions.map((w) => ({ ...w, sets: byWorkout.get(w.id) ?? [] }));
}

/**
 * Last performance per exercise, so a routine can pre-fill with what you did
 * last time. Progressive overload needs the previous number in front of you;
 * looking it up in history between sets is what makes people stop bothering.
 */
export async function lastPerformance(userId: string) {
  const rows = await db
    .select({
      exerciseId: workoutSets.exerciseId,
      reps: workoutSets.reps,
      weightKg: workoutSets.weightKg,
      date: workouts.date,
    })
    .from(workoutSets)
    .innerJoin(workouts, eq(workouts.id, workoutSets.workoutId))
    .where(and(eq(workouts.userId, userId), eq(workoutSets.isWarmup, false), eq(workoutSets.completed, true)))
    .orderBy(desc(workouts.date))
    .limit(1500);

  const best = new Map<string, { date: string; reps: number | null; weightKg: number | null }>();
  for (const r of rows) {
    const seen = best.get(r.exerciseId);
    // Rows arrive newest first; within the newest session keep the heaviest set.
    if (!seen) best.set(r.exerciseId, r);
    else if (seen.date === r.date && (r.weightKg ?? 0) > (seen.weightKg ?? 0)) best.set(r.exerciseId, r);
  }
  return best;
}

export const todayIso = today;
