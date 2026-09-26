"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { redirectDoneText, redirectLabel } from "@/lib/messages";
import type { DecisionKind, Drug, Purpose, RedirectAction } from "@/lib/types";
import { formatSlot } from "@/lib/week";

type SavedRep = { id: string | null; name: string; company: string; email: string };

type Answer = {
  requestId: string;
  decision: DecisionKind;
  slotAt: string | null;
  redirectAction: RedirectAction | null;
  message: string;
};

type Step = "who" | "what" | "answer";

const REP_KEY = "knock.rep";

function loadRep(): SavedRep | null {
  try {
    const saved = localStorage.getItem(REP_KEY);
    return saved ? (JSON.parse(saved) as SavedRep) : null;
  } catch {
    return null;
  }
}

function saveRep(rep: SavedRep | null) {
  try {
    if (rep) localStorage.setItem(REP_KEY, JSON.stringify(rep));
    else localStorage.removeItem(REP_KEY);
  } catch {
    // Private browsing: the rep just types their name again next time.
  }
}

const PURPOSES: { value: Purpose; label: string }[] = [
  { value: "visit", label: "Visit" },
  { value: "drop_samples", label: "Drop samples" },
  { value: "lunch", label: "Lunch" },
];

// Answer screen look, by decision. Status colors only.
const ANSWER_STYLES: Record<DecisionKind, { title: string; className: string }> = {
  accepted: { title: "You're in", className: "bg-status-open text-status-open-foreground" },
  redirected: {
    title: "Not a visit this time",
    className: "bg-status-topics text-status-topics-foreground",
  },
  declined: { title: "Not now", className: "bg-status-closed text-status-closed-foreground" },
};

type FlowProps = { officeId: string; officeName: string; drugs: Drug[] };

const EMPTY_REP: SavedRep = { id: null, name: "", company: "", email: "" };

const noSubscribe = () => () => {};

export function RequestFlow(props: FlowProps) {
  // False during the server render, true in the browser. The saved rep lives in
  // localStorage, so wait for the browser before picking the first screen.
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);

  if (!inBrowser) {
    return (
      <Screen>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </Screen>
    );
  }
  return <Flow {...props} />;
}

