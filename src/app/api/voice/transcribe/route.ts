import { xai } from "@ai-sdk/xai";
import { experimental_transcribe as transcribe, NoTranscriptGeneratedError } from "ai";
import { createServerClient } from "@/lib/supabase/server";

// Talk mode's ears: turns a short recorded answer (a WAV from src/lib/mic.ts) into text with Grok.
// Knock's topic and company names are passed as key terms so they're heard right.
// Only short WAV recordings, 6 second timeout. If it fails, the office can type the answer instead.

const MAX_BYTES = 2_000_000; // about a minute of 16 kHz audio

export async function POST(request: Request) {
  if (request.headers.get("content-type") !== "audio/wav") {
    return Response.json({ error: "Send a WAV recording." }, { status: 400 });
  }
  const audio = new Uint8Array(await request.arrayBuffer());
  if (audio.length < 100 || audio.length > MAX_BYTES) {
    return Response.json({ error: "That recording is too short or too long." }, { status: 400 });
  }
  if (!process.env.XAI_API_KEY) {
    return Response.json({ error: "Couldn't hear that right now. You can type your answer." }, { status: 503 });
  }

  const { data: drugs } = await createServerClient().from("drugs").select("area, company");
  const keyterm = [...new Set((drugs ?? []).flatMap((drug) => [drug.area as string, drug.company as string]))];

  try {
    const { text } = await transcribe({
      model: xai.transcription(),
      audio,
      providerOptions: { xai: { language: "en", keyterm } },
      abortSignal: AbortSignal.timeout(6000),
      maxRetries: 0,
    });
    return Response.json({ text: text.trim() });
  } catch (error) {
    // Silence or noise comes back as "no transcript": that's an empty answer, not a failure.
    if (NoTranscriptGeneratedError.isInstance(error)) {
      return Response.json({ text: "" });
    }
    console.error("voice transcribe failed:", error);
    return Response.json({ error: "Couldn't hear that right now. You can type your answer." }, { status: 503 });
  }
}
