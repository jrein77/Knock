import { SignEditor } from "@/components/sign-editor";
import { DEMO_OFFICE_ID } from "@/lib/seed";

// The doctor's view of their Door Sign. No auth for the demo: always the demo office.
export default function SignPage() {
  return (
    <main className="flex min-h-dvh w-full flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-xl flex-col gap-4">
        <p className="text-center text-muted-foreground">This is what reps see.</p>
        <SignEditor officeId={DEMO_OFFICE_ID} />
      </div>
    </main>
  );
}
