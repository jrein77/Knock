"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { DrugTiles } from "@/components/drug-tiles";
import { LeaveNote } from "@/components/leave-note";
import { SearchIcon } from "lucide-react";
import { toast } from "sonner";
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
  reason: string; // one short line: next visit, or why not
  drugId: string;
  drugBrand: string;
  times: { start: string; end: string | null }[]; // good fits: this week's visit times to tap
  distanceMiles: number | null; // null without the rep's location
};

// One of the rep's own upcoming visits.
type MyVisit = { id: string; slotAt: string; officeName: string };

// A rep can't be in two places at once: times this close to a booked visit are greyed out.
const CONFLICT_MINUTES = 30;

function clashingVisit(start: string, visits: MyVisit[]): MyVisit | undefined {
  const time = new Date(start).getTime();
  return visits.find(
    (visit) => Math.abs(new Date(visit.slotAt).getTime() - time) < CONFLICT_MINUTES * 60 * 1000
  );
}

// Offices farther than this collapse into "Farther away".
const NEARBY_MILES = 10;

type Here = { lat: number; lng: number };

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

// Picked once, on two short screens: who you are, then your products.
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
          <p className="text-muted-foreground">See which offices want to hear about your products.</p>
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
        <h1 className="text-3xl font-semibold">Your products</h1>
        <p className="text-muted-foreground">
          Pick the drugs you&apos;re promoting. {rep.name}, {rep.company}.{" "}
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
  const [myVisits, setMyVisits] = useState<MyVisit[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null); // one open row at a time
  const [search, setSearch] = useState("");
  const [here, setHere] = useState<Here | null>(null);
  const [locating, setLocating] = useState<"asking" | "found" | "unavailable">(() =>
    "geolocation" in navigator ? "asking" : "unavailable"
  );
  const drugIds = (rep.drugIds ?? []).join(",");

  // Where is the rep? Only used to sort offices by distance, never stored.
  const askForLocation = useCallback(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setHere({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocating("found");
      },
      () => setLocating("unavailable"),
      { timeout: 8000, maximumAge: 5 * 60 * 1000 }
    );
  }, []);
  useEffect(askForLocation, [askForLocation]); // once, when the list opens

  // "Use my location" after a first no.
  function locate() {
    setLocating("asking");
    askForLocation();
  }

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ company: rep.company, drugs: drugIds });
      if (here) {
        params.set("lat", String(here.lat));
        params.set("lng", String(here.lng));
      }
      if (rep.id) params.set("repId", rep.id);
      const response = await fetch(`/api/fit?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setOffices(data.offices);
      setMyVisits(data.myVisits ?? []);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [rep.company, rep.id, drugIds, here]);

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

  const myDrugs = drugs.filter((drug) => rep.drugIds?.includes(drug.id));
  const productsText = myDrugs.length === 1 ? myDrugs[0].brand : "your products";

  // Saved offices sit at the top, apart from the rest.
  const savedIds = rep.savedOfficeIds ?? [];
  function toggleSaved(officeId: string) {
    const next = savedIds.includes(officeId)
      ? savedIds.filter((id) => id !== officeId)
      : [...savedIds, officeId];
    const updated = { ...rep, savedOfficeIds: next };
    saveRep(updated);
    setRep(updated);
  }

  // Searching shows one list of matches: by office, neighborhood, specialty, or topic.
  const query = search.trim().toLowerCase();
  const matches = (offices ?? []).filter((office) =>
    [office.name, office.neighborhood, office.specialty, ...office.topics].some((field) =>
      field?.toLowerCase().includes(query)
    )
  );

  // Otherwise: saved first, then nearby offices by fit; far ones collapse at the bottom.
  const saved = (offices ?? []).filter((office) => savedIds.includes(office.id));
  const all = (offices ?? []).filter((office) => !savedIds.includes(office.id));
  const isFar = (office: FitOffice) => office.distanceMiles !== null && office.distanceMiles > NEARBY_MILES;
  const nearby = all.filter((office) => !isFar(office));
  const goodFits = nearby.filter((office) => office.fit === "green");
  const maybes = nearby.filter((office) => office.fit === "amber");
  const notNow = nearby.filter((office) => office.fit === "grey");
  const farAway = all.filter(isFar);

  // Cancel one of the rep's visits, with Undo.
  async function cancelVisit(visit: MyVisit, undo = false) {
    const response = await fetch(`/api/requests/${visit.id}/rep-cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repId: rep.id, undo }),
    });
    if (!response.ok) {
      toast.error("Couldn't reach the office. Please try again.");
      return;
    }
    load();
    if (!undo) {
      toast(`Canceled your visit at ${visit.officeName}`, {
        duration: 10_000,
        action: { label: "Undo", onClick: () => cancelVisit(visit, true) },
      });
    }
  }

  const rowFor = (office: FitOffice) => (
    <OfficeRow
      key={office.id}
      myVisits={myVisits}
      saved={savedIds.includes(office.id)}
      onToggleSave={() => toggleSaved(office.id)}
      office={office}
      rep={rep}
      setRep={setRep}
      onAsked={load}
      expanded={expanded === office.id}
      onToggle={() => setExpanded(expanded === office.id ? null : office.id)}
    />
  );

  return (
    <Screen>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">{here ? "Offices near you" : "Your offices"}</h1>
        <p className="text-muted-foreground">
          {rep.name}, {rep.company} · {myDrugs.map((drug) => drug.brand).join(", ")}.{" "}
          <button type="button" onClick={onChange} className="min-h-12 underline">
            Change
          </button>
        </p>
        {locating === "asking" && <p className="text-muted-foreground">Finding offices near you...</p>}
        {locating === "unavailable" && (
          <p className="text-muted-foreground">
            <button type="button" onClick={locate} className="min-h-12 underline">
              Use my location
            </button>{" "}
            to see what&apos;s close.
          </p>
        )}
      </header>

      {!offices &&
        (loadFailed ? (
          <p>Couldn&apos;t load offices. Check the connection and try again.</p>
        ) : (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ))}

      {/* The rep's own upcoming visits, to keep track of and cancel. */}
      {myVisits.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Your visits ({myVisits.length})</h2>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {myVisits.map((visit) => (
              <li key={visit.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-lg font-semibold">{visit.officeName}</span>
                  <span className="block text-base text-muted-foreground">
                    {formatVisit(visit.slotAt, null, true)}
                  </span>
                </span>
                <Button
                  variant="outline"
                  onClick={() => cancelVisit(visit)}
                  className="h-12 shrink-0 px-4 text-lg"
                >
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {offices && (
        <div className="flex flex-col gap-1">
          <div className="relative">
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Search offices"
              placeholder="Search offices, neighborhoods, or topics"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-12 pl-10 text-lg md:text-lg"
            />
          </div>
          {/* Right under the box: how many matched, and a way back to the full list. */}
          {query !== "" && (
            <p aria-live="polite" className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
              <span>
                {matches.length === 0
                  ? `No offices match "${search.trim()}".`
                  : `${matches.length} ${matches.length === 1 ? "office matches" : "offices match"} "${search.trim()}".`}
              </span>
              <button type="button" onClick={() => setSearch("")} className="min-h-12 underline">
                Clear
              </button>
            </p>
          )}
        </div>
      )}

      {offices && query !== "" && matches.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">{matches.map(rowFor)}</ul>
      )}

      {offices && query === "" && (
        <>
          <OfficeSection title="Saved" count={saved.length}>
            {saved.map(rowFor)}
          </OfficeSection>
          <OfficeSection title={`Good fits for ${productsText}`} count={goodFits.length}>
            {goodFits.map(rowFor)}
          </OfficeSection>
          <OfficeSection title="Maybe" count={maybes.length}>
            {maybes.map(rowFor)}
          </OfficeSection>
          <OfficeSection title="Not taking visits right now" count={notNow.length} collapsed>
            {notNow.map(rowFor)}
          </OfficeSection>
          <OfficeSection title={`Farther than ${NEARBY_MILES} miles`} count={farAway.length} collapsed>
            {farAway.map(rowFor)}
          </OfficeSection>
        </>
      )}
    </Screen>
  );
}

// A titled list of office rows. Collapsed sections open with a tap.
function OfficeSection({
  title,
  count,
  collapsed,
  children,
}: {
  title: string;
  count: number;
  collapsed?: boolean;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  const list = <ul className="divide-y overflow-hidden rounded-2xl border bg-card">{children}</ul>;

  if (collapsed) {
    return (
      <details className="flex flex-col gap-2">
        <summary className="min-h-12 cursor-pointer py-2 text-lg font-semibold">
          {title} ({count})
        </summary>
        {list}
      </details>
    );
  }
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">
        {title} ({count})
      </h2>
      {list}
    </section>
  );
}

// One office as a line item: fit color, name, where, and the one line that matters.
// Tapping it shows what they want, their visit times, and the request button.
function OfficeRow({
  myVisits,
  saved,
  onToggleSave,
  office,
  rep,
  setRep,
  onAsked,
  expanded,
  onToggle,
}: {
  myVisits: MyVisit[];
  saved: boolean;
  onToggleSave: () => void;
  office: FitOffice;
  rep: SavedRep;
  setRep: (rep: SavedRep) => void;
  onAsked: () => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [redirectState, setRedirectState] = useState<"idle" | "sending" | "done">("idle");

  const [pickedTime, setPickedTime] = useState<{ start: string; end: string | null } | null>(null);

  // `requestedAt`: the visit time the rep picked. Without it, the soonest open time.
  async function requestVisit(requestedAt?: string) {
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
          requestedAt,
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

  const where = [
    office.neighborhood,
    office.distanceMiles !== null && `${office.distanceMiles} mi`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60"
      >
        <span aria-hidden className={`size-3 shrink-0 rounded-full ${FIT_STYLE[office.fit]}`} />
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-semibold">{office.name}</span>
          <span className="block text-base text-muted-foreground">
            {where && `${where} · `}
            {office.reason}
          </span>
        </span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 px-4 pb-4 text-lg">
          <p>
            <span className="text-muted-foreground">Wants </span>
            {office.topics.length > 0 ? office.topics.join(", ") : "no specific topics"}
          </p>
          {/* Good fits list their times as buttons below, so skip the plain list there. */}
          {office.times.length === 0 && (
            <p>
              <span className="text-muted-foreground">Visits </span>
              {visitTimes(office.visitSlots)}
            </p>
          )}

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
              <p>{answer.message}</p>
              {answer.redirectAction &&
                (redirectState === "done" ? (
                  <p className="font-medium">{redirectDoneText(answer.redirectAction, answer.slotAt)}</p>
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
          ) : office.times.length > 0 ? (
            // Good fit: pick one of the office's times, then confirm. The office only
            // hears about it once the rep confirms.
            <div className="flex flex-col gap-2">
              <p className="font-medium">Pick a time ({office.drugBrand})</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {office.times.map((time) => {
                  const picked = pickedTime?.start === time.start;
                  // Already booked somewhere else around then: can't be in two places at once.
                  const clash = clashingVisit(time.start, myVisits);
                  return (
                    // Picked = heavy outline, so the solid button below is clearly the one that sends.
                    <Button
                      key={time.start}
                      variant="outline"
                      aria-pressed={picked}
                      disabled={Boolean(clash)}
                      onClick={() => setPickedTime(picked ? null : time)}
                      className={`h-auto min-h-12 justify-start px-4 py-2 text-lg whitespace-normal ${
                        picked ? "border-2 border-foreground bg-muted font-semibold" : ""
                      }`}
                    >
                      <span className="flex flex-col">
                        <span>{formatVisit(time.start, time.end, true)}</span>
                        {clash && (
                          <span className="text-base font-normal">Already booked at {clash.officeName}</span>
                        )}
                      </span>
                    </Button>
                  );
                })}
              </div>
              <Button
                onClick={() => pickedTime && requestVisit(pickedTime.start)}
                disabled={!pickedTime || sending}
                className="h-12 px-5 text-lg whitespace-normal"
              >
                {sending
                  ? "Asking..."
                  : pickedTime
                    ? `Request ${formatVisit(pickedTime.start, pickedTime.end, true)}`
                    : "Pick a time above"}
              </Button>
            </div>
          ) : (
            <Button onClick={() => requestVisit()} disabled={sending} className="h-12 self-start px-5 text-lg">
              {sending ? "Asking..." : `Request a visit (${office.drugBrand})`}
            </Button>
          )}
          {error && <p role="alert">{error}</p>}
          <Button variant="ghost" onClick={onToggleSave} className="h-12 self-start px-0 text-lg underline">
            {saved ? "Remove from saved" : "Save this office"}
          </Button>
        </div>
      )}
    </li>
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
