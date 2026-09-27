import Link from "next/link";
import { Logo } from "@/components/logo";
import { QrCode } from "@/components/qr-code";
import { DEMO_OFFICE_ID } from "@/lib/seed";
import { siteOrigin } from "@/lib/site-url";

// The demo QR, big enough to scan from across the table. Also prints as a one-page sign
// for the front desk (the Back link doesn't print).
export default async function QrPage() {
  const url = `${await siteOrigin()}/k/${DEMO_OFFICE_ID}`;

  return (
    <main className="flex min-h-dvh w-full flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <Logo className="w-40" />
        <h1 className="text-3xl font-semibold text-balance">Reps welcome. Let&apos;s find a good time.</h1>
        <p className="text-muted-foreground">
          Scan and tell Peachtree Family Medicine what you&apos;re bringing. You&apos;ll get an answer in
          seconds: a visit time, or what to do instead.
        </p>
        <QrCode url={url} className="w-full max-w-sm" />
        <p className="text-base break-all text-muted-foreground">{url}</p>
        <Link href="/" className="flex min-h-12 items-center text-lg underline print:hidden">
          Back
        </Link>
      </div>
    </main>
  );
}
