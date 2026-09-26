import "server-only";
import { headers } from "next/headers";

// This deployment's address (e.g. https://knock-gules-one.vercel.app or http://localhost:3000),
// so printed QR codes point wherever the page was opened.
export async function siteOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}
