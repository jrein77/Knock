"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { DrugTiles } from "@/components/drug-tiles";
import { LeaveNote } from "@/components/leave-note";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { redirectDoneText, redirectLabel } from "@/lib/messages";
import { EMPTY_REP, loadRep, saveRep, type SavedRep } from "@/lib/rep-storage";
import { ANSWER_TITLE, DECISION_STYLE, STATUS_STYLE } from "@/lib/status-style";
import { supabase } from "@/lib/supabase/browser";
import type { DecisionKind, Drug, RedirectAction, VisitSlot } from "@/lib/types";
import { currentSlots, formatSlotLine, formatVisit, sortSlots } from "@/lib/week";

type Fit = "green" | "amber" | "grey";

type FitOffice = {
  id: string;
  name: string;
  neighborhood: string | null;
  specialty: string | null;
  topics: string[];
  visitSlots: VisitSlot[];
  fit: Fit;
  reason: string;
  drugId: string;
};

type Answer = {
  requestId: string;
  decision: DecisionKind;
  slotAt: string | null;
  slotEnd: string | null;
  redirectAction: RedirectAction | null;
  message: string;
};

// Fit colors are the status colors: green = go, amber = maybe, grey = not now.
const FIT_STYLE: Record<Fit, string> = {
  green: STATUS_STYLE.open.className,
  amber: STATUS_STYLE.topics.className,
  grey: STATUS_STYLE.closed.className,
};

const noSubscribe = () => () => {};

export function FitList({ drugs }: { drugs: Drug[] }) {
  // The saved rep lives in localStorage, so wait for the browser (see the QR flow).
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);
  if (!inBrowser) {
    return (
      <Screen>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-80 w-full rounded-3xl" />
      </Screen>
    );
  }
  return <FitListInBrowser drugs={drugs} />;
}

function FitListInBrowser({ drugs }: { drugs: Drug[] }) {
  const [rep, setRep] = useState<SavedRep>(() => loadRep() ?? EMPTY_REP);
  const [editing, setEditing] = useState(() => !(rep.company && rep.drugIds?.length));

  if (editing) {
    return (
      <RepSetup
        drugs={drugs}
        initial={rep}
        onDone={(updated) => {
          saveRep(updated);
          setRep(updated);
          setEditing(false);
        }}
      />
    );
  }
  return <Offices rep={rep} setRep={setRep} drugs={drugs} onChange={() => setEditing(true)} />;
}

// Picked once, on two short screens: who you are, then what you carry.
function RepSetup({
  drugs,
  initial,
  onDone,
}: {
  drugs: Drug[];
  initial: SavedRep;
  onDone: (rep: SavedRep) => void;
}) {
  const [rep, setRep] = useState(initial);
  const [screen, setScreen] = useState<"who" | "drugs">(
    initial.name && initial.company ? "drugs" : "who"
  );
  const drugIds = rep.drugIds ?? [];

  function toggleDrug(id: string) {
    setRep({
      ...rep,
      drugIds: drugIds.includes(id) ? drugIds.filter((d) => d !== id) : [...drugIds, id],
    });
  }

  if (screen === "who") {
    const canContinue = rep.name.trim() !== "" && rep.company.trim() !== "";
    return (
      <Screen>
        <header>
          <h1 className="text-3xl font-semibold">Know before you go</h1>
          <p className="text-muted-foreground">See which offices want what you carry.</p>
        </header>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (canContinue) setScreen("drugs");
          }}
        >
          <Field id="name" label="Your name" value={rep.name} onChange={(name) => setRep({ ...rep, name })} />
          <Field
            id="company"
            label="Company"
            value={rep.company}
            onChange={(company) => setRep({ ...rep, company })}
          />
          <Field
            id="email"
            label="Email"
            type="email"
            value={rep.email}
            onChange={(email) => setRep({ ...rep, email })}
          />
          <Button type="submit" disabled={!canContinue} className="h-14 w-full text-lg">
            Continue
          </Button>
        </form>
      </Screen>
    );
  }

  return (
    <Screen>
      <header>
        <h1 className="text-3xl font-semibold">What do you carry?</h1>
        <p className="text-muted-foreground">
          {rep.name}, {rep.company}.{" "}
          <button type="button" onClick={() => setScreen("who")} className="min-h-12 underline">
            Change
          </button>
        </p>
      </header>
      <DrugTiles drugs={drugs} selected={drugIds} onToggle={toggleDrug} />
      <Button onClick={() => onDone(rep)} disabled={drugIds.length === 0} className="h-14 w-full text-lg">
        Show my offices
      </Button>
    </Screen>
  );
}

