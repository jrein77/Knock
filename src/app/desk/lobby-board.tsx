"use client";

import { CalendarIcon, MessageSquareIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { MonthPicker } from "@/components/month-picker";
import { SignEditor } from "@/components/sign-editor";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DECISION_STYLE } from "@/lib/status-style";
import { useOfficePings } from "@/lib/use-office-pings";
import type { DecisionKind, Office, Purpose, RedirectAction, Source, Status } from "@/lib/types";
import { formatDate, formatSlot, formatWhen, shiftDate, TIME_ZONE } from "@/lib/week";

type DeskRequest = {
  id: string;
  rep_name: string | null;
  rep_company: string | null;
  purpose: Purpose;
  source: Source;
  decision: DecisionKind;
  reason_code: string | null;
  redirect_action: RedirectAction | null;
  slot_at: string | null;
  overridden: boolean;
  overridden_at: string | null;
  original_decision: DecisionKind | null; // what the sign said before the desk overruled it
  original_reason_code: string | null;
  redirect_taken_at: string | null;
  rep_message: string | null;
  created_at: string;
  drugs: { brand: string } | null;
};

// Something a rep wrote to the desk: a "we got it wrong" note, or a message sent with a request.
type InboxItem = {
  kind: "note" | "message";
  id: string;
  body: string;
  repName: string | null;
  repCompany: string | null;
  drug: string | null;
  decision: DecisionKind | null;
  handled: boolean;
  createdAt: string;
};

type DeskData = {
  office: Office & { effective_status: Status };
  day: string; // the day shown, "YYYY-MM-DD"
  today: string;
  requests: DeskRequest[];
  inbox: InboxItem[];
};

type Filter = "all" | DecisionKind;

// The desk sees why. Reps never do.
const REASON_LABELS: Record<string, string> = {
  safety: "Safety notice, always accepted",
  blocked: "Company is blocked",
  closed: "Sign is closed",
  off_topic: "Not a wanted topic",
  drop_samples: "Sample drop-off",
  slot: "Visit booked",
  cap_full: "Week is full",
  no_slots: "No visit times this week",
};

const REDIRECT_TAKEN_LABELS: Record<RedirectAction, string> = {
  drop_samples: "Rep is dropping off samples",
  virtual: "Rep wants a virtual meeting",
  next_slot: "Rep booked the next open slot",
  leave_materials: "Rep is leaving materials",
};

type OverrideBody =
  | { action: "approve" | "decline" }
  | {
      action: "restore";
      previous: Pick<
        DeskRequest,
        | "decision"
        | "slot_at"
        | "redirect_action"
        | "overridden"
        | "overridden_at"
        | "original_decision"
        | "original_reason_code"
      >;
    };

