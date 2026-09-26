"use client";

import { EyeIcon, LockIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { SignLine } from "@/components/door-sign";
import { CapEditor, ChoiceEditor, SlotsEditor } from "@/components/sign-line-editors";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { VoiceInterview } from "@/components/voice-interview";
import type { LastChange, SignChange } from "@/lib/sign";
import { REDIRECT_OPTION_LABELS, STATUS_STYLE } from "@/lib/status-style";
import type { Office, RedirectAction, Status, VisitSlot } from "@/lib/types";
import { useOfficePings } from "@/lib/use-office-pings";
import { describeAnswer, type VoiceAnswer, type VoiceField } from "@/lib/voice-questions";
import { formatDate, formatSlotLine, formatWhen, sortSlots, weeklyOccurrences } from "@/lib/week";

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
  { value: "topics", label: "Topics only", effect: "Only reps with a topic you want." },
  { value: "closed", label: "Closed", effect: "No visits. Safety notices still get through." },
];

// Talk mode on /sign asks these, in this order.
const VOICE_FIELDS: VoiceField[] = [
  "status",
  "topics",
  "visitSlots",
  "redirectOptions",
  "weeklyCap",
  "blockedCompanies",
];
const VOICE_LABELS: Record<VoiceField, string> = {
  status: "Status",
  topics: "Topics",
  visitSlots: "Visit times",
  redirectOptions: "Instead of a visit",
  weeklyCap: "Weekly limit",
  blockedCompanies: "Blocked companies",
};

