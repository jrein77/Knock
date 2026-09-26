"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DoorSign } from "@/components/door-sign";
import { CapStepper, ChoicePicker, SlotsPicker } from "@/components/sign-line-editors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { SignChange } from "@/lib/sign";
import { REDIRECT_OPTION_LABELS, STATUS_STYLE } from "@/lib/status-style";
import type { Office, RedirectAction, Status, VisitSlot } from "@/lib/types";

// Everything setup asks about. It starts as the current sign and is saved in one go.
type Draft = {
  npi: string;
  name: string;
  specialty: string;
  address: string;
  status: Status;
  topics: string[];
  topicsNote: string;
  visitSlots: VisitSlot[];
  weeklyCap: number;
  redirectOptions: RedirectAction[];
};

const STEPS = ["who", "status", "topics", "visits", "cap", "redirects", "review"] as const;
type Step = (typeof STEPS)[number];

const STEP_TITLES: Record<Step, string> = {
  who: "Who are you?",
  status: "Are you taking rep visits?",
  topics: "Which topics do you want to hear about?",
  visits: "When can reps visit?",
  cap: "How many rep visits a week, at most?",
  redirects: "What can reps do instead of a visit?",
  review: "Here's your Door Sign",
};

// Small grey line under a question, where it helps.
const STEP_HINTS: Partial<Record<Step, string>> = {
  status: "You can change this anytime.",
  cap: "Private. Reps never see this number.",
};

const STATUSES: { value: Status; label: string }[] = [
  { value: "open", label: "Open to all reps" },
  { value: "topics", label: "Only for topics we want" },
  { value: "closed", label: "Not right now" },
];

// The chosen status takes its color, and keeps it under the mouse.
const SELECTED_STATUS: Record<Status, string> = {
  open: `${STATUS_STYLE.open.className} hover:bg-status-open/90 hover:text-status-open-foreground`,
  topics: `${STATUS_STYLE.topics.className} hover:bg-status-topics/90 hover:text-status-topics-foreground`,
  closed: `${STATUS_STYLE.closed.className} hover:bg-status-closed/90 hover:text-status-closed-foreground`,
};

