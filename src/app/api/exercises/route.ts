import { NextResponse } from "next/server";
import { eq, isNull, or, asc } from "drizzle-orm";
import { db } from "@/db";
import { exercises } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { handler, ok, parseBody } from "@/lib/api";
import { exerciseSchema } from "@/lib/validation";

/** The built-in catalogue plus the caller's own additions. */
export async function GET(): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser();
    const rows = await db
      .select()
      .from(exercises)
      .where(or(isNull(exercises.ownerId), eq(exercises.ownerId, user.id)))
      .orderBy(asc(exercises.muscleGroup), asc(exercises.name));
    return ok(rows);
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser();
    const body = await parseBody(request, exerciseSchema);
    const [row] = await db
      .insert(exercises)
      .values({
        ownerId: user.id,
        name: body.name,
        kind: body.kind,
        muscleGroup: body.muscleGroup,
        equipment: body.equipment ?? null,
        met: body.met,
        isBodyweight: body.isBodyweight,
      })
      .returning();
    return ok(row, 201);
  });
}
