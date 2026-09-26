// Time helpers. Everything in Knock runs on America/New_York time.

export const TIME_ZONE = "America/New_York";

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type Day = (typeof DAYS)[number];

type NyDate = { year: number; month: number; day: number; weekday: Day };

// The calendar date and weekday in New York for a given instant.
export function nyDate(date: Date): NyDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: get("weekday") as Day,
  };
}

// Today's date in New York as "YYYY-MM-DD" (matches a Postgres date column).
export function nyToday(now: Date): string {
  const d = nyDate(now);
  const mm = String(d.month).padStart(2, "0");
  const dd = String(d.day).padStart(2, "0");
  return `${d.year}-${mm}-${dd}`;
}

// The instant when it is `time` ("HH:MM") on the given New York calendar date.
function nyTimeToInstant(year: number, month: number, day: number, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  // Pretend the wall-clock time is UTC, then shift by New York's offset at that moment.
  const asUtc = Date.UTC(year, month - 1, day, hours, minutes);
  const ny = new Date(asUtc).toLocaleString("en-US", { timeZone: TIME_ZONE });
  const offset = new Date(ny + " UTC").getTime() - asUtc;
  return new Date(asUtc - offset);
}

// The instant of a weekly slot (e.g. Tue 12:30) in the week containing `now`.
// Weeks run Monday to Sunday. `weeksAhead` = 1 gives next week's slot.
export function slotInWeek(now: Date, day: Day, time: string, weeksAhead = 0): Date {
  const today = nyDate(now);
  const daysFromToday = DAYS.indexOf(day) - DAYS.indexOf(today.weekday) + weeksAhead * 7;
  // Date.UTC handles month and year rollover for us.
  const target = new Date(Date.UTC(today.year, today.month - 1, today.day + daysFromToday));
  return nyTimeToInstant(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    target.getUTCDate(),
    time
  );
}

// Monday 00:00 and next Monday 00:00 (New York) for the week containing `now`.
export function weekBounds(now: Date): { start: Date; end: Date } {
  return {
    start: slotInWeek(now, "Mon", "00:00"),
    end: slotInWeek(now, "Mon", "00:00", 1),
  };
}