async function postOverride(requestId: string, body: OverrideBody): Promise<boolean> {
  const response = await fetch(`/api/requests/${requestId}/override`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.ok;
}

export function LobbyBoard({ officeId }: { officeId: string }) {
  const [data, setData] = useState<DeskData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [view, setView] = useState<"requests" | "sign">("requests");
  const [day, setDay] = useState<string | null>(null); // null = today
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [pickingDay, setPickingDay] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null); // one open row at a time

  const load = useCallback(async () => {
    try {
      const dayParam = day ? `&date=${day}` : "";
      const response = await fetch(`/api/desk?officeId=${officeId}${dayParam}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      setData(await response.json());
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [officeId, day]);

  // Loads now, again whenever the day changes, and on every ping from the server.
  useOfficePings(officeId, load);

  async function override(request: DeskRequest, action: "approve" | "decline") {
    const previous = {
      decision: request.decision,
      slot_at: request.slot_at,
      redirect_action: request.redirect_action,
      overridden: request.overridden,
      overridden_at: request.overridden_at,
      original_decision: request.original_decision,
      original_reason_code: request.original_reason_code,
    };
    if (!(await postOverride(request.id, { action }))) {
      toast.error("Couldn't save that. Please try again.");
      return;
    }
    load();

    const done =
      action === "approve"
        ? `Approved ${request.rep_name ?? "this request"}`
        : request.decision === "accepted"
          ? `Canceled the visit for ${request.rep_name ?? "this rep"}`
          : `Declined ${request.rep_name ?? "this request"}`;
    toast(done, {
      duration: 10_000,
      action: {
        label: "Undo",
        onClick: async () => {
          await postOverride(request.id, { action: "restore", previous });
          load();
        },
      },
    });
  }

  async function resetDemo() {
    const response = await fetch("/api/demo/reset", { method: "POST" });
    if (response.ok) toast("Demo reset");
    else toast.error("Couldn't reset the demo.");
    load();
  }

  if (!data) {
    return (
      <Board>
        {loadFailed ? (
          <p>Couldn&apos;t load the board. Check the connection and refresh.</p>
        ) : (
          <>
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </>
        )}
      </Board>
    );
  }

  const { office, requests, inbox } = data;
  const isToday = data.day === data.today;

  // Search and filter the day's requests.
  const query = search.trim().toLowerCase();
  const matching = requests.filter(
    (r) =>
      query === "" ||
      [r.rep_name, r.rep_company, r.drugs?.brand].some((field) => field?.toLowerCase().includes(query))
  );
  const shown = matching.filter((r) => filter === "all" || r.decision === filter);
  const countOf = (decision: DecisionKind) => matching.filter((r) => r.decision === decision).length;

  function goToDay(day: string) {
    setDay(day === data!.today ? null : day);
    setExpanded(null);
  }

  return (
    <Board>
      {/* One row: the office, and its inbox. */}
      <header className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 text-xl font-semibold sm:text-3xl">{office.name}</h1>
        <Inbox items={inbox} onChange={load} />
      </header>

      {/* Two views only: Requests and Our Sign. */}
      <ToggleGroup
        value={[view]}
        onValueChange={(value) => {
          if (value[0]) setView(value[0] as "requests" | "sign");
        }}
        variant="outline"
        className="grid w-full grid-cols-2"
      >
        <ToggleGroupItem value="requests" className="h-12 w-full text-lg">
          Requests
        </ToggleGroupItem>
        <ToggleGroupItem value="sign" className="h-12 w-full text-lg">
          Our Sign
        </ToggleGroupItem>
      </ToggleGroup>

      {view === "sign" && <SignEditor officeId={officeId} showName={false} />}

      {view === "requests" && (
        <section className="flex flex-col gap-4">
          {/* Which day: step a day at a time, or tap the date for a month view. */}
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
            <Button variant="outline" onClick={() => goToDay(shiftDate(data.day, -1))} className="h-12 px-4 text-lg">
              Earlier
            </Button>
            <Button variant="ghost" onClick={() => setPickingDay(true)} className="h-12 text-lg font-semibold">
              <CalendarIcon className="size-5" />
              {dayLabel(data.day, data.today)}
            </Button>
            <Button
              variant="outline"
              onClick={() => goToDay(shiftDate(data.day, 1))}
              disabled={isToday}
              className="h-12 px-4 text-lg"
            >
              Later
            </Button>
          </div>
          <Drawer open={pickingDay} onOpenChange={setPickingDay}>
            <DrawerContent>
              <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-6">
                <div className="flex items-center justify-between gap-4">
                  <DrawerTitle className="text-2xl">Pick a day</DrawerTitle>
                  <DrawerClose render={<Button variant="outline" className="h-12 px-5 text-lg" />}>
                    Close
                  </DrawerClose>
                </div>
                <MonthPicker
                  officeId={officeId}
                  selected={data.day}
                  today={data.today}
                  onPick={(day) => {
                    goToDay(day);
                    setPickingDay(false);
                  }}
                />
                {!isToday && (
                  <Button
                    onClick={() => {
                      goToDay(data.today);
                      setPickingDay(false);
                    }}
                    className="h-12 text-lg"
                  >
                    Back to today
                  </Button>
                )}
              </div>
            </DrawerContent>
          </Drawer>

          {/* Find someone, or narrow to one kind of answer. */}
          <Input
            aria-label="Search requests"
            placeholder="Search by rep, company, or drug"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-12 text-lg md:text-lg"
          />
          {/* One row; slides sideways on a narrow phone instead of wrapping. */}
          <div className="-mx-6 flex gap-2 overflow-x-auto px-6 [scrollbar-width:none]">
            <FilterChip selected={filter === "all"} onClick={() => setFilter("all")}>
              All ({matching.length})
            </FilterChip>
            {(["accepted", "redirected", "declined"] as const).map((decision) => (
              <FilterChip
                key={decision}
                selected={filter === decision}
                onClick={() => setFilter(decision)}
              >
                {DECISION_STYLE[decision].label} ({countOf(decision)})
              </FilterChip>
            ))}
          </div>

          {shown.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">
              {requests.length === 0
                ? isToday
                  ? "No requests yet today. Scan the QR code to try it."
                  : "No requests that day."
                : "Nothing matches."}
            </p>
          ) : (
            // One line per request, newest first. Tap a line for details and the override button.
            // New QR arrivals slide in; rows already there when the board loads don't animate.
            <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
              <AnimatePresence initial={false}>
                {shown.map((request) => {
                  const row = (
                    <RequestRow
                      request={request}
                      expanded={expanded === request.id}
                      onToggle={() => setExpanded(expanded === request.id ? null : request.id)}
                      onOverride={isToday ? override : undefined}
                    />
                  );
                  return request.source === "qr" ? (
                    <motion.li
                      key={request.id}
                      layout
                      initial={{ opacity: 0, y: -24 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 28 }}
                    >
                      {row}
                    </motion.li>
                  ) : (
                    <li key={request.id}>{row}</li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </section>
      )}

      <footer className="flex justify-center pt-6">
        <Button variant="ghost" onClick={resetDemo} className="min-h-12 text-base text-muted-foreground">
          Reset demo
        </Button>
      </footer>
    </Board>
  );
}

function FilterChip({
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
      variant={selected ? "default" : "outline"}
      aria-pressed={selected}
      onClick={onClick}
      className="h-12 shrink-0 px-4 text-lg"
    >
      {children}
    </Button>
  );
}

// "Today", "Yesterday", or "Thu Sep 24".
function dayLabel(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === shiftDate(today, -1)) return "Yesterday";
  return formatDate(day);
}

const INBOX_KIND_LABELS: Record<InboxItem["kind"], string> = {
  note: "Thinks the sign got it wrong",
  message: "Sent with a visit request",
};

async function postHandled(item: InboxItem, handled: boolean): Promise<boolean> {
  const response = await fetch("/api/inbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: item.kind, id: item.id, handled }),
  });
  return response.ok;
}

// Everything reps wrote to the desk, in one place: a quiet chip, never an alert.
// Search it, and resolve things so the "New" list stays short.
function Inbox({ items, onChange }: { items: InboxItem[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"new" | "resolved">("new");
  const [search, setSearch] = useState("");

  const newItems = items.filter((item) => !item.handled);
  const resolvedItems = items.filter((item) => item.handled);
  const query = search.trim().toLowerCase();
  const shown = (view === "new" ? newItems : resolvedItems).filter(
    (item) =>
      query === "" ||
      [item.body, item.repName, item.repCompany, item.drug].some((field) =>
        field?.toLowerCase().includes(query)
      )
  );

  async function setHandled(item: InboxItem, handled: boolean) {
    if (!(await postHandled(item, handled))) {
      toast.error("Couldn't save that. Please try again.");
      return;
    }
    onChange();
    if (handled) {
      toast("Resolved", {
        duration: 10_000,
        action: {
          label: "Undo",
          onClick: async () => {
            await postHandled(item, false);
            onChange();
          },
        },
      });
    }
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        aria-label={`Messages, ${newItems.length} new`}
        className="relative size-12 shrink-0"
      >
        <MessageSquareIcon className="size-6" />
        {newItems.length > 0 && (
          <span className="absolute -top-2 -right-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-sm font-semibold text-primary-foreground">
            {newItems.length}
          </span>
        )}
      </Button>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 overflow-y-auto px-6 pb-6 text-lg">
            {/* Title, Close, and filters stay at the top while the list scrolls. */}
            <div className="sticky top-0 z-10 flex flex-col gap-4 bg-popover pt-6 pb-2">
              <div className="flex items-start justify-between gap-4">
                <DrawerHeader className="min-w-0 flex-1 shrink p-0 text-left group-data-[swipe-axis=y]/drawer-popup:text-left">
                  <DrawerTitle className="text-2xl">Messages from reps</DrawerTitle>
                  <DrawerDescription className="text-lg">
                    Notes from reps who think the sign got it wrong, and messages sent with requests.
                  </DrawerDescription>
                </DrawerHeader>
                <DrawerClose render={<Button variant="outline" className="h-12 shrink-0 px-5 text-lg" />}>
                  Close
                </DrawerClose>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={view === "new" ? "default" : "outline"}
                  aria-pressed={view === "new"}
                  onClick={() => setView("new")}
                  className="h-12 px-4 text-lg"
                >
                  New ({newItems.length})
                </Button>
                <Button
                  variant={view === "resolved" ? "default" : "outline"}
                  aria-pressed={view === "resolved"}
                  onClick={() => setView("resolved")}
                  className="h-12 px-4 text-lg"
                >
                  Resolved ({resolvedItems.length})
                </Button>
                <Input
                  aria-label="Search messages"
                  placeholder="Search by rep, company, drug, or words"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-12 min-w-56 flex-1 text-lg md:text-lg"
                />
              </div>
            </div>

            {shown.length === 0 && (
              <p className="py-6 text-center text-muted-foreground">
                {query ? "Nothing matches that search." : view === "new" ? "All caught up." : "Nothing resolved yet."}
              </p>
            )}
            <ul className="flex flex-col gap-3">
              {shown.map((item) => (
                <li key={`${item.kind}-${item.id}`} className="flex flex-col gap-2 rounded-xl bg-muted px-4 py-3">
                  <p className="text-base font-medium text-muted-foreground">{INBOX_KIND_LABELS[item.kind]}</p>
                  <p>{item.body}</p>
                  <p className="text-base text-muted-foreground">
                    {[
                      item.repName,
                      item.repCompany,
                      item.drug,
                      item.decision && DECISION_STYLE[item.decision].label,
                      formatWhen(item.createdAt, new Date()),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {/* Always its own row, bottom right, so it's in the same place on every message. */}
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      onClick={() => setHandled(item, !item.handled)}
                      className="h-12 px-4 text-lg"
                    >
                      {item.handled ? "Reopen" : "Resolve"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

// Page frame: centered, one column.
function Board({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh w-full flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-2xl flex-col gap-6">{children}</div>
    </main>
  );
}

// A rep who scanned the QR code at this desk. Full card with override buttons.
// One request as a line item: time, who, what, and the answer.
// Tapping it opens the details: why (or the override record), the rep's message,
// and one override button on today's board ("Cancel visit" or "Approve anyway").
function RequestRow({
  request,
  expanded,
  onToggle,
  onOverride,
}: {
  request: DeskRequest;
  expanded: boolean;
  onToggle: () => void;
  onOverride?: (request: DeskRequest, action: "approve" | "decline") => void;
}) {
  const booked = request.decision === "accepted";
  const canAct = onOverride && !(booked && request.purpose === "safety_notice");
  const where = request.source === "qr" ? "at the desk" : "fit list";

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-semibold">{request.rep_name}</span>
          <span className="block text-base text-muted-foreground">
            {[
              request.rep_company,
              whatTheyBrought(request),
              formatTime(request.created_at),
              where,
              request.overridden && "overridden",
              request.rep_message && "message",
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <DecisionBadge decision={request.decision} />
      </button>

      {/* Details sit right on the row: plain lines, no boxes inside boxes. */}
      {expanded && (
        <div className="flex flex-col gap-2 px-4 pb-4 text-lg">
          <DecisionDetail request={request} />
          {request.rep_message && (
            <p>
              <span className="text-muted-foreground">Rep wrote: </span>&ldquo;{request.rep_message}&rdquo;
            </p>
          )}
          {canAct && (
            <Button
              variant={booked ? "outline" : "default"}
              onClick={() => onOverride(request, booked ? "decline" : "approve")}
              className="h-12 self-start px-5 text-lg"
            >
              {booked ? "Cancel visit" : "Approve anyway"}
            </Button>
          )}
        </div>
      )}
    </>
  );
}

function DecisionBadge({ decision }: { decision: DecisionKind }) {
  const style = DECISION_STYLE[decision];
  return <Badge className={`h-auto px-3 py-1 text-base ${style.className}`}>{style.label}</Badge>;
}

function DecisionDetail({ request }: { request: DeskRequest }) {
  return (
    <div className="flex flex-col gap-1">
      {request.overridden ? (
        <OverrideNote request={request} />
      ) : (
        REASON_LABELS[request.reason_code ?? ""] && <p>{REASON_LABELS[request.reason_code ?? ""]}</p>
      )}
      {request.slot_at && <p className="font-medium">{formatSlot(request.slot_at)}</p>}
      {request.redirect_taken_at && request.redirect_action && (
        <p className="font-medium">{REDIRECT_TAKEN_LABELS[request.redirect_action]}</p>
      )}
    </div>
  );
}

// The record of an override: when the desk overruled the sign, and what the sign had said.
function OverrideNote({ request }: { request: DeskRequest }) {
  const signSaid = request.original_decision
    ? [DECISION_STYLE[request.original_decision].label, REASON_LABELS[request.original_reason_code ?? ""]]
        .filter(Boolean)
        .join(", ")
    : null;
  return (
    <>
      <p className="font-medium">
        Overridden by the front desk
        {request.overridden_at && ` at ${formatTime(request.overridden_at)}`}
      </p>
      {signSaid && <p className="text-muted-foreground">The sign said: {signSaid}</p>}
    </>
  );
}

function whatTheyBrought(request: DeskRequest): string {
  const drug = request.drugs?.brand;
  if (request.purpose === "safety_notice") return drug ? `Safety notice (${drug})` : "Safety notice";
  if (request.purpose === "drop_samples") return `${drug} samples`;
  if (request.purpose === "lunch") return `${drug} lunch`;
  return drug ?? "";
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}
