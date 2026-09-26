"use client";

import { CheckIcon } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STATUS_STYLE } from "@/lib/status-style";
import type { Day, VisitSlot } from "@/lib/types";
import {
  currentSlots,
  DAY_NAMES,
  formatDate,
  formatSlotTimes,
  nyToday,
  sortSlots,
  weeklyOccurrences,
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
  const [adding, setAdding] = useState(false);
  const [newOption, setNewOption] = useState("");

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
    setAdding(false);
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
      {allowNew &&
        (adding ? (
          // Typing a new one: a chip-sized box right under the chips. Enter adds it, Escape cancels.
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              addNew();
            }}
          >
            <Input
              aria-label={allowNew.label}
              placeholder={allowNew.label}
              autoFocus
              value={newOption}
              maxLength={60}
              onChange={(event) => setNewOption(event.target.value)}
              onKeyDown={(event) => event.key === "Escape" && setAdding(false)}
              className="h-12 w-56 text-lg md:text-lg"
            />
            <Button type="submit" disabled={newOption.trim() === ""} className="h-12 px-4 text-lg">
              Add
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)} className="h-12 px-3 text-lg">
              Cancel
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setAdding(true)}
            className="h-12 self-start px-0 text-lg underline underline-offset-4"
          >
            + {allowNew.label}
          </Button>
        ))}
    </div>
  );
}

const WEEKDAYS: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];

// Every hour of the working day, 8 AM to 5 PM, so most offices never type a time.
const WORK_HOURS = Array.from({ length: 10 }, (_, i) => `${String(8 + i).padStart(2, "0")}:00`);

// One row of the grid: a time (or a From-Until window) that can be on for any weekday.
type Row = { time: string; end?: string };
const rowKey = (row: Row) => `${row.time}-${row.end ?? ""}`;

