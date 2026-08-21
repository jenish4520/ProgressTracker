import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { bodyEntries } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { loadEnergyState } from "@/server/energy";
import { addDays, todayInZone } from "@/lib/dates";
import PageHeader from "@/components/PageHeader";
import BodyLogger from "@/components/BodyLogger";

export const dynamic = "force-dynamic";
export const metadata = { title: "Body · ProgressTracker" };

export default async function BodyPage() {
  const user = await requireUser();

  const [entries, state] = await Promise.all([
    db
      .select()
      .from(bodyEntries)
      .where(and(eq(bodyEntries.userId, user.id), gte(bodyEntries.date, addDays(todayInZone(user.timezone), -365))))
      .orderBy(desc(bodyEntries.date))
      .limit(400),
    loadEnergyState(user),
  ]);

  return (
    <>
      <PageHeader title="Body" subtitle="Weight, measurements and what they are actually doing" />
      <BodyLogger
        unitSystem={user.unitSystem}
        todayRef={todayInZone(user.timezone)}
        entries={entries.map((e) => ({
          ...e,
          createdAt: e.createdAt.toISOString(),
          updatedAt: e.updatedAt.toISOString(),
        }))}
        trend={state.trend}
        trendWeightKg={state.trendWeightKg}
        observedRateKgPerWeek={state.observedRateKgPerWeek}
        goalTargetKg={state.goal?.targetWeightKg ?? null}
        goalType={state.goal?.type ?? "maintain"}
        goalRate={state.goal?.rateKgPerWeek ?? 0}
        projection={state.projection}
      />
    </>
  );
}
