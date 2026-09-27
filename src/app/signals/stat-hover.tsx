"use client";

import { Tooltip } from "@/components/ui/tooltip";
import type { Line, Stat } from "@/lib/signals";

// How many names a hover lists before it says "and N more".
const MAX_ITEMS = 8;

// A number in a sentence: bold with a dotted underline, so it reads as "there's more here".
// Hover (or tap, on a phone) to see how it was counted and which practices are behind it.
export function StatHover({ stat, className = "" }: { stat: Stat; className?: string }) {
  const items = stat.items ?? [];
  return (
    <Tooltip
      className="max-w-80"
      trigger={
        <button
          type="button"
          className={`cursor-help font-semibold underline decoration-foreground/40 decoration-dotted underline-offset-4 ${className}`}
        >
          {stat.value}
        </button>
      }
    >
      <span className="flex flex-col gap-2">
        <span>{stat.about}</span>
        {items.length > 0 && (
          <span className="flex flex-col gap-0.5 border-t border-background/20 pt-2 text-sm">
            {items.slice(0, MAX_ITEMS).map((item) => (
              <span key={item}>{item}</span>
            ))}
            {items.length > MAX_ITEMS && <span>and {items.length - MAX_ITEMS} more</span>}
          </span>
        )}
      </span>
    </Tooltip>
  );
}

// A sentence from Demand Signals: its text, with each number as a StatHover.
export function Say({ line }: { line: Line }) {
  return (
    <>
      {line.map((part, i) =>
        typeof part === "string" ? <span key={i}>{part}</span> : <StatHover key={i} stat={part} />
      )}
    </>
  );
}
