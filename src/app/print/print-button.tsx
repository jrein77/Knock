"use client";

import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button onClick={() => window.print()} className="h-14 px-8 text-lg">
      Print
    </Button>
  );
}
