import Link from "next/link";
import { cn } from "cn";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BRANDS, loadSignals, type Misses } from "@/lib/signals";
import { createServerClient } from "@/lib/supabase/server";
import { CopyButton } from "./copy-button";

// Demand Signals: what Impiricus sells. Three defined numbers, then three sections:
// unmet demand, why requests didn't become visits, and what's worth knowing.
// Computed on page load from every request and Door Sign.
export default async function SignalsPage(props: PageProps<"/signals">) {
  const searchParams = await props.searchParams;
  const brand = BRANDS.find((b) => b === searchParams.brand) ?? null;
  const days = searchParams.days === "7" ? 7 : 30;

  const signals = await loadSignals(createServerClient(), brand, days, new Date());
  const areaText = brand ? signals.areas.join(" or ") : "any topic";

  const link = (next: { brand?: string | null; days?: number }) => {
    const params = new URLSearchParams();
    const nextBrand = next.brand === undefined ? brand : next.brand;
    if (nextBrand) params.set("brand", nextBrand);
    params.set("days", String(next.days ?? days));
    return `/signals?${params}`;
  };

  return (
    <main className="flex min-h-dvh w-full flex-1 justify-center p-6">
      <div className="flex w-full max-w-3xl flex-col gap-8">
        <header className="flex flex-col gap-4">
          <Link href="/" aria-label="Knock home" className="w-28">
            <Logo />
          </Link>
          <div>
            <h1 className="text-3xl font-semibold">Demand Signals</h1>
            <p className="text-muted-foreground">
              What offices want, from their Door Signs and every Knock request.
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

        {/* Three numbers, each with exactly what it counts. */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat value={String(signals.requests)} label="Requests" definition={`From ${signals.whose}, last ${days} days`} />
          <Stat
            value={String(signals.accepted)}
            label="Accepted visits"
            definition={
              signals.acceptanceRate === null
                ? "No visit requests yet"
                : `${signals.acceptanceRate}% of visit requests`
            }
          />
          <Stat
            value={String(signals.wantedAt)}
            label="Offices that want it"
            definition={`Signs asking for ${areaText} today`}
          />
        </section>

        <Section title="Unmet demand" empty="Every office that wants these topics had an accepted visit.">
          {signals.unmet.map((item) => (
            <Card key={item.area} className="gap-3 p-6 text-lg">
              <p className="text-xl font-medium">{item.sentence}</p>
              <ul className="flex flex-wrap gap-2">
                {item.offices.map((name) => (
                  <li key={name} className="rounded-full bg-muted px-3 py-1 text-base">
                    {name}
                  </li>
                ))}
              </ul>
              <CopyButton label="Send list to field team" text={item.copyText} />
            </Card>
          ))}
        </Section>

        <Section title="Why requests didn't become visits" empty="Every request became a visit.">
          {signals.misses && <MissesCard misses={signals.misses} />}
        </Section>

        <Section title="Worth knowing" empty="Nothing new in this window.">
          {signals.worthKnowing.length > 0 && (
            <Card className="gap-0 divide-y p-0 text-lg">
              {signals.worthKnowing.map((item) => (
                <div key={item.key} className="flex flex-col gap-2 px-6 py-4">
                  <p>{item.text}</p>
                  {item.details && (
                    <ul className="flex flex-col gap-1 text-base text-muted-foreground">
                      {item.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </Card>
          )}
        </Section>
      </div>
    </main>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const items = [children].flat().filter(Boolean);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">{title}</h2>
      {items.length > 0 ? children : <p className="text-muted-foreground">{empty}</p>}
    </section>
  );
}

function Chip({ href, selected, children }: { href: string; selected: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={selected ? "page" : undefined}
      className={cn(buttonVariants({ variant: selected ? "default" : "outline" }), "h-12 px-4 text-lg")}
    >
      {children}
    </Link>
  );
}

function Stat({ value, label, definition }: { value: string; label: string; definition: string }) {
  return (
    <Card className="gap-1 p-5">
      <p className="text-4xl font-semibold">{value}</p>
      <p className="text-lg font-medium">{label}</p>
      <p className="text-base text-muted-foreground">{definition}</p>
    </Card>
  );
}

const TONE_CLASS = {
  topics: "bg-status-topics",
  closed: "bg-status-closed",
  neutral: "bg-foreground/25",
};

// The one chart on this page: a single bar, with the exact counts written under it.
function MissesCard({ misses }: { misses: Misses }) {
  const total = misses.parts.reduce((sum, part) => sum + part.count, 0);
  return (
    <Card className="gap-4 p-6 text-lg">
      <p className="text-xl font-medium">{misses.sentence}</p>
      <div className="flex h-4 w-full overflow-hidden rounded-full">
        {misses.parts.map((part) =>
          part.count > 0 ? (
            <div
              key={part.label}
              className={TONE_CLASS[part.tone]}
              style={{ width: `${(part.count / total) * 100}%` }}
            />
          ) : null
        )}
      </div>
      <ul className="flex flex-wrap gap-x-6 gap-y-1">
        {misses.parts.map((part) => (
          <li key={part.label} className="flex items-center gap-2">
            <span className={`inline-block size-3 rounded-full ${TONE_CLASS[part.tone]}`} />
            {part.label}: {part.count}
          </li>
        ))}
      </ul>
      {misses.wantedAt && (
        <div className="flex flex-col gap-2">
          <p className="font-medium">{misses.wantedAt.title}</p>
          <ul className="flex flex-wrap gap-2">
            {misses.wantedAt.offices.map((name) => (
              <li key={name} className="rounded-full bg-muted px-3 py-1 text-base">
                {name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
