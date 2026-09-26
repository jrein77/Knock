import Link from "next/link";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BRANDS, loadSignals, plural, type InsightCard } from "@/lib/signals";
import { createServerClient } from "@/lib/supabase/server";
import { CopyButton } from "./copy-button";

// Demand Signals: what Impiricus sells. A ranked feed of plain-sentence insights,
// computed on page load from every request and Door Sign.
export default async function SignalsPage(props: PageProps<"/signals">) {
  const searchParams = await props.searchParams;
  const brand = BRANDS.find((b) => b === searchParams.brand) ?? null;
  const days = searchParams.days === "7" ? 7 : 30;

  const signals = await loadSignals(createServerClient(), brand, days, new Date());

  const link = (next: { brand?: string | null; days?: number }) => {
    const params = new URLSearchParams();
    const nextBrand = next.brand === undefined ? brand : next.brand;
    if (nextBrand) params.set("brand", nextBrand);
    params.set("days", String(next.days ?? days));
    return `/signals?${params}`;
  };

  return (
    <main className="flex min-h-dvh w-full flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-3xl flex-col gap-8">
        <header className="flex flex-col gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Demand Signals</h1>
            <p className="text-muted-foreground">
              What offices are asking for, from every Knock request and Door Sign.
            </p>
          </div>

          <nav aria-label="Brand" className="flex flex-wrap gap-2">
            <Chip href={link({ brand: null })} selected={!brand}>
              All brands
            </Chip>
            {BRANDS.map((b) => (
              <Chip key={b} href={link({ brand: b })} selected={brand === b}>
                {b}
              </Chip>
            ))}
          </nav>
          <nav aria-label="Time window" className="flex gap-2">
            <Chip href={link({ days: 7 })} selected={days === 7}>
              Last 7 days
            </Chip>
            <Chip href={link({ days: 30 })} selected={days === 30}>
              Last 30 days
            </Chip>
          </nav>
        </header>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat value={signals.tripsSaved} label="Trips saved" />
          <Stat value={signals.acceptedVisits} label="Accepted visits" />
          <Stat value={signals.openDemand} label="Offices with open demand" />
        </section>

        <section className="flex flex-col gap-4">
          {signals.cards.length === 0 && (
            <p className="py-12 text-center text-muted-foreground">
              Nothing stands out in this window yet.
            </p>
          )}
          {signals.cards.map((card) => (
            <InsightCardView key={card.key} card={card} />
          ))}
        </section>
      </div>
    </main>
  );
}

function Chip({ href, selected, children }: { href: string; selected: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={selected ? "page" : undefined}
      className={cn(
        buttonVariants({ variant: selected ? "default" : "outline" }),
        "h-12 px-4 text-lg"
      )}
    >
      {children}
    </Link>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <Card className="items-center gap-1 p-5 text-center">
      <p className="text-4xl font-semibold">{value}</p>
      <p className="text-lg text-muted-foreground">{label}</p>
    </Card>
  );
}

const TONE_CLASS = {
  topics: "bg-status-topics",
  closed: "bg-status-closed",
  neutral: "bg-foreground/25",
};

function InsightCardView({ card }: { card: InsightCard }) {
  const total = card.breakdown?.reduce((sum, part) => sum + part.count, 0) ?? 0;
  const hasDetails = card.officeList || card.breakdown || card.notes;

  return (
    <Card className="gap-4 p-6 text-lg">
      <p className="text-xl font-medium">{card.sentence}</p>
      <p className="text-base text-muted-foreground">{plural(card.officesAffected, "office", "offices")}</p>

      {hasDetails && (
        <details className="flex flex-col gap-3">
          <summary className="min-h-12 cursor-pointer py-2 font-medium underline">Show details</summary>

          <div className="flex flex-col gap-4 pt-2">
            {/* The one chart allowed on this page: a single horizontal bar. */}
            {card.breakdown && total > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex h-4 w-full overflow-hidden rounded-full">
                  {card.breakdown.map((part) =>
                    part.count > 0 ? (
                      <div
                        key={part.label}
                        className={TONE_CLASS[part.tone]}
                        style={{ width: `${(part.count / total) * 100}%` }}
                      />
                    ) : null
                  )}
                </div>
                <ul className="flex flex-wrap gap-x-5 gap-y-1">
                  {card.breakdown.map((part) => (
                    <li key={part.label} className="flex items-center gap-2">
                      <span className={`inline-block size-3 rounded-full ${TONE_CLASS[part.tone]}`} />
                      {part.label}: {part.count}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {card.officeList && (
              <div>
                <p className="font-medium">{card.officeList.title}</p>
                <ul className="list-disc pl-6">
                  {card.officeList.names.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </div>
            )}

            {card.notes && (
              <ul className="flex flex-col gap-2">
                {card.notes.map((note, i) => (
                  <li key={i} className="rounded-xl bg-muted px-4 py-3">
                    <p>&ldquo;{note.body}&rdquo;</p>
                    <p className="text-base text-muted-foreground">{note.repName}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      )}

      {card.copyAction && <CopyButton label={card.copyAction.label} text={card.copyAction.text} />}
    </Card>
  );
}
