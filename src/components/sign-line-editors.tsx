"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Day, VisitSlot } from "@/lib/types";
import { formatClock } from "@/lib/week";

// Inline editors for one line of the Door Sign. Save applies it (with Undo); Cancel closes it.

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

function Chip({
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
export function ChoiceEditor<T extends string>({
  title,
  options,
  selected,
  onSave,
  onCancel,
}: {
  title: string;
  options: { value: T; label: string }[];
  selected: T[];
  onSave: (selected: T[]) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<T[]>(selected);

  function toggle(value: T) {
    setDraft(draft.includes(value) ? draft.filter((v) => v !== value) : [...draft, value]);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="font-medium">{title}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Chip
            key={option.value}
            selected={draft.includes(option.value)}
            onClick={() => toggle(option.value)}
          >
            {option.label}
          </Chip>
        ))}
      </div>
      {/* Keep the options' order, not the tap order. */}
      <SaveCancel
        onSave={() => onSave(options.map((o) => o.value).filter((v) => draft.includes(v)))}
        onCancel={onCancel}
      />
    </div>
  );
}

const WEEKDAYS: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const COMMON_TIMES = ["08:00", "11:30", "12:00", "12:30", "15:00"];

// Visit times: one row per weekday, tap the times that work.
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
  const times = [...new Set([...COMMON_TIMES, ...slots.map((slot) => slot.time)])].sort();
  const days = [...new Set([...WEEKDAYS, ...slots.map((slot) => slot.day)])];

  const has = (day: Day, time: string) =>
    draft.some((slot) => slot.day === day && slot.time === time);

  function toggle(day: Day, time: string) {
    setDraft(
      has(day, time)
        ? draft.filter((slot) => !(slot.day === day && slot.time === time))
        : [...draft, { day, time }]
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="font-medium">When can reps visit?</p>
      {days.map((day) => (
        <div key={day} className="flex flex-wrap items-center gap-2">
          <span className="w-12 font-medium">{day}</span>
          {times.map((time) => (
            <Chip key={time} selected={has(day, time)} onClick={() => toggle(day, time)}>
              {formatClock(time)}
            </Chip>
          ))}
        </div>
      ))}
      <SaveCancel onSave={() => onSave(draft)} onCancel={onCancel} />
    </div>
  );
}

// Weekly cap: a stepper from 0 to 10.
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
      <p className="font-medium">Most visits in a week</p>
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          onClick={() => setDraft(Math.max(0, draft - 1))}
          disabled={draft === 0}
          className="h-12 px-5 text-lg"
        >
          Fewer
        </Button>
        <span className="w-10 text-center text-3xl font-semibold">{draft}</span>
        <Button
          variant="outline"
          onClick={() => setDraft(Math.min(10, draft + 1))}
          disabled={draft === 10}
          className="h-12 px-5 text-lg"
        >
          More
        </Button>
      </div>
      <SaveCancel onSave={() => onSave(draft)} onCancel={onCancel} />
    </div>
  );
}
