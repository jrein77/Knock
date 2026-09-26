// The questions Talk mode asks out loud, in setup and on /sign. They're fixed text, so the voice
// only ever says these words. Each answer fills only the field its question is about,
// and only from fixed choices (see /api/sign/parse).

import { REDIRECT_OPTION_LABELS, STATUS_STYLE } from "./status-style";
import type { RedirectAction, Status, VisitSlot } from "./types";
import { formatSlotLine, sortSlots } from "./week";

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
  visitSlots: "When can reps visit? Tell me the days and times.",
  redirectOptions:
    "When a visit won't work, what can reps do instead? Drop samples at the desk, a virtual meeting, the next open time, or leave materials.",
  weeklyCap: "How many rep visits a week, at most?",
  blockedCompanies: "Are there any companies you don't want visits from? Only your office sees this.",
};

// The answer in a few words, to show back: "Got it: Tue 12:00 PM - 1:00 PM".
export function describeAnswer<F extends VoiceField>(field: F, answer: VoiceAnswer[F]): string {
  switch (field) {
    case "status":
      return STATUS_STYLE[answer as Status].label;
    case "topics":
      return (answer as string[]).join(", ") || "No specific topics";
    case "visitSlots":
      return sortSlots(answer as VisitSlot[]).map(formatSlotLine).join(" · ") || "No visit times";
    case "redirectOptions":
      return (answer as RedirectAction[]).map((option) => REDIRECT_OPTION_LABELS[option]).join(", ") || "Nothing";
    case "weeklyCap":
      return answer === 1 ? "1 visit a week" : `${answer} visits a week`;
    case "blockedCompanies":
      return (answer as string[]).join(", ") || "No blocked companies";
  }
  return "";
}
