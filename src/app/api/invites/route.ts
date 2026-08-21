import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { fail, handler, ok, parseBody } from "@/lib/api";
import { inviteSchema } from "@/lib/validation";
import { createInvite, listInvites, revokeInvite } from "@/server/invites";

export async function GET(): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser();
    return ok(await listInvites(user.id));
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser();
    const body = await parseBody(request, inviteSchema);
    const invite = await createInvite({
      createdBy: user.id,
      note: body.note ?? null,
      maxUses: body.maxUses,
      expiresInDays: body.expiresInDays,
    });
    return ok(invite, 201);
  });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser();
    const code = new URL(request.url).searchParams.get("code");
    if (!code) return fail("Which code should be revoked?", 422);
    if (!(await revokeInvite(user.id, code))) return fail("No such invite code.", 404);
    return ok({ revoked: code });
  });
}