export function SetupFlow({ officeId }: { officeId: string }) {
  const router = useRouter();
  const [office, setOffice] = useState<Office | null>(null);
  const [areas, setAreas] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  // Start from the office's current sign, once.
  useEffect(() => {
    fetch(`/api/sign?officeId=${officeId}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { office: Office; areas: string[] }) => {
        const current = data.office;
        setOffice(current);
        setAreas(data.areas);
        setDraft({
          npi: current.npi ?? "",
          name: current.name,
          specialty: current.specialty ?? "",
          address: current.address ?? "",
          status: current.status,
          topics: current.topics,
          topicsNote: current.topics_note ?? "",
          visitSlots: current.visit_slots,
          weeklyCap: current.weekly_cap,
          redirectOptions: current.redirect_options,
        });
      })
      .catch(() => toast.error("Couldn't load your sign. Please refresh."));
  }, [officeId]);

  if (!office || !draft) {
    return (
      <Frame>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 w-full rounded-3xl" />
      </Frame>
    );
  }

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const update = (fields: Partial<Draft>) => setDraft({ ...draft, ...fields });

  async function save() {
    if (!draft) return;
    setSaving(true);
    const change: SignChange = {
      name: draft.name.trim(),
      specialty: draft.specialty.trim() || null,
      address: draft.address.trim() || null,
      npi: draft.npi.trim() || null,
      status: draft.status,
      // A new status from setup applies right away, so clear any "just today" override.
      today_status: null,
      today_status_date: null,
      topics: draft.topics,
      topics_note: draft.topicsNote.trim() || null,
      visit_slots: draft.visitSlots,
      weekly_cap: draft.weeklyCap,
      redirect_options: draft.redirectOptions,
    };
    try {
      const response = await fetch("/api/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officeId, change, summary: "Set up the sign again" }),
      });
      if (!response.ok) throw new Error();
      const { historyId } = await response.json();

      // Undo, never confirm.
      toast("Your Door Sign is saved", {
        duration: 10_000,
        action: {
          label: "Undo",
          onClick: () => {
            fetch("/api/sign/restore", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ historyId, mode: "undo" }),
            });
          },
        },
      });
      router.push("/sign");
    } catch {
      toast.error("Couldn't save your sign. Please try again.");
      setSaving(false);
    }
  }

  return (
    <Frame>
      <header className="flex flex-col gap-3">
        <p className="text-muted-foreground">
          Step {stepIndex + 1} of {STEPS.length}
        </p>
        <Progress value={((stepIndex + 1) / STEPS.length) * 100} />
        <h1 className="text-3xl font-semibold">{STEP_TITLES[step]}</h1>
        {STEP_HINTS[step] && <p className="text-muted-foreground">{STEP_HINTS[step]}</p>}
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section className="flex flex-col gap-5">
          {step === "who" && <WhoStep draft={draft} update={update} />}

          {step === "status" && (
            <div className="flex flex-col gap-3">
              {STATUSES.map((option) => {
                const selected = draft.status === option.value;
                return (
                  <Button
                    key={option.value}
                    variant="outline"
                    aria-pressed={selected}
                    onClick={() => update({ status: option.value })}
                    className={`h-16 justify-start px-5 text-lg ${selected ? SELECTED_STATUS[option.value] : ""}`}
                  >
                    {option.label}
                  </Button>
                );
              })}
            </div>
          )}

          {step === "topics" && (
            <>
              <ChoicePicker
                options={[...new Set([...areas, ...draft.topics])].map((area) => ({
                  value: area,
                  label: area,
                }))}
                value={draft.topics}
                onChange={(topics) => update({ topics })}
                allowNew={{ label: "Add a topic" }}
              />
              <div className="flex flex-col gap-2">
                <Label htmlFor="topics-note" className="text-lg">
                  Anything else reps should know? (optional)
                </Label>
                <Textarea
                  id="topics-note"
                  value={draft.topicsNote}
                  maxLength={280}
                  onChange={(event) => update({ topicsNote: event.target.value })}
                  className="min-h-24 text-lg md:text-lg"
                />
              </div>
            </>
          )}

          {step === "visits" && (
            <SlotsPicker value={draft.visitSlots} onChange={(visitSlots) => update({ visitSlots })} />
          )}

          {step === "cap" && (
            <CapStepper value={draft.weeklyCap} onChange={(weeklyCap) => update({ weeklyCap })} />
          )}

          {step === "redirects" && (
            <ChoicePicker<RedirectAction>
              options={(Object.keys(REDIRECT_OPTION_LABELS) as RedirectAction[]).map((option) => ({
                value: option,
                label: REDIRECT_OPTION_LABELS[option],
              }))}
              value={draft.redirectOptions}
              onChange={(redirectOptions) => update({ redirectOptions })}
            />
          )}

          {step === "review" && (
            <p>
              Check the sign. It takes effect on the very next request, and you can undo it right
              after saving.
            </p>
          )}

          <div className="flex gap-3 pt-2">
            {stepIndex > 0 && (
              <Button
                variant="outline"
                onClick={() => setStepIndex(stepIndex - 1)}
                className="h-14 flex-1 text-lg"
              >
                Back
              </Button>
            )}
            {isLast ? (
              <Button onClick={save} disabled={saving} className="h-14 flex-1 text-lg">
                {saving ? "Saving..." : "Save my sign"}
              </Button>
            ) : (
              <Button
                onClick={() => setStepIndex(stepIndex + 1)}
                disabled={step === "who" && draft.name.trim() === ""}
                className="h-14 flex-1 text-lg"
              >
                Next
              </Button>
            )}
          </div>
        </section>

        {/* Live preview, beside the question on a laptop and below it on a phone. */}
        <aside className="flex flex-col gap-3">
          <p className="text-center text-muted-foreground">This is what reps see.</p>
          <DoorSign
            name={draft.name || "Your office"}
            neighborhood={office.neighborhood}
            specialty={draft.specialty || null}
            status={draft.status}
            todayOnly={false}
            topics={draft.topics}
            topicsNote={draft.topicsNote || null}
            visitSlots={draft.visitSlots}
            redirectOptions={draft.redirectOptions}
          />
        </aside>
      </div>
    </Frame>
  );
}

// Step 1: optional NPI lookup that pre-fills name, specialty and address. The doctor confirms.
function WhoStep({ draft, update }: { draft: Draft; update: (fields: Partial<Draft>) => void }) {
  const [lookup, setLookup] = useState<"idle" | "looking" | "found">("idle");
  const [lookupError, setLookupError] = useState<string | null>(null);

  async function lookUp() {
    setLookup("looking");
    setLookupError(null);
    try {
      const response = await fetch(`/api/npi?number=${encodeURIComponent(draft.npi.trim())}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      update({
        npi: result.npi,
        name: result.name || draft.name,
        specialty: result.specialty ?? draft.specialty,
        address: result.address ?? draft.address,
      });
      setLookup("found");
    } catch (error) {
      setLookup("idle");
      setLookupError((error as Error).message || "Couldn't look that up. You can type it in.");
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="npi" className="text-lg">
          NPI number (optional)
        </Label>
        <div className="flex gap-2">
          <Input
            id="npi"
            inputMode="numeric"
            value={draft.npi}
            maxLength={10}
            onChange={(event) => update({ npi: event.target.value.replace(/\D/g, "") })}
            className="h-12 text-lg md:text-lg"
          />
          <Button
            onClick={lookUp}
            disabled={draft.npi.length !== 10 || lookup === "looking"}
            className="h-12 px-5 text-lg"
          >
            {lookup === "looking" ? "Looking..." : "Look up"}
          </Button>
        </div>
        {lookup === "found" && <p>Found it. Check the details below.</p>}
        {lookupError && <p role="alert">{lookupError}</p>}
      </div>

      <TextField id="name" label="Office name" value={draft.name} onChange={(name) => update({ name })} />
      <TextField
        id="specialty"
        label="Specialty"
        value={draft.specialty}
        onChange={(specialty) => update({ specialty })}
      />
      <TextField
        id="address"
        label="Address"
        value={draft.address}
        onChange={(address) => update({ address })}
      />
    </>
  );
}

function TextField(props: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={props.id} className="text-lg">
        {props.label}
      </Label>
      <Input
        id={props.id}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="h-12 text-lg md:text-lg"
      />
    </div>
  );
}

// Page frame: centered, wide enough for the question and the preview side by side.
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh w-full flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-5xl flex-col gap-6">{children}</div>
    </main>
  );
}