function Flow({ officeId, officeName, drugs }: FlowProps) {
  const [savedRep] = useState(loadRep);
  const [rep, setRep] = useState<SavedRep>(savedRep ?? EMPTY_REP);
  // Skip "who" when this phone has asked before.
  const [step, setStep] = useState<Step>(savedRep ? "what" : "who");

  const [drugId, setDrugId] = useState<string | null>(null);
  const [safetyNotice, setSafetyNotice] = useState(false);
  const [purpose, setPurpose] = useState<Purpose>("visit");

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [redirectState, setRedirectState] = useState<"idle" | "sending" | "done">("idle");

  function notYou() {
    saveRep(null);
    setRep(EMPTY_REP);
    setStep("who");
  }

  function startOver() {
    setDrugId(null);
    setSafetyNotice(false);
    setPurpose("visit");
    setAnswer(null);
    setRedirectState("idle");
    setStep("what");
  }

  async function ask() {
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          officeId,
          repId: rep.id,
          rep: { name: rep.name, company: rep.company, email: rep.email },
          drugId,
          purpose: safetyNotice ? "safety_notice" : purpose,
          source: "qr",
        }),
      });
      if (!response.ok) throw new Error();

      const result = await response.json();
      const savedRep = { ...rep, id: result.repId };
      setRep(savedRep);
      saveRep(savedRep);
      setAnswer(result);
      setStep("answer");
    } catch {
      setError("Couldn't reach the office. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function takeRedirect() {
    if (!answer) return;
    setRedirectState("sending");
    setError(null);
    try {
      const response = await fetch(`/api/requests/${answer.requestId}/take-redirect`, {
        method: "POST",
      });
      if (!response.ok) throw new Error();
      setRedirectState("done");
    } catch {
      setRedirectState("idle");
      setError("Couldn't reach the office. Please try again.");
    }
  }

  if (step === "who") {
    const canContinue = rep.name.trim() !== "" && rep.company.trim() !== "";
    return (
      <Screen>
        <header>
          <p className="text-muted-foreground">{officeName}</p>
          <h1 className="text-3xl font-semibold">Who&apos;s visiting?</h1>
        </header>

        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (canContinue) setStep("what");
          }}
        >
          <Field
            id="name"
            label="Your name"
            value={rep.name}
            autoComplete="name"
            onChange={(name) => setRep({ ...rep, name })}
          />
          <Field
            id="company"
            label="Company"
            value={rep.company}
            autoComplete="organization"
            onChange={(company) => setRep({ ...rep, company })}
          />
          <Field
            id="email"
            label="Email"
            type="email"
            value={rep.email}
            autoComplete="email"
            onChange={(email) => setRep({ ...rep, email })}
          />
          <Button type="submit" disabled={!canContinue} className="h-14 w-full text-lg">
            Continue
          </Button>
        </form>
      </Screen>
    );
  }

  if (step === "what") {
    const canAsk = (drugId !== null || safetyNotice) && !sending;
    return (
      <Screen>
        <header>
          <p className="text-muted-foreground">{officeName}</p>
          <h1 className="text-3xl font-semibold">What are you bringing?</h1>
          <p className="mt-2 text-muted-foreground">
            {rep.name}, {rep.company}.{" "}
            <button type="button" onClick={notYou} className="min-h-12 underline">
              Not you?
            </button>
          </p>
        </header>

        <div className="flex flex-col gap-3">
          {drugs.map((drug) => (
            <Chip
              key={drug.id}
              selected={drugId === drug.id}
              onClick={() => setDrugId(drug.id)}
              className="justify-between"
            >
              <span className="font-semibold">{drug.brand}</span>
              <span className="opacity-80">{drug.area}</span>
            </Chip>
          ))}
          <Chip
            selected={safetyNotice}
            onClick={() => setSafetyNotice(!safetyNotice)}
            className="justify-start"
          >
            <span className="font-semibold">Safety notice</span>
          </Chip>
        </div>

        {!safetyNotice && (
          <div className="flex flex-col gap-3">
            <p className="font-medium">Purpose</p>
            <div className="grid grid-cols-3 gap-2">
              {PURPOSES.map((option) => (
                <Chip
                  key={option.value}
                  selected={purpose === option.value}
                  onClick={() => setPurpose(option.value)}
                >
                  {option.label}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {error && <p role="alert">{error}</p>}

        <Button onClick={ask} disabled={!canAsk} className="h-14 w-full text-lg">
          {sending ? "Checking the sign..." : "Ask the office"}
        </Button>
      </Screen>
    );
  }

  // step === "answer"
  if (!answer) return null;
  const style = ANSWER_STYLES[answer.decision];
  const hasVisitSlot = answer.decision === "accepted" && answer.slotAt;

  return (
    <Screen className={style.className}>
      <p className="opacity-80">{officeName}</p>
      <h1 className="text-5xl font-semibold">{style.title}</h1>
      {hasVisitSlot && (
        <div>
          <p className="text-2xl font-medium">{formatSlot(answer.slotAt!)}</p>
          <p className="text-xl">5 minutes with the team</p>
        </div>
      )}
      <p className="text-xl">{answer.message}</p>

      {answer.redirectAction &&
        (redirectState === "done" ? (
          <p className="text-xl font-medium">
            {redirectDoneText(answer.redirectAction, answer.slotAt)}
          </p>
        ) : (
          <Button
            onClick={takeRedirect}
            disabled={redirectState === "sending"}
            className="h-auto min-h-14 w-full bg-background py-3 text-lg whitespace-normal text-foreground hover:bg-background/90"
          >
            {redirectLabel(answer.redirectAction, answer.slotAt)}
          </Button>
        ))}

      {error && <p role="alert">{error}</p>}

      <button type="button" onClick={startOver} className="min-h-12 self-start underline">
        Make another request
      </button>
    </Screen>
  );
}

// Every screen: content centered both ways, on phones and laptops.
function Screen({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <main className={`flex min-h-dvh w-full flex-1 items-center justify-center p-6 ${className}`}>
      <div className="flex w-full max-w-md flex-col gap-6">{children}</div>
    </main>
  );
}

function Field(props: {
  id: string;
  label: string;
  value: string;
  type?: string;
  autoComplete?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={props.id} className="text-lg">
        {props.label}
      </Label>
      <Input
        id={props.id}
        type={props.type ?? "text"}
        value={props.value}
        autoComplete={props.autoComplete}
        onChange={(event) => props.onChange(event.target.value)}
        className="h-12 text-lg md:text-lg"
      />
    </div>
  );
}

// A one-tap choice. Filled when selected.
function Chip({
  selected,
  onClick,
  className = "",
  children,
}: {
  selected: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={selected ? "default" : "outline"}
      aria-pressed={selected}
      onClick={onClick}
      className={`h-auto min-h-14 gap-3 px-4 py-3 text-lg whitespace-normal ${className}`}
    >
      {children}
    </Button>
  );
}
