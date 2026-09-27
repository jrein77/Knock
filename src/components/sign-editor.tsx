"use client";

import { EyeIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  QUESTION_FIELDS,
  SignQuestions,
  SignReview,
  type QuestionField,
  type QuestionValues,
} from "@/components/sign-questions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import type { LastChange, SignChange } from "@/lib/sign";
import { STATUS_STYLE } from "@/lib/status-style";
import type { Office, Status } from "@/lib/types";
import { useOfficePings } from "@/lib/use-office-pings";
import { VOICE_LABELS } from "@/lib/voice-questions";
import { formatWhen } from "@/lib/week";

type SignData = {
  office: Office & { effective_status: Status };
  brandBlocks: string[];
  lastChange: LastChange | null;
  areas: string[];
  companies: string[];
};

// Each status says what it does to reps, so nobody has to guess.
// `hint` is the longer version, shown on hover before anything changes.
const STATUSES: { value: Status; label: string; effect: string; hint: string }[] = [
  {
    value: "open",
    label: "Open",
    effect: "Any rep can ask for a visit.",
    hint: "Any rep can ask for a visit. Knock books them into your visit times, up to your weekly limit.",
  },
  {
    value: "topics",
    label: "Topics only",
    effect: "Only reps with a topic you want.",
    hint: "Only reps bringing a topic you listed get a visit. Everyone else is offered something else, like dropping off samples.",
  },
  {
    value: "closed",
    label: "Closed",
    effect: "No visits. Safety notices still get through.",
    hint: "No rep visits for now. Reps can still leave samples or materials, and safety notices always get through.",
  },
];

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

function valuesOf(data: SignData): QuestionValues {
  return {
    topics: data.office.topics,
    visitSlots: data.office.visit_slots,
    redirectOptions: data.office.redirect_options,
    weeklyCap: data.office.weekly_cap,
    blockedCompanies: data.brandBlocks,
  };
}

// The questions whose answers differ from the sign as it is now.
function changedFields(before: QuestionValues, after: QuestionValues): QuestionField[] {
  return QUESTION_FIELDS.filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
}

// How the office answers "do we take rep visits, and which ones?". Used on /sign and in the desk's
// "Rep visits" view. The status is one tap at the top. Everything else is a list of questions,
// answered out loud or by hand, then checked on one screen before it goes on the sign.
// `showName` is off on the desk, where the page header already shows the office name.
export function SignEditor({ officeId, showName = true }: { officeId: string; showName?: boolean }) {
  const [data, setData] = useState<SignData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // The answers being worked on. Starts as the sign as it is, and resets after each save.
  const [draft, setDraft] = useState<QuestionValues | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [round, setRound] = useState(0); // a fresh set of cards after each save

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/sign?officeId=${officeId}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const loaded: SignData = await response.json();
      setData(loaded);
      // Keep answers in progress if the sign changes elsewhere (e.g. from the desk).
      setDraft((current) => current ?? valuesOf(loaded));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [officeId]);

  // Reload whenever anything on this office changes, e.g. an edit from the desk.
  useOfficePings(officeId, load);

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
              startOver();
            },
          }
        : undefined,
    });
  }

  // Back to the sign as it is now: fresh cards, nothing changed.
  function startOver() {
    setDraft(null);
    setReviewing(false);
    setRound((current) => current + 1);
    load();
  }

  async function save(change: SignChange, summary: string) {
    const saved = await postJson("/api/sign", { officeId, change, summary });
    if (!saved) {
      toast.error("Couldn't save that change. Please try again.");
      return false;
    }
    showUndo(summary, saved.historyId);
    return true;
  }

  // A new status applies from now on, right away. It also clears any old "just today" override.
  async function setStatus(status: Status) {
    await save({ status, today_status: null, today_status_date: null }, STATUS_STYLE[status].label);
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
    startOver();
  }

  if (!data || !draft) {
    return loadFailed ? (
      <p>Couldn&apos;t load the sign. Check the connection and refresh.</p>
    ) : (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-80 w-full rounded-3xl" />
      </div>
    );
  }

  const { office, lastChange } = data;
  const changed = changedFields(valuesOf(data), draft);
  // The check screen shows once there's something to put on the sign.
  const showReview = reviewing && changed.length > 0;

  async function saveAnswers() {
    if (!draft) return;
    setSaving(true);
    const change: SignChange = {};
    if (changed.includes("topics")) change.topics = draft.topics;
    if (changed.includes("visitSlots")) change.visit_slots = draft.visitSlots;
    if (changed.includes("redirectOptions")) change.redirect_options = draft.redirectOptions;
    if (changed.includes("weeklyCap")) change.weekly_cap = draft.weeklyCap;
    if (changed.includes("blockedCompanies")) change.brand_blocks = draft.blockedCompanies;
    const saved = await save(change, `Changed ${changed.map((field) => VOICE_LABELS[field]).join(", ")}`);
    setSaving(false);
    if (saved) startOver();
  }

  return (
    <div className="flex flex-col gap-6">
      {showName && <h1 className="text-2xl font-semibold">{office.name}</h1>}

      {/* Status: one tap, from now on, with Undo. Hidden on the check screen, which is only
          about the answers being changed (Go back brings it back). */}
      <section
        className={`flex-col gap-4 rounded-3xl bg-card p-5 shadow-lg ring-1 ring-foreground/10 ${
          showReview ? "hidden" : "flex"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h2 className="text-xl font-semibold">Taking rep visits?</h2>
          <span className="flex items-center gap-1.5 text-base text-muted-foreground">
            <EyeIcon className="size-4" />
            Reps see this
          </span>
        </div>
        <StatusPicker current={office.effective_status} onPick={setStatus} />
      </section>

      {showReview && (
        <SignReview
          sign={{
            name: office.name,
            neighborhood: office.neighborhood,
            specialty: office.specialty,
            status: office.effective_status,
            topicsNote: office.topics_note,
          }}
          values={draft}
          changed={changed}
          saving={saving}
          saveLabel="Put this on my sign"
          onSave={saveAnswers}
          onBack={() => setReviewing(false)}
        />
      )}

      {/* Hidden, not removed, while reviewing, so Go back returns to the same cards. */}
      <div className={showReview ? "hidden" : "flex flex-col gap-4"}>
        <SignQuestions
          key={round}
          values={draft}
          onChange={(field, value) => setDraft((current) => (current ? { ...current, [field]: value } : current))}
          areas={data.areas}
          companies={data.companies}
          specialty={office.specialty}
          onFinished={() => setReviewing(true)}
        />
        {changed.length > 0 && (
          <div className="flex flex-col gap-2">
            <Button onClick={() => setReviewing(true)} className="h-14 text-lg">
              Review {changed.length === 1 ? "1 change" : `${changed.length} changes`}
            </Button>
            <Button variant="ghost" onClick={startOver} className="h-12 text-lg">
              Leave my sign as it is
            </Button>
          </div>
        )}
      </div>

      {lastChange && !showReview && (
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
            <Tooltip
              key={status.value}
              trigger={
                <Button
                  variant="outline"
                  aria-pressed={isNow}
                  onClick={() => !isNow && onPick(status.value)}
                  className={`h-14 px-1 text-base font-semibold whitespace-nowrap sm:text-lg ${
                    isNow ? STATUS_STYLE[status.value].className : ""
                  }`}
                >
                  {status.label}
                </Button>
              }
            >
              {status.hint}
            </Tooltip>
          );
        })}
      </div>
      <p>{effect}</p>
    </div>
  );
}
