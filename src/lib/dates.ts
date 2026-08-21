/**
 * Calendar-day helpers.
 *
 * Days are passed around as "YYYY-MM-DD" strings to match the Postgres `date`
 * columns. Using Date objects for logical days invites timezone bugs: a
 * 00:30 weigh-in in Berlin is still "today", but `toISOString()` would file it
 * under yesterday.
 */

export type IsoDate = string;

/** Today according to the runtime's own clock and zone. */
export function today(): IsoDate {
  return toIsoDate(new Date());
}

/**
 * Today in a specific IANA timezone.
 *
 * The server runs in UTC but the user does not. Asking "what day is it for
 * this person" has to name the zone, otherwise a 00:30 entry in Berlin lands
 * on the previous day's calorie budget. en-CA is used purely because it
 * formats as YYYY-MM-DD.
 */
export function todayInZone(timeZone: string, now: Date = new Date()): IsoDate {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    // An unknown zone must not take the whole app down.
    return toIsoDate(now);
  }
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

/**
 * Deterministic English date names.
 *
 * Intl is deliberately avoided for rendered dates. Node and the browser ship
 * different ICU builds, and en-GB "weekday day month" formats as "Sat 8 Aug"
 * on Node but "Sat, 8 Aug" in Chromium — enough to fail hydration on text the
 * server and client both render. Fixed tables give the same string everywhere.
 */
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAYS_LONG = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** "8 Aug" */
export function formatDayShort(s: IsoDate): string {
  const d = fromIsoDate(s);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** "Sat 8 Aug" */
export function formatDayWithWeekday(s: IsoDate): string {
  const d = fromIsoDate(s);
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** "8 August 2026" */
export function formatDateMedium(s: IsoDate): string {
  const d = fromIsoDate(s);
  return `${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Saturday, 8 August" */
export function formatDateLong(s: IsoDate): string {
  const d = fromIsoDate(s);
  return `${WEEKDAYS_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
}

/**
 * Human day label.
 *
 * `todayRef` is explicit rather than derived internally: this runs during
 * server rendering *and* during hydration, and the two must reach the same
 * answer. Letting each side compute its own "today" is precisely how "Today"
 * on the server becomes "Yesterday" in the browser.
 */
export function formatDayLabel(s: IsoDate, todayRef: IsoDate = today()): string {
  if (s === todayRef) return "Today";
  if (s === addDays(todayRef, -1)) return "Yesterday";
  if (s === addDays(todayRef, 1)) return "Tomorrow";
  return formatDayWithWeekday(s);
}
