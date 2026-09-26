import { xai } from "@ai-sdk/xai";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

// Setup's "say it in your own words": turn a doctor's loose sentence (typed or spoken)
// into Door Sign fields. Grok only fills in a draft; the doctor checks it on the preview
// before anything is saved. Gives up after 8 seconds, and setup works fine without it.

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
const REDIRECTS = ["drop_samples", "virtual", "next_slot", "leave_materials"] as const;
const TIME = z.string().regex(/^\d{2}:\d{2}$/).describe('24-hour "HH:MM"');

export async function POST(request: Request) {
  const { text } = (await request.json()) as { text?: string };
  const said = text?.trim() ?? "";
  if (said === "" || said.length > 1000) {
    return Response.json({ error: "Tell us a sentence or two about rep visits." }, { status: 400 });
  }
  if (!process.env.XAI_API_KEY || !process.env.XAI_MODEL) {
    return Response.json({ error: "Couldn't read that right now. Use the buttons below." }, { status: 503 });
  }

  // Topics must be areas Knock knows, so they match reps' drugs.
  const { data: drugs } = await createServerClient().from("drugs").select("area");
  const areas = [...new Set((drugs ?? []).map((drug) => drug.area as string))];
  if (areas.length === 0) {
    return Response.json({ error: "Couldn't read that right now. Use the buttons below." }, { status: 503 });
  }

  // Every field is nullable: null means "they didn't say", and the draft keeps what it had.
  const schema = z.object({
    status: z
      .enum(["open", "topics", "closed"])
      .nullable()
      .describe("open: any rep. topics: only reps with topics they want. closed: no rep visits."),
    topics: z.array(z.enum(areas as [string, ...string[]])).nullable().describe("Topics they want to hear about"),
    topicsNote: z.string().max(280).nullable().describe("Anything else reps should know, short, in their words"),
    visitSlots: z
      .array(z.object({ day: z.enum(DAYS), time: TIME, end: TIME.nullable() }))
      .nullable()
      .describe('Weekly visit times. "Lunch" means 12:00 to 13:00.'),
    weeklyCap: z.number().int().min(0).max(10).nullable().describe("Most rep visits a week"),
    redirectOptions: z
      .array(z.enum(REDIRECTS))
      .nullable()
      .describe("What reps can do instead of a visit"),
  });

  try {
    const { output } = await generateText({
      model: xai(process.env.XAI_MODEL),
      output: Output.object({ schema }),
      timeout: 8000,
      maxRetries: 0,
      system:
        "You fill in a medical office's rep-visit sign from what the doctor said. " +
        "Only fill a field the doctor actually talked about; otherwise null. " +
        "If they want some topics but not others, status is topics. " +
        `Topics must come from this list: ${areas.join(", ")}. ` +
        'Map loose words to it (e.g. "diabetes stuff" or "Ozempic-type drugs" is GLP-1 / diabetes, "statins" or "cholesterol" is Lipids).',
      prompt: said,
    });

    // Back to the sign's own shape: a window only when they gave an end time.
    const visitSlots = output.visitSlots?.map((slot) =>
      slot.end ? { day: slot.day, time: slot.time, end: slot.end } : { day: slot.day, time: slot.time }
    );
    return Response.json({ ...output, visitSlots: visitSlots ?? null });
  } catch (error) {
    console.error("sign parse failed:", error);
    return Response.json({ error: "Couldn't read that right now. Use the buttons below." }, { status: 503 });
  }
}
