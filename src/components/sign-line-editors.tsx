"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Day, VisitSlot } from "@/lib/types";
import {
  currentSlots,
  DAY_NAMES,
  formatDate,
  formatSlotTimes,
  nyToday,
  sortSlots,
  weekdayOf,
} from "@/lib/week";

// Pickers for Door Sign fields, used by setup (/sign/setup) and by the inline
// editors on the sign (/sign, desk). The editors add Save (with Undo) and Cancel.

export function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={selected ? "default" : "outline"}
      aria-pressed={selected}
      onClick={onClick}
      className="h-auto min-h-12 px-4 py-2 text-lg whitespace-normal"
    >
      {children}
    </Button>
  );
}

// Pick any number of options: topics, redirect options, blocked companies.
// The result keeps the options' order, not the tap order. With `allowNew`, the office
// can type in an option that isn't listed (e.g. a new topic).
export function ChoicePicker<T extends string>({
  options,
  value,
  onChange,
  allowNew,
}: {
  options: { value: T; label: string }[];
  value: T[];
  onChange: (value: T[]) => void;
  allowNew?: { label: string };
}) {
  const [newOption, setNewOption] = useState("");
  const newId = useId();

  // Anything already chosen but not in the list (e.g. a topic added earlier) still shows.
  const all = [
    ...options,
    ...value
      .filter((v) => !options.some((o) => o.value === v))
      .map((v) => ({ value: v, label: v })),
  ];

  function toggle(option: T) {
    const next = value.includes(option) ? value.filter((v) => v !== option) : [...value, option];
    onChange(all.map((o) => o.value).filter((v) => next.includes(v)));
  }

  function addNew() {
    const typed = newOption.trim() as T;
    if (typed && !value.includes(typed)) onChange([...value, typed]);
    setNewOption("");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {all.map((option) => (
          <Chip
            key={option.value}
            selected={value.includes(option.value)}
            onClick={() => toggle(option.value)}
          >
            {option.label}
          </Chip>
        ))}
      </div>
      {allowNew && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            addNew();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={newId} className="text-lg">
              {allowNew.label}
            </Label>
            <Input
              id={newId}
              value={newOption}
              maxLength={60}
              onChange={(event) => setNewOption(event.target.value)}
              className="h-12 w-56 text-lg md:text-lg"
            />
          </div>
          <Button type="submit" variant="outline" disabled={newOption.trim() === ""} className="h-12 px-5 text-lg">
            Add
          </Button>
        </form>
      )}
    </div>
  );
}

const WEEKDAYS: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];

