// The questions Talk mode asks out loud, in setup and on /sign. They're fixed text, so the voice
// only ever says these words. Each answer fills only the field its question is about,
// and only from fixed choices (see /api/sign/parse).

import { REDIRECT_OPTION_LABELS, STATUS_STYLE } from "./status-style";
import type { RedirectAction, Status, VisitSlot } from "./types";
import { formatDate, formatSlotLine, sortSlots, weeklyOccurrences } from "./week";

export type VoiceField = "status" | "topics" | "visitSlots" | "redirectOptions" | "weeklyCap" | "blockedCompanies";

// What each field's answer looks like once it's understood.
export type VoiceAnswer = {
  status: Status;
  topics: string[];
  visitSlots: VisitSlot[];
  redirectOptions: RedirectAction[];
  weeklyCap: number;
  blockedCompanies: string[];
};

export const VOICE_QUESTIONS: Record<VoiceField, string> = {
  status:
    "Are you taking rep visits right now? You can say open to all reps, only for topics you want, or not right now.",
  topics: "Which topics do you want reps to bring?",
  visitSlots: "When can reps visit? Tell me the days and times. Take your time.",
  redirectOptions:
    "When a visit won't work, what can reps do instead? Drop samples at the desk, a virtual meeting, the next open time, or leave materials.",
  weeklyCap: "How many rep visits a week, at most?",
  blockedCompanies: "Are there any companies you don't want visits from? Only your office sees this.",
};

// Short name for each question's card, and whether reps can see the answer.
export const VOICE_LABELS: Record<VoiceField, string> = {
  status: "Status",
  topics: "Topics",
  visitSlots: "Visit times",
  redirectOptions: "Instead of a visit",
  weeklyCap: "Weekly limit",
  blockedCompanies: "Blocked companies",
};
export const PRIVATE_FIELDS: VoiceField[] = ["weeklyCap", "blockedCompanies"];

// The only other things the voice says.
export const VOICE_REPLIES = {
  gotIt: "Got it.",
  missed: "Sorry, I didn't catch that.",
  offTopic: "Let's keep to rep visits.",
};

// "Topics" can be unclear, so the topics question names some, picked by the practice's specialty.
// Each specialty word points to the areas practices like it usually ask about.
const SPECIALTY_AREAS: { match: RegExp; areas: string[] }[] = [
  { match: /cardi|heart|vascular/i, areas: ["Anticoagulant", "Lipids"] },
  { match: /endocrin|diabet|metabol/i, areas: ["GLP-1 / diabetes", "Lipids"] },
  { match: /pulmon|lung|respir|allerg/i, areas: ["Asthma / COPD"] },
  { match: /derm|skin/i, areas: ["Psoriasis"] },
  { match: /pediatric|children/i, areas: ["Asthma / COPD"] },
  { match: /primary|family|internal|general|community/i, areas: ["GLP-1 / diabetes", "Lipids", "Anticoagulant"] },
];

// "GLP-1 / diabetes" reads badly out loud; "GLP-1 and diabetes" doesn't.
function sayArea(area: string): string {
  return area.replace(" / ", " and ");
}

function sayList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`;
}

// The topics question for this practice: suggestions for its specialty first, then the rest.
// The specialty itself is never read out, only used to pick the order.
export function topicsQuestion(specialty: string | null, areas: string[]): string {
  const suggested = SPECIALTY_AREAS.find((entry) => specialty && entry.match.test(specialty))?.areas.filter(
    (area) => areas.includes(area)
  );
  const intro = "Topics are the kinds of medicine reps come to talk about.";
  if (!suggested || suggested.length === 0) {
    return `${intro} Reps can bring ${sayList(areas.map(sayArea))}. Which do you want to hear about?`;
  }
  const others = areas.filter((area) => !suggested.includes(area));
  const alsoLine = others.length > 0 ? ` Reps can also bring ${sayList(others.map(sayArea))}.` : "";
  return `${intro} Practices like yours often want ${sayList(suggested.map(sayArea))}.${alsoLine} Which do you want to hear about?`;
}

// Every version of the topics question, one per specialty group plus the general one.
function allTopicsQuestions(areas: string[]): string[] {
  const samples = ["", "cardiology", "endocrinology", "pulmonology", "dermatology", "pediatrics", "primary care"];
  return [...new Set(samples.map((specialty) => topicsQuestion(specialty || null, areas)))];
}

// Everything the voice may say: each question, each reply, and a reply followed by a question.
// /api/voice/speak refuses anything else, so it can't be used to read out other text.
export function speakableLines(areas: string[]): Set<string> {
  const questions = [...Object.values(VOICE_QUESTIONS), ...allTopicsQuestions(areas)];
  const replies = Object.values(VOICE_REPLIES);
  return new Set([
    ...questions,
    ...replies,
    ...replies.flatMap((reply) => questions.map((question) => `${reply} ${question}`)),
  ]);
}

// The answer in a few words, to show back: "Got it: Tue 12:00 PM - 1:00 PM".
export function describeAnswer<F extends VoiceField>(field: F, answer: VoiceAnswer[F]): string {
  switch (field) {
    case "status":
      return STATUS_STYLE[answer as Status].label;
    case "topics":
      return (answer as string[]).join(", ") || "No specific topics";
    case "visitSlots":
      return visitTimesAnswer(answer as VisitSlot[]);
    case "redirectOptions":
      return (answer as RedirectAction[]).map((option) => REDIRECT_OPTION_LABELS[option]).join(", ") || "Nothing";
    case "weeklyCap":
      return answer === 1 ? "1 visit a week" : `${answer} visits a week`;
    case "blockedCompanies":
      return (answer as string[]).join(", ") || "No blocked companies";
  }
  return "";
}

// "Tue 12:30 PM · Thu 12:30 PM. Skipping Thu Oct 1.": the weekly pattern, then any dates skipped soon.
function visitTimesAnswer(slots: VisitSlot[]): string {
  if (slots.length === 0) return "No visit times";
  const pattern = sortSlots(slots).map(formatSlotLine).join(" · ");
  const skipped = [
    ...new Set(
      weeklyOccurrences(slots, new Date())
        .filter((occurrence) => occurrence.skipped)
        .map((occurrence) => formatDate(occurrence.date))
    ),
  ];
  return skipped.length > 0 ? `${pattern}. Skipping ${skipped.join(", ")}.` : pattern;
}
