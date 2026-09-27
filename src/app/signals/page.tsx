import Link from "next/link";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui/card";
import { BRANDS, loadSignals, type Signals } from "@/lib/signals";
import { createServerClient } from "@/lib/supabase/server";
import { CopyButton } from "./copy-button";
import { SignalsFilters } from "./filters";
import { Say, StatHover } from "./stat-hover";

// Demand Signals: what Impiricus sells. What practices are asking for, straight from their
// Door Signs, and what happened when reps asked. Read top to bottom, like a brief: each section
// is one sentence with the evidence under it. Bold, underlined numbers show their source on hover.
export default async function SignalsPage(props: PageProps<"/signals">) {
  const searchParams = await props.searchParams;
  const brand = BRANDS.find((b) => b === searchParams.brand) ?? null;
  const days = searchParams.days === "7" ? 7 : 30;

  const signals = await loadSignals(createServerClient(), brand, days, new Date());
  const { demandByTopic, whoAsks, reach, askFirst, afterNo, cancellations } = signals;

  return (
    <main className="flex min-h-dvh w-full flex-1 justify-center p-6">
      <div className="flex w-full max-w-3xl flex-col gap-10">
        {/* The logo stays: brand teams land here straight from a link, and it's the way home. */}
        <header className="flex flex-col gap-5">
          <Link href="/" aria-label="Knock home" className="w-28">
            <Logo />
          </Link>
          <div>
            <h1 className="text-3xl font-semibold">Demand Signals</h1>
            <p className="text-muted-foreground">
              What practices are asking for, from their Door Signs. Hover a bold number to see where it comes
              from.
            </p>
          </div>
          <SignalsFilters brands={BRANDS} brand={brand} days={days} />
        </header>

        {/* The one thing to know, with the numbers behind it. */}
        <section className="flex flex-col gap-6 rounded-3xl bg-card p-7 shadow-sm ring-1 ring-foreground/10">
          <p className="text-2xl leading-snug font-semibold sm:text-3xl">
            <Say line={signals.headline} />
          </p>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {signals.numbers.map((number) => (
              <div key={number.label}>
                <dt className="sr-only">{number.label}</dt>
                <dd className="text-3xl">
                  <StatHover stat={number.stat} />
                </dd>
                <dd className="text-base text-muted-foreground">{number.label}</dd>
              </div>
            ))}
          </dl>
          <p className="text-base text-muted-foreground">
            <Say line={signals.footnote} />
          </p>
        </section>

        {/* Only worth a list when there's more than one topic to compare. */}
        {demandByTopic.rows.length > 1 && (
          <Section title="Demand by topic" lead={demandByTopic.lead}>
            <ul className="divide-y rounded-2xl border bg-card">
              {demandByTopic.rows.map((row) => (
                <li key={row.area} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-4 text-lg">
                  <span className="font-medium">{row.area}</span>
                  <span className="text-right text-muted-foreground">
                    <StatHover stat={row.asking} className="text-foreground" /> asking ·{" "}
                    <StatHover stat={row.visited} className="text-foreground" /> visited
                    {row.requests && (
                      <>
                        {" "}
                        · <StatHover stat={row.requests} className="text-foreground" /> rep requests
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {signals.unmet.length > 0 && (
          <Section title="Where you're wanted but not visiting">
            {signals.unmet.map((item) => (
              <Card key={item.area} className="gap-4 p-6 text-lg">
                <p className="font-medium">
                  <Say line={item.title} />
                </p>
                <ul className="flex flex-wrap gap-2">
                  {item.offices.map((name) => (
                    <li key={name} className="rounded-full bg-muted px-3 py-1 text-base">
                      {name}
                    </li>
                  ))}
                </ul>
                <CopyButton label="Copy this list" text={item.copyText} />
              </Card>
            ))}
          </Section>
        )}

        {whoAsks && (
          <Section title="Who's asking" lead={whoAsks.lead}>
            <Card className="gap-4 p-6 text-lg">
              <Rows rows={whoAsks.rows} />
              {whoAsks.neighborhoods && (
                <p className="border-t pt-4">
                  <Say line={whoAsks.neighborhoods} />
                </p>
              )}
            </Card>
          </Section>
        )}

        {reach && (
          <Section title="How to reach them" lead={reach.channels?.lead ?? null}>
            <Card className="gap-4 p-6 text-lg">
              {reach.channels && <Rows rows={reach.channels.rows} />}
              {reach.bestTime && (
                <p className="border-t pt-4">
                  <Say line={reach.bestTime} />
                </p>
              )}
              {reach.capacity && (
                <p>
                  <Say line={reach.capacity} />
                </p>
              )}
            </Card>
          </Section>
        )}

        {askFirst && (
          <Section title="Ask before you drive" lead={askFirst.lead}>
            <Card className="gap-3 p-6 text-lg">
              {askFirst.trend && (
                <p>
                  <Say line={askFirst.trend} />
                </p>
              )}
              <p>
                <Say line={askFirst.tripsSaved} />
              </p>
            </Card>
          </Section>
        )}

        {signals.misses && <MissesSection misses={signals.misses} />}

        {afterNo && (
          <Section title="After a “not now”" lead={afterNo.lead}>
            <Card className="gap-4 p-6 text-lg">
              <Rows rows={afterNo.rows} />
            </Card>
          </Section>
        )}

        {(signals.leadTime || signals.desk || cancellations) && (
          <Section title="How visits go" lead={signals.leadTime}>
            <Card className="gap-4 p-6 text-lg">
              {signals.desk && (
                <p>
                  <Say line={signals.desk} />
                </p>
              )}
              {cancellations && (
                <p className={signals.desk ? "border-t pt-4" : ""}>
                  <Say line={cancellations.lead} />
                </p>
              )}
              {cancellations && cancellations.practices.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-base text-muted-foreground">Where cancellations happen most</p>
                  <ul className="flex flex-col gap-1">
                    {cancellations.practices.map((practice) => (
                      <li key={practice.name} className="flex justify-between gap-4">
                        <span>{practice.name}</span>
                        <span className="text-right text-muted-foreground">
                          {[
                            practice.byRep > 0 && `${practice.byRep} by reps`,
                            practice.byPractice > 0 && `${practice.byPractice} by the practice`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </Section>
        )}

        {signals.handoffs && <Section title="Samples and safety notices" lead={signals.handoffs} />}

        {signals.changes.length > 0 && (
          <Section title="What changed">
            <ul className="divide-y rounded-2xl border bg-card">
              {signals.changes.map((item) => (
                <li key={item.key} className="flex flex-col gap-2 px-5 py-4 text-lg">
                  <p>
                    <Say line={item.text} />
                  </p>
                  {item.details && (
                    <ul className="flex flex-col gap-1 text-base text-muted-foreground">
                      {item.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </main>
  );
}

// A section: its title, the one sentence that sums it up, then the evidence.
function Section({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: Signals["headline"] | null;
  children?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{title}</h2>
        {lead && (
          <p className="text-lg">
            <Say line={lead} />
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

// Label on the left, its number on the right.
function Rows({ rows }: { rows: { label: string; count: Signals["numbers"][number]["stat"] }[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {rows.map((row) => (
        <li key={row.label} className="flex justify-between gap-4">
          <span>{row.label}</span>
          <StatHover stat={row.count} className="text-right" />
        </li>
      ))}
    </ul>
  );
}

const TONE_CLASS = {
  topics: "bg-status-topics",
  closed: "bg-status-closed",
  neutral: "bg-foreground/25",
};

// The one chart on this page: a single bar, with the exact counts written under it.
function MissesSection({ misses }: { misses: NonNullable<Signals["misses"]> }) {
  const total = misses.parts.reduce((sum, part) => sum + part.share, 0);
  return (
    <Section title="Why visits were declined" lead={misses.lead}>
      <Card className="gap-4 p-6 text-lg">
        <div className="flex h-4 w-full overflow-hidden rounded-full">
          {misses.parts.map((part) =>
            part.share > 0 ? (
              <div
                key={part.label}
                className={TONE_CLASS[part.tone]}
                style={{ width: `${(part.share / total) * 100}%` }}
              />
            ) : null
          )}
        </div>
        <ul className="flex flex-wrap gap-x-6 gap-y-1">
          {misses.parts.map((part) => (
            <li key={part.label} className="flex items-center gap-2">
              <span className={`inline-block size-3 rounded-full ${TONE_CLASS[part.tone]}`} />
              {part.label}: <StatHover stat={part.count} />
            </li>
          ))}
        </ul>
        {misses.rerouted && (
          <div className="flex flex-col gap-1 border-t pt-4">
            <p>
              <Say line={misses.rerouted.lead} />
            </p>
            {misses.rerouted.offices.length > 0 && (
              <p className="text-muted-foreground">Saying yes this week: {misses.rerouted.offices.join(", ")}</p>
            )}
          </div>
        )}
      </Card>
    </Section>
  );
}