function Offices({
  rep,
  setRep,
  drugs,
  onChange,
}: {
  rep: SavedRep;
  setRep: (rep: SavedRep) => void;
  drugs: Drug[];
  onChange: () => void;
}) {
  const [offices, setOffices] = useState<FitOffice[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const drugIds = (rep.drugIds ?? []).join(",");

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ company: rep.company, drugs: drugIds });
      const response = await fetch(`/api/fit?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      setOffices((await response.json()).offices);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [rep.company, drugIds]);

  // Door Signs are public, so the phone can listen for sign changes directly.
  useEffect(() => {
    const channel = supabase
      .channel("fit-list-offices")
      .on("postgres_changes", { event: "*", schema: "public", table: "offices" }, () => load())
      .subscribe((status) => {
        if (status !== "CLOSED") load();
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const carrying = drugs
    .filter((drug) => rep.drugIds?.includes(drug.id))
    .map((drug) => drug.brand)
    .join(", ");
  const worthIt = offices?.filter((office) => office.fit !== "grey") ?? [];
  const notNow = offices?.filter((office) => office.fit === "grey") ?? [];

  return (
    <Screen>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">Your offices</h1>
        <p className="text-muted-foreground">
          {rep.name}, {rep.company} · {carrying}.{" "}
          <button type="button" onClick={onChange} className="min-h-12 underline">
            Change
          </button>
        </p>
      </header>

      {!offices &&
        (loadFailed ? (
          <p>Couldn&apos;t load offices. Check the connection and try again.</p>
        ) : (
          <>
            <Skeleton className="h-80 w-full rounded-3xl" />
            <Skeleton className="h-80 w-full rounded-3xl" />
          </>
        ))}

      {worthIt.map((office) => (
        <OfficeCard key={office.id} office={office} rep={rep} setRep={setRep} onAsked={load} />
      ))}

      {/* Grey offices stay collapsed at the bottom. */}
      {notNow.length > 0 && (
        <details className="rounded-2xl bg-muted px-5 py-3">
          <summary className="min-h-12 cursor-pointer py-2 text-lg font-medium">
            Not taking visits right now ({notNow.length})
          </summary>
          <ul className="flex flex-col gap-3 pt-2 pb-2">
            {notNow.map((office) => (
              <li key={office.id}>
                <p className="font-medium">{office.name}</p>
                <p className="text-muted-foreground">{office.reason}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Screen>
  );
}

// One office: why it fits, its Door Sign, and a request button.
function OfficeCard({
  office,
  rep,
  setRep,
  onAsked,
}: {
  office: FitOffice;
  rep: SavedRep;
  setRep: (rep: SavedRep) => void;
  onAsked: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [redirectState, setRedirectState] = useState<"idle" | "sending" | "done">("idle");

  async function requestVisit() {
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          officeId: office.id,
          repId: rep.id,
          rep: { name: rep.name, company: rep.company, email: rep.email },
          drugId: office.drugId,
          purpose: "visit",
          source: "fit_list",
        }),
      });
      if (!response.ok) throw new Error();
      const result = await response.json();
      const savedRep = { ...rep, id: result.repId };
      saveRep(savedRep);
      setRep(savedRep);
      setAnswer(result);
      onAsked();
    } catch {
      setError("Couldn't reach the office. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function takeRedirect() {
    if (!answer) return;
    setRedirectState("sending");
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

  return (
    <article className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-foreground/10">
        <p className={`px-5 py-3 text-lg font-medium ${FIT_STYLE[office.fit]}`}>{office.reason}</p>
        <div className="flex flex-col gap-2 px-5 py-4">
          <div>
            <h2 className="text-xl font-semibold">{office.name}</h2>
            <p className="text-muted-foreground">
              {[office.specialty, office.neighborhood].filter(Boolean).join(" · ")}
            </p>
          </div>
          <p>
            <span className="text-muted-foreground">Wants </span>
            {office.topics.length > 0 ? office.topics.join(", ") : "no specific topics"}
          </p>
          <p>
            <span className="text-muted-foreground">Visits </span>
            {visitTimes(office.visitSlots)}
          </p>
        </div>
      </div>

      {answer ? (
        <div
          className={`flex flex-col gap-3 rounded-2xl px-5 py-4 ${DECISION_STYLE[answer.decision].className}`}
        >
          <p className="text-2xl font-semibold">{ANSWER_TITLE[answer.decision]}</p>
          {answer.decision === "accepted" && answer.slotAt && (
            <p className="text-xl font-medium">
              {formatVisit(answer.slotAt, answer.slotEnd)}, 5 minutes with the team
            </p>
          )}
          <p className="text-lg">{answer.message}</p>
          {answer.redirectAction &&
            (redirectState === "done" ? (
              <p className="text-lg font-medium">
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
          <LeaveNote requestId={answer.requestId} />
        </div>
      ) : (
        <Button onClick={requestVisit} disabled={sending} className="h-14 w-full text-lg">
          {sending ? "Asking..." : "Request a visit"}
        </Button>
      )}

      {error && <p role="alert">{error}</p>}
    </article>
  );
}

function visitTimes(slots: VisitSlot[]): string {
  const current = sortSlots(currentSlots(slots, new Date()));
  return current.length > 0 ? current.map(formatSlotLine).join(" · ") : "none posted";
}

// Every screen: content centered, phone-width column.
function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh w-full flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col gap-6">{children}</div>
    </main>
  );
}

function Field(props: {
  id: string;
  label: string;
  value: string;
  type?: string;
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
        onChange={(event) => props.onChange(event.target.value)}
        className="h-12 text-lg md:text-lg"
      />
    </div>
  );
}
