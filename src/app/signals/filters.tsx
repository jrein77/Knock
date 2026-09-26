"use client";

import { ChevronDownIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";

// Two plain dropdowns instead of rows of buttons: which brand, and which period.
export function SignalsFilters({
  brands,
  brand,
  days,
}: {
  brands: string[];
  brand: string | null;
  days: number;
}) {
  const router = useRouter();

  function go(next: { brand?: string | null; days?: number }) {
    const params = new URLSearchParams();
    const nextBrand = next.brand === undefined ? brand : next.brand;
    if (nextBrand) params.set("brand", nextBrand);
    params.set("days", String(next.days ?? days));
    router.push(`/signals?${params}`);
  }

  const selectClass =
    "h-12 w-full appearance-none rounded-lg border border-input bg-background pr-12 pl-3 text-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor="signals-brand" className="text-base text-muted-foreground">
          Brand
        </Label>
        <div className="relative">
          <select
            id="signals-brand"
            value={brand ?? ""}
            onChange={(event) => go({ brand: event.target.value || null })}
            className={selectClass}
          >
            <option value="">All brands (Impiricus view)</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <SelectArrow />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="signals-days" className="text-base text-muted-foreground">
          Period
        </Label>
        <div className="relative">
          <select
            id="signals-days"
            value={days}
            onChange={(event) => go({ days: Number(event.target.value) })}
            className={selectClass}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
          </select>
          <SelectArrow />
        </div>
      </div>
    </div>
  );
}

// The native arrow sits tight against the edge, so draw our own with room around it.
function SelectArrow() {
  return (
    <ChevronDownIcon
      aria-hidden
      className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-muted-foreground"
    />
  );
}
