import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { handler, ok, parseBody } from "@/lib/api";
import { syncSchema } from "@/lib/validation";
import { upsertWorkout } from "@/server/workouts";

/**
 * Flushes the device's offline queue.
 *
 * Each workout is applied independently and failures are reported per item
 * rather than failing the batch. One malformed session recorded weeks ago must
 * not block every later workout from ever syncing — the client drops the
 * items reported as `failed` and retries the rest.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return handler(async () => {
    const user = await requireUser();
    const { workouts: incoming } = await parseBody(request, syncSchema);

    const synced: string[] = [];
    const failed: { clientId: string; reason: string }[] = [];

    for (const w of incoming) {
      try {
        await upsertWorkout(user.id, w);
        synced.push(w.clientId);
      } catch (err) {
        console.error("[sync] workout failed", w.clientId, err);
        failed.push({
          clientId: w.clientId,
          reason: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return ok({ synced, failed, syncedAt: new Date().toISOString() });
  });
}
