import { NextResponse } from "next/server";
import { eq, sql as raw } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, hashPassword, rateLimit } from "@/lib/auth";
import { fail, handler, ok, parseBody } from "@/lib/api";
import { signupSchema } from "@/lib/validation";
import { consumeInvite } from "@/server/invites";
import { env } from "@/lib/env";

export async function POST(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!rateLimit(`signup:${ip}`, 5)) {
      return fail("Too many attempts. Please wait a few minutes.", 429);
    }

    const body = await parseBody(request, signupSchema);

    // The very first account can be created without a code, so a fresh
    // deployment is not locked out of itself. Everyone after needs an invite.
    const [{ count }] = await db.select({ count: raw<number>`count(*)::int` }).from(users);
    const isFirstUser = Number(count) === 0;
    const bootstrapping = isFirstUser && env.allowBootstrapSignup;

    if (!bootstrapping) {
      if (!body.inviteCode) {
        return fail("An invite code is required to join.", 403, {
          inviteCode: "Ask whoever runs this tracker for a code",
        });
      }
      if (!(await consumeInvite(body.inviteCode))) {
        return fail("That invite code is not valid, has expired, or is used up.", 403, {
          inviteCode: "Invalid or expired code",
        });
      }
    }

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(raw`lower(${users.email}) = ${body.email}`)
      .limit(1);
    if (existing.length) {
      return fail("An account with that email already exists.", 409, {
        email: "Already registered — try signing in",
      });
    }

    const [created] = await db
      .insert(users)
      .values({
        email: body.email,
        name: body.name,
        passwordHash: await hashPassword(body.password),
        // Whoever bootstraps the instance administers it.
        isAdmin: isFirstUser,
      })
      .returning({ id: users.id, name: users.name });

    await createSession(created.id, request.headers.get("user-agent"));
    return ok({ id: created.id, name: created.name, needsOnboarding: true }, 201);
  });
}