// Visit times: the current list (each removable), and an "add" row. Pick "Every week"
// and tap the days, or "On a date" and pick the date; then a time or a From-Until window.
export function SlotsPicker({
  value,
  onChange,
}: {
  value: VisitSlot[];
  onChange: (value: VisitSlot[]) => void;
}) {
  const [repeat, setRepeat] = useState<"weekly" | "date">("weekly");
  const [days, setDays] = useState<Day[]>([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("12:00");
  const [until, setUntil] = useState(""); // optional end of a window
  const dateId = useId();
  const timeId = useId();
  const untilId = useId();

  const today = nyToday(new Date());
  const untilTooEarly = until !== "" && until <= time;
  const canAdd =
    time !== "" && !untilTooEarly && (repeat === "weekly" ? days.length > 0 : date >= today);

  function toggleDay(day: Day) {
    setDays(days.includes(day) ? days.filter((d) => d !== day) : [...days, day]);
  }

  const sameSlot = (a: VisitSlot, b: VisitSlot) =>
    a.day === b.day &&
    a.time === b.time &&
    (a.end ?? "") === (b.end ?? "") &&
    (a.date ?? "") === (b.date ?? "");

  function add() {
    const times = until ? { time, end: until } : { time };
    const added: VisitSlot[] =
      repeat === "weekly"
        ? days.map((day) => ({ day, ...times }))
        : [{ day: weekdayOf(date), date, ...times }];
    onChange([...value, ...added.filter((slot) => !value.some((v) => sameSlot(v, slot)))]);
    setDays([]);
    setDate("");
  }

  function remove(removed: VisitSlot) {
    onChange(value.filter((slot) => !sameSlot(slot, removed)));
  }

  // Dated times that have passed aren't shown (and drop off when this list is saved).
  const shown = sortSlots(currentSlots(value, new Date()));

  return (
    <div className="flex flex-col gap-5">
      {shown.length === 0 ? (
        <p className="text-muted-foreground">No visit times yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((slot) => (
            <li
              key={`${slot.date ?? slot.day}-${slot.time}-${slot.end ?? ""}`}
              className="flex items-center justify-between gap-3 rounded-xl bg-muted py-1 pr-1 pl-4"
            >
              <span className="text-lg">
                {slot.date
                  ? `${formatDate(slot.date)} only, ${formatSlotTimes(slot)}`
                  : `Every ${DAY_NAMES[slot.day]}, ${formatSlotTimes(slot)}`}
              </span>
              <Button variant="ghost" onClick={() => remove(slot)} className="h-12 px-4 text-lg">
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-3 rounded-xl border p-4">
        <p className="text-lg font-medium">Add a visit time</p>
        <div className="flex flex-wrap gap-2">
          <Chip selected={repeat === "weekly"} onClick={() => setRepeat("weekly")}>
            Every week
          </Chip>
          <Chip selected={repeat === "date"} onClick={() => setRepeat("date")}>
            On a date
          </Chip>
        </div>

        {repeat === "weekly" ? (
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => (
              <Chip key={day} selected={days.includes(day)} onClick={() => toggleDay(day)}>
                {day}
              </Chip>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Label htmlFor={dateId} className="text-lg">
              Date
            </Label>
            <Input
              id={dateId}
              type="date"
              min={today}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="h-12 w-52 text-lg md:text-lg"
            />
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor={timeId} className="text-lg">
              From
            </Label>
            <Input
              id={timeId}
              type="time"
              step={900}
              value={time}
              onChange={(event) => setTime(event.target.value)}
              className="h-12 w-40 text-lg md:text-lg"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={untilId} className="text-lg">
              Until (optional)
            </Label>
            <Input
              id={untilId}
              type="time"
              step={900}
              value={until}
              onChange={(event) => setUntil(event.target.value)}
              className="h-12 w-40 text-lg md:text-lg"
            />
          </div>
          <Button onClick={add} disabled={!canAdd} className="h-12 px-5 text-lg">
            Add
          </Button>
        </div>
        {untilTooEarly && <p role="alert">&ldquo;Until&rdquo; has to be after &ldquo;From&rdquo;.</p>}
      </div>
    </div>
  );
}

// Weekly cap: a stepper from 0 to 10.
export function CapStepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center gap-4">
      <Button
        variant="outline"
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={value === 0}
        className="h-12 px-5 text-lg"
      >
        Fewer
      </Button>
      <span className="w-10 text-center text-3xl font-semibold">{value}</span>
      <Button
        variant="outline"
        onClick={() => onChange(Math.min(10, value + 1))}
        disabled={value === 10}
        className="h-12 px-5 text-lg"
      >
        More
      </Button>
    </div>
  );
}

// --- Inline editors for one line of the sign: a picker plus Save / Cancel ---

function SaveCancel({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  return (
    <div className="flex gap-3 pt-2">
      <Button onClick={onSave} className="h-12 px-6 text-lg">
        Save
      </Button>
      <Button variant="outline" onClick={onCancel} className="h-12 px-6 text-lg">
        Cancel
      </Button>
    </div>
  );
}

export function ChoiceEditor<T extends string>({
  title,
  options,
  selected,
  onSave,
  onCancel,
  allowNew,
}: {
  title: string;
  options: { value: T; label: string }[];
  selected: T[];
  onSave: (selected: T[]) => void;
  onCancel: () => void;
  allowNew?: { label: string };
}) {
  const [draft, setDraft] = useState<T[]>(selected);
  return (
    <div className="flex flex-col gap-3">
      <p className="font-medium">{title}</p>
      <ChoicePicker options={options} value={draft} onChange={setDraft} allowNew={allowNew} />
      <SaveCancel onSave={() => onSave(draft)} onCancel={onCancel} />
    </div>
  );
}

export function SlotsEditor({
  slots,
  onSave,
  onCancel,
}: {
  slots: VisitSlot[];
  onSave: (slots: VisitSlot[]) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<VisitSlot[]>(slots);
  return (
    <div className="flex flex-col gap-3">
      <p className="font-medium">When can reps visit?</p>
      <SlotsPicker value={draft} onChange={setDraft} />
      <SaveCancel onSave={() => onSave(draft)} onCancel={onCancel} />
    </div>
  );
}

export function CapEditor({
  cap,
  onSave,
  onCancel,
}: {
  cap: number;
  onSave: (cap: number) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(cap);
  return (
    <div className="flex flex-col gap-3">
      <p className="font-medium">How many visits a week, at most?</p>
      <CapStepper value={draft} onChange={setDraft} />
      <SaveCancel onSave={() => onSave(draft)} onCancel={onCancel} />
    </div>
  );
}