// Visit times in two parts:
// 1. The weekly pattern: a grid of weekdays by the hours of the working day, in a scroll box
//    that opens at the first time already set. Tap a box to make that time available every week
//    (it turns green), or drag across boxes to set many. Tap a day or a time to fill that whole
//    column or row (hovering it outlines what would change). "Other time" adds a row, e.g. 12:30.
// 2. The next two weeks: each actual visit time. Tap one to skip just that date
//    (e.g. the doctor is out), without touching the weekly pattern. Tap again to bring it back.
export function SlotsPicker({
  value,
  onChange,
}: {
  value: VisitSlot[];
  onChange: (value: VisitSlot[]) => void;
}) {
  const [extraRows, setExtraRows] = useState<Row[]>([]); // rows added with "Other time", not used yet
  const [addingTime, setAddingTime] = useState(false);
  const [newTime, setNewTime] = useState("");

  const weekly = value.filter((slot) => !slot.date);
  const oneOffs = sortSlots(currentSlots(value.filter((slot) => slot.date), new Date()));

  // Rows: the working hours, every time already in use, and any just added. Earliest first.
  const rows = new Map<string, Row>();
  for (const row of [...WORK_HOURS.map((time): Row => ({ time })), ...weekly, ...extraRows]) {
    rows.set(rowKey(row), { time: row.time, end: row.end });
  }
  const sortedRows = [...rows.values()].sort((a, b) => rowKey(a).localeCompare(rowKey(b)));

  const findSlot = (day: Day, row: Row) =>
    weekly.find((slot) => slot.day === day && rowKey(slot) === rowKey(row));

  // The latest list, so a fast drag that changes several boxes between renders doesn't lose any.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  // Turn a set of boxes on (available every week) or off, starting from `list`.
  function withCells(list: VisitSlot[], cells: { day: Day; row: Row }[], on: boolean): VisitSlot[] {
    const isCell = (slot: VisitSlot, cell: { day: Day; row: Row }) =>
      !slot.date && slot.day === cell.day && rowKey(slot) === rowKey(cell.row);
    return on
      ? [
          ...list,
          ...cells
            .filter((cell) => !list.some((slot) => isCell(slot, cell)))
            .map((cell) => ({ day: cell.day, ...cell.row })),
        ]
      : list.filter((slot) => !cells.some((cell) => isCell(slot, cell)));
  }

  function setCells(cells: { day: Day; row: Row }[], on: boolean) {
    const next = withCells(latest.current, cells, on);
    latest.current = next;
    onChange(next);
  }

  // A whole day (column) or a whole time (row): fill it, or clear it if it's already full.
  function fillLine(cells: { day: Day; row: Row }[]) {
    setCells(cells, !cells.every((cell) => findSlot(cell.day, cell.row)));
  }
  const dayCells = (day: Day) => sortedRows.map((row) => ({ day, row }));
  const rowCells = (row: Row) => WEEKDAYS.map((day) => ({ day, row }));

  // Drag across boxes to set many at once, like selecting cells in a spreadsheet: everything
  // in the rectangle from the first box to the current one. The first box decides the direction
  // (on becomes off, off becomes on). Dragging back shrinks the rectangle again.
  const dragging = useRef<{ on: boolean; day: number; row: number; before: VisitSlot[] } | null>(null);
  useEffect(() => {
    const stop = () => (dragging.current = null);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  function dragTo(day: number, row: number) {
    const drag = dragging.current!;
    const cells = [];
    for (let d = Math.min(drag.day, day); d <= Math.max(drag.day, day); d++) {
      for (let r = Math.min(drag.row, row); r <= Math.max(drag.row, row); r++) {
        cells.push({ day: WEEKDAYS[d], row: sortedRows[r] });
      }
    }
    const next = withCells(drag.before, cells, drag.on);
    latest.current = next;
    onChange(next);
  }

  // Hovering a day or a time outlines the boxes a tap on it would change.
  const [preview, setPreview] = useState<{ day?: Day; row?: string } | null>(null);
  const inPreview = (day: Day, row: Row) =>
    preview !== null && (preview.day === day || preview.row === rowKey(row));
  // Would the tap fill the line (or clear it, because it's already full)?
  const previewCells = sortedRows.flatMap((row) =>
    WEEKDAYS.filter((day) => inPreview(day, row)).map((day) => ({ day, row }))
  );
  const previewFills = !previewCells.every((cell) => findSlot(cell.day, cell.row));

  function toggleSkip(slot: VisitSlot, date: string) {
    const today = nyToday(new Date());
    const kept = (slot.skip ?? []).filter((d) => d >= today && d !== date); // old skips drop off
    const skip = slot.skip?.includes(date) ? kept : [...kept, date].sort();
    const updated: VisitSlot = { ...slot, skip };
    if (skip.length === 0) delete updated.skip;
    onChange(value.map((s) => (s === slot ? updated : s)));
  }

  function addRow() {
    if (newTime && !rows.has(rowKey({ time: newTime }))) setExtraRows([...extraRows, { time: newTime }]);
    setNewTime("");
    setAddingTime(false);
  }

  const coming = weeklyOccurrences(value, new Date());

  // Open the scroll box at the first time already set, so the office sees its pattern right away.
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const grid = gridRef.current;
    const firstOn = grid?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (grid && firstOn) grid.scrollTop = firstOn.offsetTop - 56; // below the day names
  }, []);

  return (
    <div className="flex flex-col gap-5">
      {/* The weekly pattern. The day names stay put while the hours scroll. */}
      <div
        ref={gridRef}
        className="relative grid max-h-80 grid-cols-[auto_repeat(5,minmax(0,1fr))] items-center gap-1.5 overflow-y-auto pr-2"
      >
        <span className="sticky top-0 z-10 h-12 bg-card" />
        {WEEKDAYS.map((day) => (
          <button
            key={day}
            type="button"
            aria-label={`Every ${DAY_NAMES[day]} time`}
            onClick={() => fillLine(dayCells(day))}
            onPointerEnter={() => setPreview({ day })}
            onPointerLeave={() => setPreview(null)}
            onFocus={() => setPreview({ day })}
            onBlur={() => setPreview(null)}
            className="sticky top-0 z-10 h-12 rounded-lg bg-card text-base text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {day}
          </button>
        ))}
        {sortedRows.map((row, rowIndex) => (
          <Fragment key={rowKey(row)}>
            <button
              type="button"
              aria-label={`${formatSlotTimes(row)} every day`}
              onClick={() => fillLine(rowCells(row))}
              onPointerEnter={() => setPreview({ row: rowKey(row) })}
              onPointerLeave={() => setPreview(null)}
              onFocus={() => setPreview({ row: rowKey(row) })}
              onBlur={() => setPreview(null)}
              className="h-12 pr-2 text-left text-base whitespace-nowrap underline-offset-4 hover:underline"
            >
              {formatSlotTimes(row)}
            </button>
            {WEEKDAYS.map((day, dayIndex) => {
              const on = Boolean(findSlot(day, row));
              return (
                <Button
                  key={day}
                  type="button"
                  variant="outline"
                  aria-pressed={on}
                  aria-label={`${DAY_NAMES[day]} ${formatSlotTimes(row)}${on ? ", available" : ""}`}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    // Let the drag reach the next box (touch screens hold it on the first one).
                    event.currentTarget.releasePointerCapture(event.pointerId);
                    dragging.current = { on: !on, day: dayIndex, row: rowIndex, before: latest.current };
                    dragTo(dayIndex, rowIndex);
                  }}
                  onPointerEnter={() => dragging.current && dragTo(dayIndex, rowIndex)}
                  // Keyboard only (Enter or Space): pointer taps are handled on pointer down.
                  onClick={(event) => event.detail === 0 && setCells([{ day, row }], !on)}
                  className={`h-12 w-full touch-none px-0 ${
                    on ? `border-transparent ${STATUS_STYLE.open.className} hover:bg-status-open/90` : ""
                  } ${previewClass(inPreview(day, row), on, previewFills)}`}
                >
                  {on && <CheckIcon className="size-5" />}
                </Button>
              );
            })}
          </Fragment>
        ))}
      </div>

      {addingTime ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            addRow();
          }}
        >
          <Input
            type="time"
            step={900}
            aria-label="Other time"
            autoFocus
            value={newTime}
            onChange={(event) => setNewTime(event.target.value)}
            className="h-12 w-36 text-lg md:text-lg"
          />
          <Button type="submit" disabled={!newTime} className="h-12 px-4 text-lg">
            Add
          </Button>
          <Button type="button" variant="ghost" onClick={() => setAddingTime(false)} className="h-12 px-3 text-lg">
            Cancel
          </Button>
        </form>
      ) : (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setAddingTime(true)}
          className="h-12 self-start px-0 text-lg underline underline-offset-4"
        >
          + Other time
        </Button>
      )}

      {/* The next two weeks, one tap to skip a date. */}
      {(coming.length > 0 || oneOffs.length > 0) && (
        <div className="flex flex-col gap-2">
          <span className="text-base text-muted-foreground">Next two weeks. Tap a visit to skip it.</span>
          <div className="flex flex-wrap gap-2">
            {coming.map(({ slot, date, skipped }) => (
              <Button
                key={`${date}-${rowKey(slot)}`}
                type="button"
                variant="outline"
                aria-pressed={skipped}
                onClick={() => toggleSkip(slot, date)}
                className={`h-12 px-3 text-base ${skipped ? "text-muted-foreground line-through" : ""}`}
              >
                {formatDate(date)}, {formatSlotTimes(slot)}
              </Button>
            ))}
            {/* One-off times from before. Tapping one removes it. */}
            {oneOffs.map((slot) => (
              <Button
                key={`${slot.date}-${rowKey(slot)}`}
                type="button"
                variant="outline"
                onClick={() => onChange(value.filter((s) => s !== slot))}
                className="h-12 px-3 text-base"
              >
                {formatDate(slot.date!)}, {formatSlotTimes(slot)} (only then)
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// How a box looks while a day or time is hovered: a light green fill where the tap would add
// a time, faded where it would clear one.
function previewClass(inPreview: boolean, on: boolean, fills: boolean): string {
  if (!inPreview) return "";
  if (fills) return on ? "" : "border-status-open bg-status-open/20";
  return "opacity-40";
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

// --- Inline editors for one setting: a picker plus Save / Cancel. The setting's label is the title. ---

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
  options,
  selected,
  onSave,
  onCancel,
  allowNew,
}: {
  options: { value: T; label: string }[];
  selected: T[];
  onSave: (selected: T[]) => void;
  onCancel: () => void;
  allowNew?: { label: string };
}) {
  const [draft, setDraft] = useState<T[]>(selected);
  return (
    <div className="flex flex-col gap-3">
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
      <CapStepper value={draft} onChange={setDraft} />
      <SaveCancel onSave={() => onSave(draft)} onCancel={onCancel} />
    </div>
  );
}
