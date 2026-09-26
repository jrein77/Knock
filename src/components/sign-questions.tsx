"use client";

import { CheckIcon, EyeIcon, LockIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { DoorSign } from "@/components/door-sign";
import { CapStepper, ChoicePicker, SlotsPicker } from "@/components/sign-line-editors";
import { Button } from "@/components/ui/button";
import { VoiceAnswerBox } from "@/components/voice-interview";
import { REDIRECT_OPTION_LABELS } from "@/lib/status-style";
import type { RedirectAction, Status, VisitSlot } from "@/lib/types";
import {
  describeAnswer,
  PRIVATE_FIELDS,
  topicsQuestion,
  VOICE_LABELS,
  VOICE_QUESTIONS,
  type VoiceAnswer,
  type VoiceField,
} from "@/lib/voice-questions";

// The office's sign as a list of question cards, used by setup and /sign.
// One card is asked at a time, going down the list: it wears the rainbow ring while it's being
// asked, turns green once answered, and stays grey until then. Each card is answered either
// out loud (or typed) or filled in by hand with the usual buttons, never both at once.

export type QuestionField = Exclude<VoiceField, "status">;
export type QuestionValues = Pick<VoiceAnswer, QuestionField>;

export const QUESTION_FIELDS: QuestionField[] = [
  "topics",
  "visitSlots",
  "redirectOptions",
  "weeklyCap",
  "blockedCompanies",
];

type How = "say" | "fill";

export function SignQuestions(props: {
  values: QuestionValues;
  onChange: <F extends QuestionField>(field: F, value: QuestionValues[F]) => void;
  areas: string[];
  companies: string[];
  specialty: string | null; // picks which topics the topics question suggests
  startWith?: QuestionField; // setup starts asking right away
  onFinished: () => void; // the last card was answered
}) {
  const [active, setActive] = useState<QuestionField | null>(props.startWith ?? null);
  const [done, setDone] = useState<QuestionField[]>([]);
  // Out loud or by hand. Switching on one card carries on to the next ones.
  const [how, setHow] = useState<How>("say");

  // Move on to the next card down that isn't answered yet.
  function moveOn(from: QuestionField, answered: QuestionField[]) {
    const later = QUESTION_FIELDS.slice(QUESTION_FIELDS.indexOf(from) + 1);
    const next = later.find((field) => !answered.includes(field)) ?? null;
    setActive(next);
    if (!next) props.onFinished();
  }

  function finish(field: QuestionField) {
    const answered = done.includes(field) ? done : [...done, field];
    setDone(answered);
    moveOn(field, answered);
  }

  // The topics question names topics that fit this practice. The others are fixed.
  function questionFor(field: QuestionField): string {
    return field === "topics" ? topicsQuestion(props.specialty, props.areas) : VOICE_QUESTIONS[field];
  }

  // While one card is being answered, fetch the next card's voice so it starts without a wait.
  // Each line is cached by the browser after the first time.
  useEffect(() => {
    if (how !== "say") return;
    const later = active ? QUESTION_FIELDS.slice(QUESTION_FIELDS.indexOf(active) + 1) : QUESTION_FIELDS;
    const next = later.find((field) => !done.includes(field));
    if (next) fetch(`/api/voice/speak?text=${encodeURIComponent(questionFor(next))}`).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, how]);

  function renderFill(field: QuestionField) {
    const { values, onChange } = props;
    switch (field) {
      case "topics":
        return (
          <ChoicePicker
            options={[...new Set([...props.areas, ...values.topics])].map((area) => ({ value: area, label: area }))}
            value={values.topics}
            onChange={(topics) => onChange("topics", topics)}
            allowNew={{ label: "Add a topic" }}
          />
        );
      case "visitSlots":
        return <SlotsPicker value={values.visitSlots} onChange={(slots) => onChange("visitSlots", slots)} />;
      case "redirectOptions":
        return (
          <ChoicePicker<RedirectAction>
            options={(Object.keys(REDIRECT_OPTION_LABELS) as RedirectAction[]).map((option) => ({
              value: option,
              label: REDIRECT_OPTION_LABELS[option],
            }))}
            value={values.redirectOptions}
            onChange={(options) => onChange("redirectOptions", options)}
          />
        );
      case "weeklyCap":
        return <CapStepper value={values.weeklyCap} onChange={(cap) => onChange("weeklyCap", cap)} />;
      case "blockedCompanies":
        return (
          <ChoicePicker
            options={[...new Set([...props.companies, ...values.blockedCompanies])].map((company) => ({
              value: company,
              label: company,
            }))}
            value={values.blockedCompanies}
            onChange={(companies) => onChange("blockedCompanies", companies)}
          />
        );
    }
  }

  return (
    <ol className="flex flex-col gap-4">
      {QUESTION_FIELDS.map((field) => {
        const isActive = active === field;
        const isDone = done.includes(field);
        const frame = isActive
          ? "ai-ring"
          : isDone
            ? "border-2 border-status-open bg-card"
            : "border-2 border-border bg-card";

        return (
          // Tapping anywhere on a closed card opens it, same as its Change button.
          <li
            key={field}
            onClick={isActive ? undefined : () => setActive(field)}
            className={`flex flex-col gap-3 rounded-3xl p-5 ${frame} ${
              isActive ? "" : "cursor-pointer transition-colors hover:bg-muted/40"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <h3 className="flex items-center gap-2 text-xl font-semibold">
                {isDone && <CheckIcon className="size-5 text-status-open" aria-label="Answered" />}
                {VOICE_LABELS[field]}
              </h3>
              <WhoSees field={field} />
            </div>

            {!isActive && (
              <div className="flex items-start justify-between gap-4">
                <span className="pt-2.5">{describeAnswer(field, props.values[field])}</span>
                <Button
                  variant="ghost"
                  onClick={() => setActive(field)}
                  className="h-12 shrink-0 px-3 text-lg underline underline-offset-4"
                >
                  Change
                </Button>
              </div>
            )}

            {isActive && (
              <>
                <p className="text-lg font-medium">{questionFor(field)}</p>
                {how === "say" ? (
                  <VoiceAnswerBox
                    key={field}
                    field={field}
                    question={questionFor(field)}
                    onAnswer={(answer) => {
                      props.onChange(field, answer as QuestionValues[typeof field]);
                      finish(field);
                    }}
                  />
                ) : (
                  <div className="flex flex-col gap-3">
                    {renderFill(field)}
                    <Button onClick={() => finish(field)} className="h-12 text-lg">
                      Done
                    </Button>
                  </div>
                )}
                <div className="flex flex-wrap justify-between gap-2">
                  <Button
                    variant="link"
                    onClick={() => setHow(how === "say" ? "fill" : "say")}
                    className="h-12 px-0 text-lg"
                  >
                    {how === "say" ? "Fill it in myself" : "Answer out loud instead"}
                  </Button>
                  <Button variant="link" onClick={() => moveOn(field, done)} className="h-12 px-0 text-lg">
                    Skip
                  </Button>
                </div>
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// "Reps see this" or "Only your office sees this", on every card, in words and an icon.
function WhoSees({ field }: { field: VoiceField }) {
  const isPrivate = PRIVATE_FIELDS.includes(field);
  return (
    <span className="flex items-center gap-1.5 text-base text-muted-foreground">
      {isPrivate ? <LockIcon className="size-4" /> : <EyeIcon className="size-4" />}
      {isPrivate ? "Only your office sees this" : "Reps see this"}
    </span>
  );
}

// The check before anything goes on the sign: what reps will see (the Door Sign itself),
// and apart from it, what only the office sees.
export function SignReview(props: {
  sign: { name: string; neighborhood: string | null; specialty: string | null; status: Status; topicsNote: string | null };
  values: QuestionValues;
  changed?: VoiceField[]; // on /sign: what's different from the sign now
  saving: boolean;
  saveLabel: string;
  onSave: () => void;
  onBack: () => void;
}) {
  const { values } = props;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold">Check it before it goes on your sign</h2>
        {props.changed && props.changed.length > 0 && (
          <p className="text-muted-foreground">
            Changing: {props.changed.map((field) => VOICE_LABELS[field]).join(", ")}
          </p>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="flex items-center gap-2 text-xl font-semibold">
          <EyeIcon className="size-5" />
          Reps see this
        </h3>
        <DoorSign
          name={props.sign.name}
          neighborhood={props.sign.neighborhood}
          specialty={props.sign.specialty}
          status={props.sign.status}
          todayOnly={false}
          topics={values.topics}
          topicsNote={props.sign.topicsNote}
          visitSlots={values.visitSlots as VisitSlot[]}
          redirectOptions={values.redirectOptions}
        />
      </section>

      <section className="flex flex-col gap-3 rounded-3xl bg-muted/60 p-5">
        <h3 className="flex items-center gap-2 text-xl font-semibold">
          <LockIcon className="size-5" />
          Only your office sees this
        </h3>
        <p className="text-muted-foreground">Knock uses these to decide, but never shows them to a rep.</p>
        {PRIVATE_FIELDS.map((field) => (
          <div key={field} className="flex flex-col">
            <span className="text-base text-muted-foreground">{VOICE_LABELS[field]}</span>
            <span>{describeAnswer(field, values[field as QuestionField])}</span>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button onClick={props.onSave} disabled={props.saving} className="h-14 text-lg">
          {props.saving ? "Saving..." : props.saveLabel}
        </Button>
        <Button variant="outline" onClick={props.onBack} className="h-14 text-lg">
          Go back
        </Button>
      </div>
    </div>
  );
}
