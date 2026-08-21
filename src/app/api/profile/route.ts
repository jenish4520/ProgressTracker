import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { handler, ok, parseBody } from "@/lib/api";
import { profileSchema } from "@/lib/validation";

export async function GET(): Promise<NextResponse> {
  return handler(async () => ok(await requireUser()));
}

export async function PATCH(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser();
    const body = await parseBody(request, profileSchema);

    const patch = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));

    // A profile with sex, birth date and height is everything the BMR
    // equation needs, so completing it is what marks onboarding as done.
    const merged = { ...user, ...patch };
    const complete = Boolean(merged.sex && merged.birthDate && merged.heightCm);
    if (complete && !user.onboardedAt) Object.assign(patch, { onboardedAt: new Date() });

    const [updated] = await db
      .update(users)
      .set(patch)
      .where(eq(users.id, user.id))
      .returning({
        id: users.id,
        name: users.name,
        sex: users.sex,
        birthDate: users.birthDate,
        heightCm: users.heightCm,
        activityLevel: users.activityLevel,
        unitSystem: users.unitSystem,
        onboardedAt: users.onboardedAt,
      });

    return ok(updated);
  });
}
