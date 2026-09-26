import Link from "next/link";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui/card";
import { BRANDS, loadSignals, type Signals } from "@/lib/signals";
import { createServerClient } from "@/lib/supabase/server";
import { CopyButton } from "./copy-button";
import { SignalsFilters } from "./filters";

// Demand Signals: what Impiricus sells. What practices are asking for, straight from their
// Door Signs, and what happened when reps asked. Read top to bottom, like a brief:
// the one thing to know, then where you're wanted, how to reach them, when to ask, and why it failed.
export default async function SignalsPage(props: PageProps<"/signals">) {
  const searchParams = await props.searchParams;
  const brand = BRANDS.find((b) => b === searchParams.brand) ?? null;
  const days = searchParams.days === "7" ? 7 : 30;

  const signals = await loadSignals(createServerClient(), brand, days, new Date());

  return (
    <main className="flex min-h-dvh w-full flex-1 justify-center p-6">
      <div className="flex w-full max-w-3xl flex-col gap-10">
        <header className="flex flex-col gap-5">
          <Link href="/" aria-label="Knock home" className="w-28">
            <Logo />
          </Link>
          <div>
            <h1 className="text-3xl font-semibold">Demand Signals</h1>
            <p className="text-muted-foreground">
              What practices are asking for, from their Door Signs. Not prescribing data.
            </p>
          </div>
          <SignalsFilters brands={BRANDS} brand={brand} days={days} />
        </header>

        {/* The one thing to know, with the three numbers behind it. */}
        <section className="flex flex-col gap-6 rounded-3xl bg-card p-7 shadow-sm ring-1 ring-foreground/10">
          <p className="text-2xl leading-snug font-semibold sm:text-3xl">{signals.headline}</p>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {signals.numbers.map((number) => (
              <div key={number.label}>
                <dt className="sr-only">{number.label}</dt>
                <dd className="text-3xl font-semibold">{number.value}</dd>
                <dd className="text-base text-muted-foreground">{number.label}</dd>
              </div>
            ))}
          </dl>
          <p className="text-base text-muted-foreground">
            From what {signals.practicesDeclared} practices put on their Door Signs.
          </p>
        </section>

        {/* Only worth a list when there's more than one topic to compare. */}
        {signals.demandByTopic.length > 1 && (
          <Section title="Demand by topic" intro="Practices asking for each topic, and how many got a visit about it.">
            <ul className="divide-y rounded-2xl border bg-card">
              {signals.demandByTopic.map((row) => (
                <li key={row.area} className="flex items-center justify-between gap-4 px-5 py-4 text-lg">
                  <span className="font-medium">{row.area}</span>
                  <span className="text-right text-muted-foreground">
                    <span className="font-semibold text-foreground">{row.asking}</span> asking ·{" "}
                    <span className="font-semibold text-foreground">{row.visited}</span> visited
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {signals.unmet.length > 0 && (
          <Section title="Where you're wanted but not visiting" intro="Hand these to the field team.">
            {signals.unmet.map((item) => (
              <Card key={item.area} className="gap-4 p-6 text-lg">
                <p className="font-medium">{item.title}</p>
                <ul className="flex flex-wrap gap-2">
                  {item.offices.map((name) => (
                    <li key={name} className="rounded-full bg-muted px-3 py-1 text-base">
                      {name}
                    </li>
                  ))}
                </ul>
                <CopyButton label="Copy list for the field team" text={item.copyText} />
              </Card>
            ))}
          </Section>
        )}

        {(signals.channels || signals.bestTime) && (
          <Section title="How to reach them" intro="What these practices accept instead of a visit, and when they see reps.">
            <Card className="gap-4 p-6 text-lg">
              {signals.channels && (
                <>
                  <p className="font-medium">{signals.channels.sentence}</p>
                  <ul className="flex flex-col gap-1">
                    {signals.channels.rows.map((row) => (
                      <li key={row.label} className="flex justify-between gap-4">
                        <span>{row.label}</span>
                        <span className="text-muted-foreground">
                          {row.count} of {signals.channels!.of}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {signals.bestTime && <p className="border-t pt-4">{signals.bestTime}</p>}
            </Card>
          </Section>
        )}

        {signals.misses && <MissesSection misses={signals.misses} />}

        {signals.cancellations && (
          <Section title="Cancellations" intro="Booked visits that fell through, and which side called them off.">
            <Card className="gap-4 p-6 text-lg">
              <p className="font-medium">{signals.cancellations.sentence}</p>
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dd className="text-3xl font-semibold">{signals.cancellations.byRep}</dd>
                  <dt className="text-base text-muted-foreground">canceled by reps</dt>
                </div>
                <div>
                  <dd className="text-3xl font-semibold">{signals.cancellations.byPractice}</dd>
                  <dt className="text-base text-muted-foreground">canceled by practices</dt>
                </div>
              </dl>
              {signals.cancellations.practices.length > 0 && (
              <div className="flex flex-col gap-1 border-t pt-4">
                <p className="text-base text-muted-foreground">Where it happens most</p>
                <ul className="flex flex-col gap-1">
                  {signals.cancellations.practices.map((practice) => (
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

        {signals.changes.length > 0 && (
          <Section title="What changed">
            <ul className="divide-y rounded-2xl border bg-card">
              {signals.changes.map((item) => (
                <li key={item.key} className="flex flex-col gap-2 px-5 py-4 text-lg">
                  <p>{item.text}</p>
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

function Section({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        {intro && <p className="text-muted-foreground">{intro}</p>}
      </div>
      {children}
    </section>
  );
}

const TONE_CLASS = {
  topics: "bg-status-topics",
  closed: "bg-status-closed",
  neutral: "bg-foreground/25",
};

// The one chart on this page: a single bar, with the exact counts written under it.
function MissesSection({ misses }: { misses: NonNullable<Signals["misses"]> }) {
  const total = misses.parts.reduce((sum, part) => sum + part.count, 0);
  return (
    <Section title="Why visits were declined">
      <Card className="gap-4 p-6 text-lg">
        <p className="font-medium">{misses.sentence}</p>
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
        {misses.rerouted && (
          <div className="flex flex-col gap-1 border-t pt-4">
            <p>{misses.rerouted.sentence}</p>
            {misses.rerouted.offices.length > 0 && (
              <p className="text-muted-foreground">
                Saying yes this week: {misses.rerouted.offices.join(", ")}
              </p>
            )}
          </div>
        )}
      </Card>
    </Section>
  );
}
