import { Logo } from "@/components/logo";
import { QrCode } from "@/components/qr-code";
import { DEMO_OFFICE_ID } from "@/lib/seed";
import { siteOrigin } from "@/lib/site-url";
import { PrintButton } from "./print-button";

// Printable materials for the expo table: a fold-in-half QR tent card, and the demo rep cards.
// Each rep card says what to tap at Peachtree Family and what should happen.
const REP_CARDS = [
  {
    rep: "Ava Mitchell",
    company: "Norvance",
    tap: "Glucavia, Visit",
    expect: "Green. You're in, with a visit time.",
  },
  {
    rep: "Alex Kim",
    company: "Aerion",
    tap: "Pulmeris, Visit",
    expect: "Amber. Not a topic they want, so a virtual meeting instead.",
  },
  {
    rep: "Jamie Patel",
    company: "Meridian Bio",
    tap: "Statora, Visit",
    expect: "Grey. Not now, with somewhere to leave materials. No reason given.",
  },
  {
    rep: "Sam Okafor",
    company: "Helix Pharma",
    tap: "Cardexa, then Safety notice",
    expect: "Green. Safety notices always get through, even when the office is closed.",
  },
  {
    rep: "Jordan Reyes",
    company: "Norvance",
    tap: "Glucavia, Visit (after two more visits are accepted)",
    expect: "Amber. This week is full, so next week's time instead.",
  },
];

export default async function PrintPage() {
  const url = `${await siteOrigin()}/k/${DEMO_OFFICE_ID}`;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 p-6 print:max-w-none print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <p className="text-muted-foreground">Letter paper. Page 1 is the tent card; fold it on the line.</p>
        <PrintButton />
      </div>

      {/* Tent card: the top half is upside down so both sides read right when folded. */}
      <section className="flex h-[10in] flex-col break-after-page rounded-xl border print:rounded-none print:border-0">
        <TentPanel url={url} className="rotate-180" />
        <div className="border-t-2 border-dashed" />
        <TentPanel url={url} />
      </section>

      <section className="grid grid-cols-2 gap-4">
        {REP_CARDS.map((card) => (
          <article key={card.rep} className="flex break-inside-avoid flex-col gap-2 rounded-xl border p-5">
            <p className="text-base text-muted-foreground">Demo rep card</p>
            <p className="text-2xl font-semibold">{card.rep}</p>
            <p>{card.company}</p>
            <p>
              <span className="font-medium">Tap:</span> {card.tap}
            </p>
            <p className="text-base text-muted-foreground">What should happen: {card.expect}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

function TentPanel({ url, className = "" }: { url: string; className?: string }) {
  return (
    <div className={`flex flex-1 items-center justify-center gap-8 p-8 ${className}`}>
      <QrCode url={url} className="w-56" />
      <div className="flex flex-col gap-3">
        <Logo className="w-40" />
        <p className="text-3xl font-semibold">Reps, knock first.</p>
        <p className="text-xl">Scan to ask for a visit. You&apos;ll have an answer in seconds.</p>
        <p className="text-muted-foreground">Peachtree Family Medicine</p>
      </div>
    </div>
  );
}