// Everything the office sets besides the status. Each has its own editor.
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
// "Rep visits" view. Two sections: what reps see, and what only the office sees.
// `showName` is off on the desk, where the page header already shows the office name.
export function SignEditor({ officeId, showName = true }: { officeId: string; showName?: boolean }) {
  const [data, setData] = useState<SignData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editing, setEditing] = useState<Question | null>(null);
  // Talk mode: "asking" while the questions are asked out loud, then "review" to check the answers.
  const [talk, setTalk] = useState<"off" | "asking" | "review">("off");
  const [heard, setHeard] = useState<Partial<VoiceAnswer>>({});

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

  // A new status applies from now on. It also clears any old "just today" override
  // so it takes effect right away.
  function setStatus(status: Status) {
    save({ status, today_status: null, today_status_date: null }, STATUS_STYLE[status].label);
  }

  function startTalk() {
    setEditing(null);
    setHeard({});
    setTalk("asking");
  }

  // Put every answer from Talk mode on the sign as one change, with Undo.
  function saveHeard() {
    const change: SignChange = {};
    if (heard.status) Object.assign(change, { status: heard.status, today_status: null, today_status_date: null });
    if (heard.topics) change.topics = heard.topics;
    if (heard.visitSlots) change.visit_slots = heard.visitSlots;
    if (heard.redirectOptions) change.redirect_options = heard.redirectOptions;
    if (heard.weeklyCap !== undefined) change.weekly_cap = heard.weeklyCap;
    if (heard.blockedCompanies) change.brand_blocks = heard.blockedCompanies;
    const names = VOICE_FIELDS.filter((field) => heard[field] !== undefined).map((field) => VOICE_LABELS[field]);
    setTalk("off");
    save(change, `Changed out loud: ${names.join(", ")}`);
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

  function renderEditor(question: Question) {
    const close = () => setEditing(null);
    switch (question) {
      case "topics":
        return (
          <ChoiceEditor
            options={[...new Set([...data!.areas, ...office.topics])].map((area) => ({
              value: area,
              label: area,
            }))}
            selected={office.topics}
            allowNew={{ label: "Add topic" }}
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

  // One setting: a short label, then today's answer with a Change button.
  // Change swaps the answer for its editor right there on the card, under the same label.
  function setting(key: Question, label: string, answer: string) {
    return (
      <div className="flex flex-col">
        <span className="text-base text-muted-foreground">{label}</span>
        {editing === key ? (
          <div data-open-editor className="pt-2">
            {renderEditor(key)}
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <span className="pt-2.5">{answer}</span>
            <Button
              variant="ghost"
              onClick={() => setEditing(key)}
              className="h-12 shrink-0 px-3 text-lg underline underline-offset-4"
            >
              Change
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {showName && <h1 className="text-2xl font-semibold">{office.name}</h1>}

      {/* Talk mode: answer the questions out loud instead of tapping through the settings. */}
      {talk === "off" && (
        <Button variant="outline" onClick={startTalk} className="h-14 text-lg">
          Answer out loud
        </Button>
      )}
      {talk === "asking" && (
        <div className="flex flex-col gap-2">
          <VoiceInterview
            fields={VOICE_FIELDS}
            onAnswer={(field, answer) => setHeard((current) => ({ ...current, [field]: answer }))}
            onDone={() => setTalk("review")}
          />
          <Button variant="ghost" onClick={() => setTalk("review")} className="h-12 text-lg">
            Done answering
          </Button>
        </div>
      )}
      {talk === "review" && (
        <div className="flex flex-col gap-3 rounded-2xl border p-5">
          {Object.keys(heard).length === 0 ? (
            <p>No answers to put on your sign.</p>
          ) : (
            <>
              <p className="font-medium">Here&apos;s what you said:</p>
              <ul className="flex flex-col gap-1">
                {VOICE_FIELDS.filter((field) => heard[field] !== undefined).map((field) => (
                  <li key={field}>
                    <span className="text-muted-foreground">{VOICE_LABELS[field]}:</span>{" "}
                    {describeAnswer(field, heard[field] as VoiceAnswer[typeof field])}
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Object.keys(heard).length > 0 && (
              <Button onClick={saveHeard} className="h-12 text-lg">
                Put these on my sign
              </Button>
            )}
            <Button variant="outline" onClick={() => setTalk("off")} className="h-12 text-lg">
              {Object.keys(heard).length > 0 ? "Leave my sign as it is" : "Close"}
            </Button>
          </div>
        </div>
      )}

      {/* Public: this is the Door Sign reps check before they come. */}
      <section className="flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-lg ring-1 ring-foreground/10">
        <SectionHeading icon={<EyeIcon className="size-5" />} title="Reps see this" />
        <StatusPicker current={office.effective_status} onPick={setStatus} />
        <div className="flex flex-col gap-4 pt-2">
          {setting("topics", "Topics", office.topics.length > 0 ? office.topics.join(", ") : "No specific topics")}
          {setting(
            "slots",
            "Visit times",
            visitTimesAnswer(office.visit_slots)
          )}
          {setting(
            "redirects",
            "Instead of a visit",
            office.redirect_options.length > 0
              ? office.redirect_options.map((option) => REDIRECT_OPTION_LABELS[option]).join(", ")
              : "Nothing"
          )}
        </div>
      </section>

      {/* Private: Knock uses these to decide, but never shows them to a rep. */}
      <section className="flex flex-col gap-4 rounded-3xl bg-muted/60 p-5">
        <SectionHeading icon={<LockIcon className="size-5" />} title="Only your office sees this" />
        <div className="flex flex-col gap-4">
          {setting(
            "cap",
            "Weekly limit",
            office.weekly_cap === 1 ? "1 visit" : `${office.weekly_cap} visits`
          )}
          {setting("blocks", "Blocked companies", brandBlocks.length > 0 ? brandBlocks.join(", ") : "None")}
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

// "Tue 12:30 PM · Thu 12:30 PM. Skipping Thu Oct 1.": the weekly pattern, then any dates skipped soon.
function visitTimesAnswer(slots: VisitSlot[]): string {
  if (slots.length === 0) return "None";
  const pattern = sortSlots(slots).map(formatSlotLine).join(" · ");
  const skipped = [
    ...new Set(
      weeklyOccurrences(slots, new Date())
        .filter((occurrence) => occurrence.skipped)
        .map((occurrence) => formatDate(occurrence.date))
    ),
  ];
  return skipped.length > 0 ? `${pattern}. Skipping ${skipped.join(", ")}.` : pattern;
}

// "Reps see this" / "Only your office sees this": who can see a section, in words and an icon.
function SectionHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h2 className="flex items-center gap-2 text-xl font-semibold">
      {icon}
      {title}
    </h2>
  );
}

// The three statuses side by side. The current one wears its status color, and one line under them
// says what it means for reps. One tap changes it (with Undo).
function StatusPicker({ current, onPick }: { current: Status; onPick: (status: Status) => void }) {
  const effect = STATUSES.find((s) => s.value === current)!.effect;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {STATUSES.map((status) => {
          const isNow = current === status.value;
          return (
            <Button
              key={status.value}
              variant="outline"
              aria-pressed={isNow}
              onClick={() => !isNow && onPick(status.value)}
              className={`h-14 px-1 text-base font-semibold whitespace-nowrap sm:text-lg ${
                isNow ? STATUS_STYLE[status.value].className : ""
              }`}
            >
              {status.label}
            </Button>
          );
        })}
      </div>
      <p>{effect}</p>
    </div>
  );
}
