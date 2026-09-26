"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// Copies a card's office list so it can be pasted to the field team.
export function CopyButton({ label, text }: { label: string; text: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast("List copied. Paste it to your field team.");
    } catch {
      toast.error("Couldn't copy. Select the list and copy it instead.");
    }
  }

  return (
    <Button onClick={copy} className="h-12 self-start px-5 text-lg">
      {label}
    </Button>
  );
}
