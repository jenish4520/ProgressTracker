/**
 * Calendar-day helpers.
 *
 * Days are passed around as "YYYY-MM-DD" strings to match the Postgres `date`
 * columns. Using Date objects for logical days invites timezone bugs: a
 * 00:30 weigh-in in Berlin is still "today", but `toISOString()` would file it
 * under yesterday.
 */

export type IsoDate = string;

/** Today in the *viewer's* timezone, not UTC. */
export function today(): IsoDate {
  return toIsoDate(new Date());
}

export function toIsoDate(d: Date): IsoDate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parses a day string into a Date at local midnight. */
export function fromIsoDate(s: IsoDate): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: IsoDate, days: number): IsoDate {
  const d = fromIsoDate(s);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

export function daysBetween(a: IsoDate, b: IsoDate): number {
  const ms = fromIsoDate(b).getTime() - fromIsoDate(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function isValidIsoDate(s: unknown): s is IsoDate {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(fromIsoDate(s).getTime());
}

/** Age in whole years on a given day. */
export function ageOn(birthDate: IsoDate, on: IsoDate = today()): number {
  const b = fromIsoDate(birthDate);
  const o = fromIsoDate(on);
  let age = o.getFullYear() - b.getFullYear();
  const beforeBirthday =
    o.getMonth() < b.getMonth() ||
    (o.getMonth() === b.getMonth() && o.getDate() < b.getDate());
  if (beforeBirthday) age--;
  return age;
}

/** Inclusive list of days from `start` to `end`. */
export function dateRange(start: IsoDate, end: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = start; daysBetween(d, end) >= 0; d = addDays(d, 1)) out.push(d);
  return out;
}

export function formatDayLabel(s: IsoDate, locale = "en-GB"): string {
  const d = fromIsoDate(s);
  const t = today();
  if (s === t) return "Today";
  if (s === addDays(t, -1)) return "Yesterday";
  if (s === addDays(t, 1)) return "Tomorrow";
  return d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
}
