"use client";

import { EyeIcon, LockIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { SignLine } from "@/components/door-sign";
import { CapEditor, ChoiceEditor, SlotsEditor } from "@/components/sign-line-editors";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { LastChange, SignChange } from "@/lib/sign";
import { REDIRECT_OPTION_LABELS, STATUS_STYLE } from "@/lib/status-style";
import type { Office, RedirectAction, Status } from "@/lib/types";
import { useOfficePings } from "@/lib/use-office-pings";
import { formatSlotLine, formatWhen, nyToday, sortSlots } from "@/lib/week";

type SignData = {
  office: Office & { effective_status: Status };
  brandBlocks: string[];
  lastChange: LastChange | null;
  areas: string[];
  companies: string[];
};

// Each status says what it does to reps, so nobody has to guess.
const STATUSES: { value: Status; label: string; effect: string }[] = [
  { value: "open", label: "Open", effect: "Any rep can ask for a visit." },
  { value: "topics", label: "Topics only", effect: "Only reps who carry a topic you want." },
  { value: "closed", label: "Closed", effect: "No visits. Reps are offered other options." },
];

// Everything the office answers besides the status. One question each.
type Question = Exclude<SignLine, "status">;

async function postJson(url: string, body: unknown): Promise<{ historyId: string | null } | null> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

// How the office answers "do we take rep visits, and which ones?". Used on /sign and in the desk's
// "Rep visits" view. Plain questions in two sections: what reps see, and what only the office sees.
// `showName` is off on the desk, where the page header already shows the office name.
export function SignEditor({ officeId, showName = true }: { officeId: string; showName?: boolean }) {
  const [data, setData] = useState<SignData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editing, setEditing] = useState<Question | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/sign?officeId=${officeId}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      setData(await response.json());
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [officeId]);

  // Reload whenever anything on this office changes, e.g. an edit from the desk.
  useOfficePings(officeId, load);

  // Clicking anywhere outside an open editor closes it, like Cancel.
  useEffect(() => {
    if (!editing) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!(event.target as Element).closest("[data-open-editor]")) setEditing(null);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [editing]);

  // Undo, never confirm: every change shows a toast with Undo for 10 seconds.
  function showUndo(message: string, historyId: string | null) {
    toast(message, {
      duration: 10_000,
      action: historyId
        ? {
            label: "Undo",
            onClick: async () => {
              const undone = await postJson("/api/sign/restore", { historyId, mode: "undo" });
              if (!undone) toast.error("Couldn't undo. Please try again.");
              load();
            },
          }
        : undefined,
    });
  }

  async function save(change: SignChange, summary: string) {
    setEditing(null);
    const saved = await postJson("/api/sign", { officeId, change, summary });
    if (!saved) {
      toast.error("Couldn't save that change. Please try again.");
      return;
    }
    showUndo(summary, saved.historyId);
    load();
  }

  async function changeBack(lastChange: LastChange) {
    const reverted = await postJson("/api/sign/restore", {
      historyId: lastChange.id,
      mode: "revert",
    });
    if (!reverted) {
      toast.error("Couldn't change it back. Please try again.");
      return;
    }
    showUndo(`Changed back: ${lastChange.summary}`, reverted.historyId);
    load();
  }

  function setStatus(status: Status, justToday: boolean) {
    const label = STATUS_STYLE[status].label;
    if (justToday) {
      save(
        { today_status: status, today_status_date: nyToday(new Date()) },
        `${label} (just today)`
      );
    } else {
      // "From now on" also clears any just-today override so it takes effect right away.
      save({ status, today_status: null, today_status_date: null }, `${label} (from now on)`);
    }
  }

  if (!data) {
    return loadFailed ? (
      <p>Couldn&apos;t load the sign. Check the connection and refresh.</p>
    ) : (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-80 w-full rounded-3xl" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  const { office, brandBlocks, lastChange } = data;
  const todayOnly =
    office.today_status !== null && office.today_status_date === nyToday(new Date());

  function renderEditor(question: Question) {
    const close = () => setEditing(null);
    switch (question) {
      case "topics":
        return (
          <ChoiceEditor
            title="Which topics do you want to hear about?"
            options={[...new Set([...data!.areas, ...office.topics])].map((area) => ({
              value: area,
              label: area,
            }))}
            selected={office.topics}
            allowNew={{ label: "Add a topic" }}
            onSave={(topics) =>
              save({ topics }, topics.length ? `Wants: ${topics.join(", ")}` : "Wants no specific topics")
            }
            onCancel={close}
          />
        );
      case "slots":
        return (
          <SlotsEditor
            slots={office.visit_slots}
            onSave={(visit_slots) => save({ visit_slots }, "Visit times changed")}
            onCancel={close}
          />
        );
      case "redirects":
        return (
          <ChoiceEditor<RedirectAction>
            title="What can reps do instead of a visit?"
            options={(Object.keys(REDIRECT_OPTION_LABELS) as RedirectAction[]).map((option) => ({
              value: option,
              label: REDIRECT_OPTION_LABELS[option],
            }))}
            selected={office.redirect_options}
            onSave={(redirect_options) => save({ redirect_options }, "Other options changed")}
            onCancel={close}
          />
        );
      case "cap":
        return (
          <CapEditor
            cap={office.weekly_cap}
            onSave={(weekly_cap) => save({ weekly_cap }, `Weekly cap set to ${weekly_cap}`)}
            onCancel={close}
          />
        );
      case "blocks":
        return (
          <ChoiceEditor
            title="Which companies aren't you taking visits from?"
            options={[...new Set([...data!.companies, ...brandBlocks])].map((company) => ({
              value: company,
              label: company,
            }))}
            selected={brandBlocks}
            onSave={(brand_blocks) => save({ brand_blocks }, "Blocked companies changed")}
            onCancel={close}
          />
        );
    }
  }

  // One line per question: the question, today's answer, and a Change button.
  // Tapping Change opens that question's editor in the same spot.
  function question(key: Question, text: string, answer: string) {
    if (editing === key) {
      return (
        <div data-open-editor className="my-2 rounded-xl bg-background p-4 ring-1 ring-foreground/15">
          {renderEditor(key)}
        </div>
      );
    }
    return (
      <div className="flex items-center justify-between gap-4 py-3">
        <div className="flex min-w-0 flex-col">
          <span className="font-medium">{text}</span>
          <span className="text-muted-foreground">{answer}</span>
        </div>
        <Button variant="outline" onClick={() => setEditing(key)} className="h-12 shrink-0 px-4 text-lg">
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {showName && <h1 className="text-2xl font-semibold">{office.name}</h1>}

      {/* Public: everything here is on the Door Sign that reps check before they come. */}
      <section className="flex flex-col rounded-3xl bg-card px-5 py-5 shadow-lg ring-1 ring-foreground/10">
        <SectionHeading icon={<EyeIcon className="size-5" />} title="Reps see this">
          Your Door Sign. Reps check it before they come, and Knock uses it to answer every request.
        </SectionHeading>
        <div className="flex flex-col gap-3 pt-5 pb-3">
          <h3 className="font-medium">Are you taking rep visits?</h3>
          <StatusPicker
            current={office.effective_status}
            todayOnly={todayOnly}
            usual={office.status}
            onPick={setStatus}
          />
        </div>
        <div className="flex flex-col divide-y border-t">
          {question(
            "topics",
            "Which topics do you want to hear about?",
            office.topics.length > 0 ? office.topics.join(", ") : "No specific topics"
          )}
          {question(
            "slots",
            "When can reps visit?",
            office.visit_slots.length > 0
              ? sortSlots(office.visit_slots).map(formatSlotLine).join(" · ")
              : "No visit times"
          )}
          {question(
            "redirects",
            "What can reps do instead of a visit?",
            office.redirect_options.length > 0
              ? office.redirect_options.map((option) => REDIRECT_OPTION_LABELS[option]).join(", ")
              : "Nothing else right now"
          )}
        </div>
      </section>

      {/* Private: Knock uses these to decide, but never shows them to a rep. */}
      <section className="flex flex-col rounded-3xl bg-muted/60 px-5 py-5">
        <SectionHeading icon={<LockIcon className="size-5" />} title="Only your office sees this">
          Knock uses these to answer requests. Reps never see them or the reason behind a no.
        </SectionHeading>
        <div className="flex flex-col divide-y pt-2">
          {question(
            "cap",
            "How many visits a week, at most?",
            office.weekly_cap === 1 ? "1 visit" : `${office.weekly_cap} visits`
          )}
          {question(
            "blocks",
            "Any companies you're not taking visits from?",
            brandBlocks.length > 0 ? brandBlocks.join(", ") : "None"
          )}
        </div>
      </section>

      {lastChange && (
        <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
          <span>
            {formatWhen(lastChange.created_at, new Date())}: {lastChange.summary}.
          </span>
          <Button
            variant="link"
            onClick={() => changeBack(lastChange)}
            className="h-12 px-0 text-lg"
          >
            Change back
          </Button>
        </p>
      )}
    </div>
  );
}

// "Reps see this" / "Only your office sees this": says who can see a section, in words and an icon.
function SectionHeading({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="flex items-center gap-2 text-xl font-semibold">
        {icon}
        {title}
      </h2>
      <p className="text-base text-muted-foreground">{children}</p>
    </div>
  );
}

// The three statuses as big buttons, each saying what it does to reps. One tap changes it (with Undo).
// "Just for today" is optional: the status switches back on its own tomorrow,
// e.g. closed because the doctor is out.
function StatusPicker({
  current,
  todayOnly,
  usual,
  onPick,
}: {
  current: Status;
  todayOnly: boolean;
  usual: Status; // what it goes back to after a just-today change
  onPick: (status: Status, justToday: boolean) => void;
}) {
  const [justToday, setJustToday] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {STATUSES.map((status) => {
          const isNow = current === status.value;
          // Tapping the current status does nothing, unless "Just for today" changed:
          // then a just-today Closed can become Closed from now on, and the other way round.
          const unchanged = isNow && todayOnly === justToday;
          return (
            <Button
              key={status.value}
              variant="outline"
              aria-pressed={isNow}
              onClick={() => !unchanged && onPick(status.value, justToday)}
              className={`h-auto min-h-16 flex-col items-start gap-0 px-4 py-3 text-left whitespace-normal ${
                isNow ? STATUS_STYLE[status.value].className : ""
              }`}
            >
              <span className="text-xl font-semibold">
                {status.label}
                {isNow && (todayOnly ? " (now, just today)" : " (now)")}
              </span>
              <span className="text-base font-normal">{status.effect}</span>
            </Button>
          );
        })}
      </div>
      <label className="flex min-h-12 cursor-pointer items-center gap-3 text-lg">
        <input
          type="checkbox"
          checked={justToday}
          onChange={(event) => setJustToday(event.target.checked)}
          className="size-6 accent-foreground"
        />
        Just for today (switches back tomorrow)
      </label>
      <p className="text-muted-foreground">
        {todayOnly && `Back to ${STATUSES.find((s) => s.value === usual)!.label} tomorrow. `}
        Safety notices always get through.
      </p>
    </div>
  );
}
