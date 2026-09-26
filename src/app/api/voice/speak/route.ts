import { xai } from "@ai-sdk/xai";
import { generateSpeech } from "ai";
import { createServerClient } from "@/lib/supabase/server";
import { speakableLines } from "@/lib/voice-questions";

// Talk mode's voice: Grok reads one of Knock's fixed lines aloud (voice from XAI_VOICE).
// Only lines from speakableLines() are allowed, so this can't be used to read out anything else.
// A GET with the line in the URL, so the browser and CDN cache each line after the first time.
// If it fails, the browser's own voice reads the line instead.

// The allowed lines depend on the topics Knock knows (they're named in the topics question).
async function allowedLines(): Promise<Set<string>> {
  const { data } = await createServerClient().from("drugs").select("area");
  const areas = [...new Set((data ?? []).map((drug) => drug.area as string))].sort();
  return speakableLines(areas);
}

export async function GET(request: Request) {
  const text = new URL(request.url).searchParams.get("text") ?? "";
  if (!(await allowedLines()).has(text)) {
    return Response.json({ error: "Not a Knock question." }, { status: 400 });
  }
  if (!process.env.XAI_API_KEY) {
    return Response.json({ error: "No voice right now." }, { status: 503 });
  }

  try {
    const { audio } = await generateSpeech({
      model: xai.speech(),
      text,
      voice: process.env.XAI_VOICE || "carina",
      abortSignal: AbortSignal.timeout(5000),
      maxRetries: 0,
    });
    return new Response(audio.uint8Array as BodyInit, {
      headers: {
        "Content-Type": audio.mediaType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    });
  } catch (error) {
    console.error("voice speak failed:", error);
    return Response.json({ error: "No voice right now." }, { status: 503 });
  }
}
