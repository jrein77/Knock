"use client";

import { AnimatePresence, motion } from "motion/react";
import { REDIRECT_OPTION_LABELS, STATUS_STYLE } from "@/lib/status-style";
import type { RedirectAction, Status, VisitSlot } from "@/lib/types";
import { currentSlots, formatSlotLine, sortSlots } from "@/lib/week";

export type SignLine = "topics" | "slots" | "redirects" | "cap" | "blocks";

type DoorSignProps = {
  name: string;
  neighborhood: string | null;
  specialty: string | null;
  status: Status; // the effective status right now
  todayOnly: boolean; // status is a "just today" override
  topics: string[];
  topicsNote?: string | null; // free text the office added about topics
  visitSlots: VisitSlot[];
  redirectOptions: RedirectAction[];
  // Office screens only. Never pass these on a rep screen.
  privateInfo?: { weeklyCap: number; brandBlocks: string[] };
  // Edit in place (office screens only): tapping a line opens its editor in the same spot.
  editing?: SignLine | null;
  onEdit?: (line: SignLine) => void;
  renderEditor?: (line: SignLine) => React.ReactNode;
};

// The Door Sign: what an office tells reps. One component for every surface.
export function DoorSign(props: DoorSignProps) {
  const status = STATUS_STYLE[props.status];
  const subtitle = [props.specialty, props.neighborhood].filter(Boolean).join(" · ");
  const slots = sortSlots(currentSlots(props.visitSlots, new Date()));

  return (
    <div className="overflow-hidden rounded-3xl bg-card text-card-foreground shadow-lg ring-1 ring-foreground/10">
      <div className="px-7 pt-7 pb-5">
        <h2 className="text-2xl font-semibold">{props.name}</h2>
        {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
      </div>

      {/* The status band flips over when the status changes. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${props.status}-${props.todayOnly}`}
          initial={{ rotateX: -90, opacity: 0 }}
          animate={{ rotateX: 0, opacity: 1 }}
          exit={{ rotateX: 90, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className={`px-7 py-4 text-2xl font-semibold ${status.className}`}
        >
          {status.label}
          {props.todayOnly && <span className="font-normal"> (just today)</span>}
        </motion.div>
      </AnimatePresence>

      <div className="flex flex-col gap-1 px-4 py-4">
        <Line {...props} line="topics" label="Wants">
          {props.topics.length > 0 ? props.topics.join(", ") : "No specific topics"}
          {props.topicsNote && (
            <span className="block text-base text-muted-foreground">{props.topicsNote}</span>
          )}
        </Line>
        <Line {...props} line="slots" label="Visits">
          {slots.length > 0
            ? slots.map(formatSlotLine).join(" · ")
            : "No visit times"}
        </Line>
        <Line {...props} line="redirects" label="Also welcome">
          {props.redirectOptions.length > 0
            ? props.redirectOptions.map((option) => REDIRECT_OPTION_LABELS[option]).join(", ")
            : "Nothing else right now"}
        </Line>
      </div>

      {props.privateInfo && (
        <div className="flex flex-col gap-1 border-t bg-muted/60 px-4 py-4">
          <p className="px-3 text-base font-medium text-muted-foreground">
            Private, reps never see this
          </p>
          <Line {...props} line="cap" label="Weekly cap">
            {props.privateInfo.weeklyCap === 1
              ? "Up to 1 visit a week"
              : `Up to ${props.privateInfo.weeklyCap} visits a week`}
          </Line>
          <Line {...props} line="blocks" label="Not taking">
            {props.privateInfo.brandBlocks.length > 0
              ? props.privateInfo.brandBlocks.join(", ")
              : "No blocked companies"}
          </Line>
        </div>
      )}
    </div>
  );
}

// One line of the sign. Tappable when the sign is editable.
function Line({
  line,
  label,
  children,
  editing,
  onEdit,
  renderEditor,
}: DoorSignProps & { line: SignLine; label: string; children: React.ReactNode }) {
  if (editing === line && renderEditor) {
    return <div className="rounded-xl bg-background p-3 ring-1 ring-foreground/15">{renderEditor(line)}</div>;
  }

  const content = (
    <>
      <span className="text-base text-muted-foreground">{label}</span>
      <span className="text-lg">{children}</span>
    </>
  );

  if (!onEdit) {
    return <div className="flex flex-col px-3 py-2">{content}</div>;
  }
  return (
    <button
      type="button"
      onClick={() => onEdit(line)}
      className="flex min-h-12 w-full items-center justify-between gap-4 rounded-xl px-3 py-2 text-left hover:bg-muted"
    >
      <span className="flex flex-col">{content}</span>
      <span className="text-base text-muted-foreground underline">Edit</span>
    </button>
  );
}
