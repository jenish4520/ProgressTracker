import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { handler, ok } from "@/lib/api";

export async function POST(): Promise<NextResponse> {
  return handler(async () => {
    await destroySession();
    return ok({ signedOut: true });
  });
}
