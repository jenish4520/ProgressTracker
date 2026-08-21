import "server-only";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { eq, and, gt, lt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users, sessions } from "@/db/schema";
import { env } from "./env";

export const SESSION_COOKIE = "pt_session";
const SESSION_DAYS = 30;
const BCRYPT_COST = 12;

/**
 * Session tokens are random secrets, and only their SHA-256 hash is stored.
 * A database leak therefore exposes no usable session, and because sessions
 * are rows rather than self-contained JWTs, signing out a lost phone actually
 * revokes access instead of waiting for an expiry to elapse.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  sex: (typeof users.$inferSelect)["sex"];
  birthDate: string | null;
  heightCm: number | null;
  activityLevel: (typeof users.$inferSelect)["activityLevel"];
  unitSystem: (typeof users.$inferSelect)["unitSystem"];
  onboardedAt: Date | null;
  isAdmin: boolean;
}

/** Issues a new session and sets the cookie. */
export async function createSession(userId: string, userAgent?: string | null): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);

  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    userAgent: userAgent?.slice(0, 255) ?? null,
    expiresAt,
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  // Opportunistic cleanup so expired rows do not accumulate forever.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

/** Returns the signed-in user, or null. Safe to call from any server context. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      sex: users.sex,
      birthDate: users.birthDate,
      heightCm: users.heightCm,
      activityLevel: users.activityLevel,
      unitSystem: users.unitSystem,
      onboardedAt: users.onboardedAt,
      isAdmin: users.isAdmin,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Returns the signed-in user or throws. Every data route uses this and then
 * scopes its query by the returned id — the invariant that keeps one account's
 * body and food data unreachable from another.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "UnauthorizedError";
  }
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  jar.delete(SESSION_COOKIE);
}

/** Signs out every device for a user. */
export async function destroyAllSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/**
 * Constant-time comparison for user-supplied secrets such as invite codes,
 * so response timing cannot be used to guess a valid one character by character.
 */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Small fixed-window rate limiter for auth endpoints.
 *
 * In-process, so it resets on redeploy and is per-instance on a serverless
 * host. That is a deliberate trade for a private, invite-only app: it stops
 * naive online password guessing without dragging in Redis. Put a real
 * limiter in front if this is ever opened to public signup.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit = 8, windowMs = 15 * 60_000): boolean {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;

  // Bound memory: drop expired entries whenever the map grows noticeably.
  if (attempts.size > 5000) {
    for (const [k, v] of attempts) if (now > v.resetAt) attempts.delete(k);
  }
  return true;
}
