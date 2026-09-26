"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Under a rep's answer: "Think we got this wrong? Leave a note". Saved for the office's desk.
export function LeaveNote({ requestId, className = "" }: { requestId: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  async function send() {
    setState("sending");
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, body }),
      });
      if (!response.ok) throw new Error();
      setState("sent");
      setOpen(false);
    } catch {
      setState("failed");
    }
  }

  if (state === "sent") {
    return <p className={`text-lg ${className}`}>Thanks. The office will see your note.</p>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`min-h-12 self-start text-lg underline ${className}`}
      >
        Think we got this wrong? Leave a note
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-6 text-lg">
            <DrawerHeader className="p-0">
              <DrawerTitle className="text-2xl">Leave a note for the office</DrawerTitle>
              <DrawerDescription className="text-lg">
                The front desk will read it. It won&apos;t change this answer.
              </DrawerDescription>
            </DrawerHeader>
            <Label htmlFor={`note-${requestId}`} className="text-lg">
              Your note
            </Label>
            <Textarea
              id={`note-${requestId}`}
              value={body}
              maxLength={500}
              onChange={(event) => setBody(event.target.value)}
              className="min-h-32 text-lg md:text-lg"
            />
            {state === "failed" && <p role="alert">Couldn&apos;t send. Please try again.</p>}
            <DrawerFooter className="p-0">
              <Button
                onClick={send}
                disabled={body.trim() === "" || state === "sending"}
                className="h-14 text-lg"
              >
                {state === "sending" ? "Sending..." : "Send note"}
              </Button>
              <DrawerClose render={<Button variant="outline" className="h-14 text-lg" />}>
                Close
              </DrawerClose>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
