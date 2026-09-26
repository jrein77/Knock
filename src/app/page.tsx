import Link from "next/link";
import { cn } from "cn";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";

// Landing page for judges at the expo table.
export default function Home() {
  const bigButton = cn(buttonVariants(), "h-16 w-full text-xl");

  return (
    <main className="flex min-h-dvh w-full flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-8 text-center">
        <Logo className="w-64" />
        <div className="flex flex-col gap-2">
          <p className="text-2xl font-semibold">Know before you go.</p>
          <p className="text-muted-foreground">
            Their tools tell reps who&apos;s worth visiting. Ours tells them who&apos;s willing.
          </p>
        </div>

        <nav className="flex w-full flex-col gap-3">
          <Link href="/desk" className={bigButton}>
            View as Office
          </Link>
          <Link href="/rep" className={bigButton}>
            View as Rep
          </Link>
          <Link href="/qr" className={bigButton}>
            Scan demo QR
          </Link>
        </nav>

        <Link href="/signals" className="flex min-h-12 items-center text-lg underline">
          Demand Signals, for brand teams
        </Link>
      </div>
    </main>
  );
}
