import "server-only";

// Send one plain-text email through Resend (https://resend.com), using its HTTP API.
// Needs RESEND_API_KEY. Without it, the email is logged instead, so nothing in the
// demo depends on email. Until a domain is verified in Resend, it only delivers to
// the Resend account owner's own address.
export async function sendEmail({ to, subject, text }: { to: string; subject: string; text: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Knock <onboarding@resend.dev>";

  if (!apiKey) {
    console.log(`[email not sent: no RESEND_API_KEY] to=${to} subject=${subject}`);
    return;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text }),
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) console.log(`[email sent] to=${to} subject=${subject}`);
    else console.error(`[email failed] to=${to} subject=${subject} ${response.status} ${await response.text()}`);
  } catch (error) {
    console.error("[email failed]", error);
  }
}
