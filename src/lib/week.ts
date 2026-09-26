// Time helpers. Everything in Knock runs on America/New_York time.
// "This week" means the next 7 days from now, so the demo works on any day.

import type { Day, VisitSlot } from "./types";

export const TIME_ZONE = "America/New_York";
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const DAYS: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type NyDate = { year: number; month: number; day: number; weekday: Day };

// The calendar date and weekday in New York for a given instant.
function nyDate(date: Date): NyDate {
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

// The instant when it is `time` ("HH:MM") in New York, `daysAhead` calendar days after `now`.
function nyInstant(now: Date, daysAhead: number, time: string): Date {
  const today = nyDate(now);
  const [hours, minutes] = time.split(":").map(Number);
  // Pretend the wall-clock time is UTC (Date.UTC handles month and year rollover),
  // then shift by New York's offset at that moment.
  const asUtc = Date.UTC(today.year, today.month - 1, today.day + daysAhead, hours, minutes);
  const ny = new Date(asUtc).toLocaleString("en-US", { timeZone: TIME_ZONE });
  const offset = new Date(ny + " UTC").getTime() - asUtc;
  return new Date(asUtc - offset);
}

// Midnight today in New York.
export function nyStartOfToday(now: Date): Date {
  return nyInstant(now, 0, "00:00");
}

// Each weekly slot's next time after `now` (within 7 days), soonest first.
export function upcomingSlots(now: Date, slots: VisitSlot[]): Date[] {
  const today = nyDate(now).weekday;

  const times = slots.map((slot) => {
    const daysAhead = (DAYS.indexOf(slot.day) - DAYS.indexOf(today) + 7) % 7;
    const next = nyInstant(now, daysAhead, slot.time);
    // A slot earlier today has already passed, so use next week's.
    return next > now ? next : nyInstant(now, daysAhead + 7, slot.time);
  });

  return times.sort((a, b) => a.getTime() - b.getTime());
}

// "15:00" -> "3:00 PM"
export function formatClock(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

// Weekly slots in calendar order: Mon before Tue, then by time.
export function sortSlots(slots: VisitSlot[]): VisitSlot[] {
  return [...slots].sort(
    (a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.time.localeCompare(b.time)
  );
}

// When something happened, relative to now: "Today at 3:40 PM", "Yesterday at 9:05 AM", "Mon Sep 21".
export function formatWhen(iso: string, now: Date): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (nyToday(date) === nyToday(now)) return `Today at ${time}`;
  if (nyToday(date) === nyToday(yesterday)) return `Yesterday at ${time}`;
  return date.toLocaleDateString("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// e.g. "Tuesday Sep 29, 12:30 PM"
export function formatSlot(slotAt: Date | string): string {
  const date = new Date(slotAt);
  const day = date.toLocaleDateString("en-US", {
    timeZone: TIME_ZONE,
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const time = date.toLocaleTimeString("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
  // toLocaleDateString gives "Tuesday, Sep 29"; drop the comma after the weekday.
  return `${day.replace(",", "")}, ${time}`;
}
