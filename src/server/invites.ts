import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, desc, gt, or, isNull, sql as raw } from "drizzle-orm";
import { db } from "@/db";
import { inviteCodes } from "@/db/schema";

/** Ambiguous characters (0/O, 1/I) are excluded so codes survive being read aloud. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export async function createInvite(params: {
  createdBy: string;
  note?: string | null;
  maxUses?: number;
  expiresInDays?: number;
}) {
  const { createdBy, note = null, maxUses = 1, expiresInDays = 30 } = params;
  const code = generateCode();
  const [row] = await db
    .insert(inviteCodes)
    .values({
      code,
      createdBy,
      note,
      maxUses,
      expiresAt: new Date(Date.now() + expiresInDays * 86_400_000),
    })
    .returning();
  return row;
}

export async function listInvites(userId: string) {
  return db
    .select()
    .from(inviteCodes)
    .where(eq(inviteCodes.createdBy, userId))
    .orderBy(desc(inviteCodes.createdAt))
    .limit(50);
}

export async function revokeInvite(userId: string, code: string): Promise<boolean> {
  const rows = await db
    .delete(inviteCodes)
    .where(and(eq(inviteCodes.code, code), eq(inviteCodes.createdBy, userId)))
    .returning({ code: inviteCodes.code });
  return rows.length > 0;
}

/**
 * Atomically claims one use of an invite code.
 *
 * The guard lives in the UPDATE's WHERE clause rather than a read-then-write,
 * so two people redeeming the last use of a code at the same moment cannot
 * both succeed — Postgres serialises the row update and the loser matches
 * zero rows.
 */
export async function consumeInvite(code: string): Promise<boolean> {
  const normalised = code.trim().toUpperCase();
  if (!normalised) return false;

  const rows = await db
    .update(inviteCodes)
    .set({ uses: raw`${inviteCodes.uses} + 1` })
    .where(
      and(
        eq(inviteCodes.code, normalised),
        raw`${inviteCodes.uses} < ${inviteCodes.maxUses}`,
        or(isNull(inviteCodes.expiresAt), gt(inviteCodes.expiresAt, new Date())),
      ),
    )
    .returning({ code: inviteCodes.code });

  return rows.length > 0;
}
