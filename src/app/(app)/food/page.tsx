import { requireUser } from "@/lib/auth";
import { loadDayNutrition, loadEnergyState } from "@/server/energy";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { foodLogEntries } from "@/db/schema";
import { isValidIsoDate, todayInZone } from "@/lib/dates";
import FoodDay from "@/components/FoodDay";

export const dynamic = "force-dynamic";
export const metadata = { title: "Food · ProgressTracker" };

export default async function FoodPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const day = todayInZone(user.timezone);
  const date = isValidIsoDate(params.date) ? params.date : day;

  const [entries, totals, state] = await Promise.all([
    db
      .select()
      .from(foodLogEntries)
      .where(and(eq(foodLogEntries.userId, user.id), eq(foodLogEntries.date, date)))
      .orderBy(foodLogEntries.createdAt),
    loadDayNutrition(user.id, date),
    loadEnergyState(user, date),
  ]);

  return (
    <FoodDay
      date={date}
      todayRef={day}
      entries={entries.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() }))}
      totals={totals}
      targets={state.macros}
    />
  );
}
