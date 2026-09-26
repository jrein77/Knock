// Time helpers. Everything in Knock runs on America/New_York time.
// "This week" means the next 7 days from now, so the demo works on any day.

import type { Day, VisitSlot } from "./types";

export const TIME_ZONE = "America/New_York";
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const DAYS: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const DAY_NAMES: Record<Day, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

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

// The weekday in New York for a given instant.
export function nyWeekday(date: Date): Day {
  return nyDate(date).weekday;
}

// Today's date in New York as "YYYY-MM-DD" (matches a Postgres date column).
export function nyToday(now: Date): string {
  const d = nyDate(now);
  const mm = String(d.month).padStart(2, "0");
  const dd = String(d.day).padStart(2, "0");
  return `${d.year}-${mm}-${dd}`;
}

// The instant when a New York wall clock reads `time` ("HH:MM") on the given date.
function wallClockInstant(year: number, month: number, day: number, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  // Pretend the wall-clock time is UTC (Date.UTC handles month and year rollover),
  // then shift by New York's offset at that moment.
  const asUtc = Date.UTC(year, month - 1, day, hours, minutes);
  const ny = new Date(asUtc).toLocaleString("en-US", { timeZone: TIME_ZONE });
  const offset = new Date(ny + " UTC").getTime() - asUtc;
  return new Date(asUtc - offset);
}

// The instant when it is `time` in New York, `daysAhead` calendar days after `now`.
function nyInstant(now: Date, daysAhead: number, time: string): Date {
  const today = nyDate(now);
  return wallClockInstant(today.year, today.month, today.day + daysAhead, time);
}

// The instant when it is `time` in New York on `date` ("YYYY-MM-DD").
function nyInstantOn(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return wallClockInstant(year, month, day, time);
}

// The weekday of a calendar date ("YYYY-MM-DD").
export function weekdayOf(date: string): Day {
  const [year, month, day] = date.split("-").map(Number);
  const sundayFirst = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return DAYS[(sundayFirst + 6) % 7];
}

// "2026-10-02" -> "Fri Oct 2"
export function formatDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const text = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return text.replace(",", ""); // "Fri, Oct 2" -> "Fri Oct 2"
}

// One-off dated slots whose date has passed drop off; weekly slots always stay.
export function currentSlots(slots: VisitSlot[], now: Date): VisitSlot[] {
  const today = nyToday(now);
  return slots.filter((slot) => !slot.date || slot.date >= today);
}

// Midnight today in New York.
export function nyStartOfToday(now: Date): Date {
  return nyInstant(now, 0, "00:00");
}

// Every slot's next opening after `now`, soonest first. Weekly slots appear once
// (within 7 days); dated slots appear if their date is still ahead.
// `start` is when the visit is; `end` is when a window closes (null for a single time).
export function upcomingWindows(
  now: Date,
  slots: VisitSlot[]
): { start: Date; end: Date | null }[] {
  const today = nyDate(now).weekday;
  const windows: { start: Date; end: Date | null }[] = [];

  for (const slot of slots) {
    if (slot.date) {
      // Once, on its date.
      const start = nyInstantOn(slot.date, slot.time);
      const end = slot.end ? nyInstantOn(slot.date, slot.end) : null;
      if (start > now) windows.push({ start, end });
      else if (end && end > now) windows.push({ start: now, end }); // inside the window now
      continue;
    }

    // Every week, on its day.
    const daysAhead = (DAYS.indexOf(slot.day) - DAYS.indexOf(today) + 7) % 7;
    const start = nyInstant(now, daysAhead, slot.time);
    const end = slot.end ? nyInstant(now, daysAhead, slot.end) : null;

    if (start > now) {
      windows.push({ start, end }); // still ahead today, or later this week
    } else if (end && end > now) {
      windows.push({ start: now, end }); // inside the window right now: the visit is now
    } else {
      windows.push({
        start: nyInstant(now, daysAhead + 7, slot.time), // already passed today: next week's
        end: slot.end ? nyInstant(now, daysAhead + 7, slot.end) : null,
      });
    }
  }

  return windows.sort((a, b) => a.start.getTime() - b.start.getTime());
}

// Just the start times of upcomingWindows.
export function upcomingSlots(now: Date, slots: VisitSlot[]): Date[] {
  return upcomingWindows(now, slots).map((window) => window.start);
}

// "15:00" -> "3:00 PM"
export function formatClock(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

// A slot's times: "12:30 PM", or "12:00-1:00 PM" for a window.
export function formatSlotTimes(slot: VisitSlot): string {
  if (!slot.end) return formatClock(slot.time);
  const start = formatClock(slot.time);
  const end = formatClock(slot.end);
  // Drop the first AM/PM when both match: "12:00-1:00 PM", not "12:00 PM-1:00 PM".
  const sameHalf = start.slice(-2) === end.slice(-2);
  return `${sameHalf ? start.slice(0, -3) : start}–${end}`;
}

// Weekly slots first in calendar order (Mon before Tue), then dated slots by date. Then by time.
export function sortSlots(slots: VisitSlot[]): VisitSlot[] {
  return [...slots].sort(
    (a, b) =>
      Number(Boolean(a.date)) - Number(Boolean(b.date)) ||
      (a.date ?? "").localeCompare(b.date ?? "") ||
      DAYS.indexOf(a.day) - DAYS.indexOf(b.day) ||
      a.time.localeCompare(b.time) ||
      (a.end ?? "").localeCompare(b.end ?? "")
  );
}

// How a slot reads on a sign: "Tue 12:30 PM" every week, or "Fri Oct 2 12:00–1:00 PM" once.
export function formatSlotLine(slot: VisitSlot): string {
  return `${slot.date ? formatDate(slot.date) : slot.day} ${formatSlotTimes(slot)}`;
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

// A booked visit: "Tuesday Sep 29, 12:30 PM", or with a window "Tuesday Sep 29, 12:00 PM to 1:00 PM".
export function formatVisit(slotAt: Date | string, slotEnd?: Date | string | null): string {
  if (!slotEnd) return formatSlot(slotAt);
  const endTime = new Date(slotEnd).toLocaleTimeString("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
  return `${formatSlot(slotAt)} to ${endTime}`;
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
