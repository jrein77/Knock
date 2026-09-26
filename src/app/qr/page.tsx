import Link from "next/link";
import { Logo } from "@/components/logo";
import { QrCode } from "@/components/qr-code";
import { DEMO_OFFICE_ID } from "@/lib/seed";
import { siteOrigin } from "@/lib/site-url";

// The demo QR, big enough to scan from across the table.
export default async function QrPage() {
  const url = `${await siteOrigin()}/k/${DEMO_OFFICE_ID}`;

  return (
    <main className="flex min-h-dvh w-full flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <Logo className="w-40" />
        <h1 className="text-3xl font-semibold">Reps, knock first.</h1>
        <p className="text-muted-foreground">
          Scan to ask Peachtree Family Medicine for a visit. You&apos;ll have an answer in seconds.
        </p>
        <QrCode url={url} className="w-full max-w-sm" />
        <p className="text-base break-all text-muted-foreground">{url}</p>
        <div className="flex gap-6">
          <Link href="/print" className="flex min-h-12 items-center text-lg underline">
            Print the tent card
          </Link>
          <Link href="/" className="flex min-h-12 items-center text-lg underline">
            Back
          </Link>
        </div>
      </div>
    </main>
  );
}
