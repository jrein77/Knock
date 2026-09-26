"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const WEEKDAY_HEADINGS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// "2026-09" -> "September". The year only shows when it isn't this year ("December 2025").
function monthTitle(month: string, today: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const sameYear = month.slice(0, 4) === today.slice(0, 4);
  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function shiftMonth(month: string, by: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + by, 1)).toISOString().slice(0, 7);
}

// A month of days to jump to. Each day shows how many requests it had.
// Days after today can't be picked.
export function MonthPicker({
  officeId,
  selected,
  today,
  onPick,
}: {
  officeId: string;
  selected: string; // "YYYY-MM-DD"
  today: string;
  onPick: (day: string) => void;
}) {
  const [month, setMonth] = useState(selected.slice(0, 7));
  const [counts, setCounts] = useState<Record<string, number>>({});
  // Tapping the month title switches to a year view: the year's 12 months to pick from.
  const [pickingMonth, setPickingMonth] = useState(false);

  useEffect(() => {
    fetch(`/api/desk/days?officeId=${officeId}&month=${month}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : {}))
      .then(setCounts)
      .catch(() => setCounts({}));
  }, [officeId, month]);

  if (pickingMonth) {
    return (
      <YearView
        year={Number(month.slice(0, 4))}
        today={today}
        onPick={(picked) => {
          setMonth(picked);
          setPickingMonth(false);
        }}
      />
    );
  }

  // Blank cells before the 1st, so days line up under Mon-Sun.
  const [year, monthNumber] = month.split("-").map(Number);
  const firstWeekday = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
        <Button variant="outline" onClick={() => setMonth(shiftMonth(month, -1))} className="h-12 px-4 text-lg">
          Previous
        </Button>
        <Button
          variant="ghost"
          onClick={() => setPickingMonth(true)}
          aria-label={`${monthTitle(month, today)}. Pick another month or year`}
          className="h-12 text-lg font-semibold"
        >
          {monthTitle(month, today)}
        </Button>
        <Button
          variant="outline"
          onClick={() => setMonth(shiftMonth(month, 1))}
          disabled={month >= today.slice(0, 7)}
          className="h-12 px-4 text-lg"
        >
          Next
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_HEADINGS.map((heading) => (
          <p key={heading} className="text-sm text-muted-foreground">
            {heading}
          </p>
        ))}
        {Array.from({ length: firstWeekday }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {days.map((day) => {
          const isSelected = day === selected;
          const count = counts[day] ?? 0;
          return (
            <button
              key={day}
              type="button"
              disabled={day > today}
              onClick={() => onPick(day)}
              aria-label={`${day}, ${count} requests`}
              aria-pressed={isSelected}
              className={`flex min-h-12 flex-col items-center justify-center rounded-lg text-lg disabled:opacity-30 ${
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : day === today
                    ? "ring-2 ring-foreground/40"
                    : "hover:bg-muted"
              }`}
            >
              <span>{Number(day.slice(8))}</span>
              {count > 0 && (
                <span className={`text-xs ${isSelected ? "opacity-80" : "text-muted-foreground"}`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// A year and its 12 months. Months after this one can't be picked.
function YearView({
  year: startYear,
  today,
  onPick,
}: {
  year: number;
  today: string;
  onPick: (month: string) => void; // "YYYY-MM"
}) {
  const [year, setYear] = useState(startYear);
  const thisMonth = today.slice(0, 7);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
        <Button variant="outline" onClick={() => setYear(year - 1)} className="h-12 px-4 text-lg">
          Previous year
        </Button>
        <p className="text-center text-lg font-semibold">{year}</p>
        <Button
          variant="outline"
          onClick={() => setYear(year + 1)}
          disabled={year >= Number(today.slice(0, 4))}
          className="h-12 px-4 text-lg"
        >
          Next year
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {MONTH_NAMES.map((name, i) => {
          const month = `${year}-${String(i + 1).padStart(2, "0")}`;
          return (
            <Button
              key={month}
              variant={month === thisMonth ? "default" : "outline"}
              disabled={month > thisMonth}
              onClick={() => onPick(month)}
              className="h-14 text-lg"
            >
              {name}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
