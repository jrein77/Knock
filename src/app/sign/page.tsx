import Link from "next/link";
import { SignEditor } from "@/components/sign-editor";
import { DEMO_OFFICE_ID } from "@/lib/seed";

// The doctor's view of their Door Sign. No auth for the demo: always the demo office.
export default function SignPage() {
  return (
    <main className="flex min-h-dvh w-full flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-xl flex-col gap-4">
        <SignEditor officeId={DEMO_OFFICE_ID} />
        <Link href="/sign/setup" className="flex min-h-12 items-center justify-center text-lg underline">
          Set up again
        </Link>
      </div>
    </main>
  );
}
