import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { workouts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fail, handler, ok, parseBody } from "@/lib/api";
import { workoutSchema } from "@/lib/validation";
import { listWorkouts, upsertWorkout } from "@/server/workouts";

export async function GET(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser();
    const limit = Math.min(Number(new URL(request.url).searchParams.get("limit") ?? 30) || 30, 200);
    return ok(await listWorkouts(user.id, limit));
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser();
    const body = await parseBody(request, workoutSchema);
    const result = await upsertWorkout(user.id, body);
    return ok(result, 201);
  });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return fail("Which workout?", 422);

    const deleted = await db
      .delete(workouts)
      .where(and(eq(workouts.id, id), eq(workouts.userId, user.id)))
      .returning({ id: workouts.id });

    if (!deleted.length) return fail("No such workout.", 404);
    return ok({ deleted: id });
  });
}
