"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { DoorSign, type SignLine } from "@/components/door-sign";
import { CapEditor, ChoiceEditor, SlotsEditor } from "@/components/sign-line-editors";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { LastChange, SignChange } from "@/lib/sign";
import { REDIRECT_OPTION_LABELS, STATUS_STYLE } from "@/lib/status-style";
import type { Office, RedirectAction, Status } from "@/lib/types";
import { useOfficePings } from "@/lib/use-office-pings";
import { formatWhen, nyToday } from "@/lib/week";

type SignData = {
  office: Office & { effective_status: Status };
  brandBlocks: string[];
  lastChange: LastChange | null;
  areas: string[];
  companies: string[];
};

const STATUSES: { value: Status; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "topics", label: "Topics only" },
  { value: "closed", label: "Closed" },
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

// The office's editable Door Sign. Used on /sign and in the desk's "Our Sign" view.
// `showName` is off on the desk, where the page header already shows the office name.
export function SignEditor({ officeId, showName = true }: { officeId: string; showName?: boolean }) {
  const [data, setData] = useState<SignData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editing, setEditing] = useState<SignLine | null>(null);

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

  function renderEditor(line: SignLine) {
    const close = () => setEditing(null);
    switch (line) {
      case "status":
        return <StatusEditor current={office.effective_status} onPick={setStatus} onCancel={close} />;
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

  return (
    <div className="flex flex-col gap-6">
      <p className="-mb-3 text-center text-muted-foreground">
        This is what reps see. Tap any part to change it.
      </p>
      <DoorSign
        showName={showName}
        name={office.name}
        neighborhood={office.neighborhood}
        specialty={office.specialty}
        status={office.effective_status}
        todayOnly={todayOnly}
        topics={office.topics}
        topicsNote={office.topics_note}
        visitSlots={office.visit_slots}
        redirectOptions={office.redirect_options}
        privateInfo={{ weeklyCap: office.weekly_cap, brandBlocks }}
        editing={editing}
        onEdit={setEditing}
        renderEditor={renderEditor}
      />

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

// Opens in place of the sign's status band. One tap on a status changes it (with Undo).
// "Just for today" is optional: the status switches back on its own tomorrow,
// e.g. closed because the doctor is out.
function StatusEditor({
  current,
  onPick,
  onCancel,
}: {
  current: Status;
  onPick: (status: Status, justToday: boolean) => void;
  onCancel: () => void;
}) {
  const [justToday, setJustToday] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <p className="font-medium">Change your status</p>
      <label className="flex min-h-12 cursor-pointer items-center gap-3 text-lg">
        <input
          type="checkbox"
          checked={justToday}
          onChange={(event) => setJustToday(event.target.checked)}
          className="size-6 accent-foreground"
        />
        Just for today (switches back tomorrow)
      </label>
      <div className="grid grid-cols-3 gap-2">
        {STATUSES.map((status) => {
          const isCurrent = current === status.value;
          return (
            <Button
              key={status.value}
              variant="outline"
              aria-pressed={isCurrent}
              onClick={() => (isCurrent ? onCancel() : onPick(status.value, justToday))}
              className={`h-14 text-lg whitespace-normal ${isCurrent ? STATUS_STYLE[status.value].className : ""}`}
            >
              {status.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
