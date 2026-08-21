import { NextResponse } from "next/server";
import { sql as raw } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, rateLimit, verifyPassword } from "@/lib/auth";
import { fail, handler, ok, parseBody } from "@/lib/api";
import { loginSchema } from "@/lib/validation";

export async function POST(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const body = await parseBody(request, loginSchema);

    // Limited per email as well as per IP: one shared office IP should not be
    // able to lock a user out, but a targeted account still gets protection.
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!rateLimit(`login:${ip}`) || !rateLimit(`login:${body.email}`)) {
      return fail("Too many sign-in attempts. Please wait a few minutes.", 429);
    }

    const [user] = await db
      .select({ id: users.id, passwordHash: users.passwordHash, onboardedAt: users.onboardedAt })
      .from(users)
      .where(raw`lower(${users.email}) = ${body.email}`)
      .limit(1);

    // One message for both "no such account" and "wrong password", so the
    // endpoint cannot be used to enumerate who has registered.
    const invalid = fail("Email or password is incorrect.", 401);
    if (!user) return invalid;
    if (!(await verifyPassword(body.password, user.passwordHash))) return invalid;

    await createSession(user.id, request.headers.get("user-agent"));
    return ok({ id: user.id, needsOnboarding: user.onboardedAt === null });
  });
}
