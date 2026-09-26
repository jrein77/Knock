"use client";

import type { Drug } from "@/lib/types";

// Drugs as compact two-column tiles (brand over area), so the whole list fits on a phone.
export function DrugTiles({
  drugs,
  selected,
  onToggle,
}: {
  drugs: Drug[];
  selected: string[];
  onToggle: (drugId: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {drugs.map((drug) => {
        const isSelected = selected.includes(drug.id);
        return (
          <button
            key={drug.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onToggle(drug.id)}
            className={`flex min-h-16 flex-col items-start justify-center rounded-xl border px-4 py-2 text-left transition-colors ${
              isSelected
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background hover:bg-muted"
            }`}
          >
            <span className="text-lg font-semibold">{drug.brand}</span>
            <span className={`text-base ${isSelected ? "opacity-80" : "text-muted-foreground"}`}>
              {drug.area}
            </span>
          </button>
        );
      })}
    </div>
  );
}
