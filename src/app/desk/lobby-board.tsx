"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SignEditor } from "@/components/sign-editor";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DECISION_STYLE, STATUS_STYLE } from "@/lib/status-style";
import { useOfficePings } from "@/lib/use-office-pings";
import type { DecisionKind, Office, Purpose, RedirectAction, Source, Status } from "@/lib/types";
import { formatSlot, TIME_ZONE } from "@/lib/week";

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
  redirect_taken_at: string | null;
  created_at: string;
  drugs: { brand: string } | null;
};

type DeskData = {
  office: Office & { effective_status: Status };
  requests: DeskRequest[];
};

// The desk sees why. Reps never do.
const REASON_LABELS: Record<string, string> = {
  safety: "Safety notice, always accepted",
  blocked: "Company is blocked",
  closed: "Sign is closed",
  off_topic: "Not a wanted topic",
  drop_samples: "Sample drop-off",
  slot: "Visit booked",
  cap_full: "Week is full",
  no_slots: "No visit slots",
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
      previous: Pick<DeskRequest, "decision" | "slot_at" | "redirect_action" | "overridden">;
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
  const [view, setView] = useState<"today" | "sign">("today");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/desk?officeId=${officeId}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      setData(await response.json());
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [officeId]);

  useOfficePings(officeId, load);

  async function override(request: DeskRequest, action: "approve" | "decline") {
    const previous = {
      decision: request.decision,
      slot_at: request.slot_at,
      redirect_action: request.redirect_action,
      overridden: request.overridden,
    };
    if (!(await postOverride(request.id, { action }))) {
      toast.error("Couldn't save that. Please try again.");
      return;
    }
    load();

    const verb = action === "approve" ? "Approved" : "Declined";
    toast(`${verb} ${request.rep_name ?? "this request"}`, {
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

  const { office, requests } = data;
  const status = STATUS_STYLE[office.effective_status];

  return (
    <Board>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">{office.name}</h1>
        <Badge className={`h-auto px-4 py-1.5 text-lg ${status.className}`}>{status.label}</Badge>
      </header>

      {/* Two views only: Today and Our Sign. */}
      <ToggleGroup
        value={[view]}
        onValueChange={(value) => {
          if (value[0]) setView(value[0] as "today" | "sign");
        }}
        variant="outline"
        className="grid w-full grid-cols-2"
      >
        <ToggleGroupItem value="today" className="h-12 w-full text-lg">
          Today
        </ToggleGroupItem>
        <ToggleGroupItem value="sign" className="h-12 w-full text-lg">
          Our Sign
        </ToggleGroupItem>
      </ToggleGroup>

      {view === "sign" && <SignEditor officeId={officeId} />}

      {view === "today" && (
        <section className="flex flex-col gap-3">
          {requests.length === 0 && (
            <p className="py-12 text-center text-muted-foreground">
              No requests yet today. Scan the QR code to try it.
            </p>
          )}

          {/* New QR arrivals slide in. Rows already on the board at load don't animate. */}
          <AnimatePresence initial={false}>
            {requests.map((request) =>
              request.source === "qr" ? (
                <motion.div
                  key={request.id}
                  layout
                  initial={{ opacity: 0, y: -32 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 28 }}
                >
                  <ArrivalCard request={request} onOverride={override} />
                </motion.div>
              ) : (
                <QuietRow key={request.id} request={request} />
              )
            )}
          </AnimatePresence>
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

// Page frame: centered, one column.
function Board({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh w-full flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-2xl flex-col gap-6">{children}</div>
    </main>
  );
}

// A rep who scanned the QR code at this desk. Full card with override buttons.
function ArrivalCard({
  request,
  onOverride,
}: {
  request: DeskRequest;
  onOverride: (request: DeskRequest, action: "approve" | "decline") => void;
}) {
  const canApprove = request.decision !== "accepted";
  const canDecline = request.decision !== "declined" && request.purpose !== "safety_notice";

  return (
    <Card className="gap-4 p-6 text-lg">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base text-muted-foreground">
            {formatTime(request.created_at)} · Scanned at the desk
          </p>
          <p className="text-2xl font-semibold">{request.rep_name}</p>
          <p>
            {request.rep_company} · {whatTheyBrought(request)}
          </p>
        </div>
        <DecisionBadge decision={request.decision} />
      </div>

      <DecisionDetail request={request} />

      {(canApprove || canDecline) && (
        <div className="flex flex-wrap gap-3">
          {canApprove && (
            <Button onClick={() => onOverride(request, "approve")} className="h-12 px-5 text-lg">
              Approve anyway
            </Button>
          )}
          {canDecline && (
            <Button
              variant="outline"
              onClick={() => onOverride(request, "decline")}
              className="h-12 px-5 text-lg"
            >
              Decline
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

// Any other request (e.g. from the rep fit list). One quiet line.
function QuietRow({ request }: { request: DeskRequest }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-3 text-muted-foreground">
      <span>{formatTime(request.created_at)}</span>
      <span className="text-foreground">
        {request.rep_name}, {request.rep_company}
      </span>
      <span>{whatTheyBrought(request)}</span>
      <span>
        · {DECISION_STYLE[request.decision].label}
        {request.slot_at && request.decision === "accepted" && ` for ${formatSlot(request.slot_at)}`}
      </span>
    </div>
  );
}

function DecisionBadge({ decision }: { decision: DecisionKind }) {
  const style = DECISION_STYLE[decision];
  return <Badge className={`h-auto px-3 py-1 text-base ${style.className}`}>{style.label}</Badge>;
}

function DecisionDetail({ request }: { request: DeskRequest }) {
  const reason = request.overridden
    ? "Changed by the front desk"
    : REASON_LABELS[request.reason_code ?? ""];
  return (
    <div className="flex flex-col gap-1">
      {reason && <p>{reason}</p>}
      {request.slot_at && <p className="font-medium">{formatSlot(request.slot_at)}</p>}
      {request.redirect_taken_at && request.redirect_action && (
        <p className="font-medium">{REDIRECT_TAKEN_LABELS[request.redirect_action]}</p>
      )}
    </div>
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
