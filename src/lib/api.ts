import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType, type output } from "zod";
import { UnauthorizedError } from "./auth";

/**
 * Shared shape for every API response, so the client has exactly one thing to
 * branch on rather than guessing per endpoint.
 */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; fields?: Record<string, string> };

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data } satisfies ApiResult<T>, { status });
}

export function fail(error: string, status = 400, fields?: Record<string, string>) {
  return NextResponse.json({ ok: false, error, fields } satisfies ApiResult<never>, { status });
}

/**
 * Wraps a route handler with the error translation every route would
 * otherwise repeat. Unexpected errors are logged server-side and reported
 * generically, so a stack trace or SQL detail never reaches the client.
 */
export function handler<T>(fn: () => Promise<NextResponse<T>>): Promise<NextResponse> {
  return fn().catch((err: unknown) => {
    if (err instanceof UnauthorizedError) return fail("Please sign in", 401);

    if (err instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of err.issues) {
        const key = issue.path.join(".") || "form";
        fields[key] ??= issue.message;
      }
      return fail(err.issues[0]?.message ?? "Check the highlighted fields", 422, fields);
    }

    console.error("[api]", err);
    return fail("Something went wrong. Please try again.", 500);
  });
}

/** Parses and validates a JSON request body. */
export async function parseBody<S extends ZodType>(request: Request, schema: S): Promise<output<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ZodError([{ code: "custom", path: [], message: "Expected a JSON body" }]);
  }
  return schema.parse(raw);
}
