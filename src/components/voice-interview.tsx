"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { describeAnswer, VOICE_QUESTIONS, type VoiceAnswer, type VoiceField } from "@/lib/voice-questions";

// Talk mode: asks the office each question out loud, listens, and fills in that one field.
// The browser does the speaking and listening (speechSynthesis and SpeechRecognition);
// /api/sign/parse turns what it heard into the field. What it hears shows in a box that
// can be fixed or typed into, so it also works without a microphone.

// The browser's speech-to-text (Chrome, Edge, Safari). Just the parts used here.
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function makeRecognition(): Recognition | null {
  const w = window as unknown as Record<string, (new () => Recognition) | undefined>;
  const Speech = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Speech ? new Speech() : null;
}

type Phase = "speaking" | "listening" | "reading" | "waiting";

// After this many answers it couldn't use, it stops re-asking and waits for a tap.
const MAX_TRIES = 2;

export function VoiceInterview<F extends VoiceField>(props: {
  fields: F[];
  onAnswer: (field: F, answer: VoiceAnswer[F]) => void;
  onDone: () => void;
  hideQuestion?: boolean; // setup already shows the question as the step's heading
}) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("speaking");
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [canListen, setCanListen] = useState(true);

  const recognition = useRef<Recognition | null>(null);
  const heard = useRef("");
  const tries = useRef(0);
  // Bumped whenever the question changes or the box closes, so late speech callbacks are ignored.
  const turn = useRef(0);

  const field = props.fields[index];

  function stopEverything() {
    turn.current += 1;
    window.speechSynthesis?.cancel();
    recognition.current?.stop();
  }

  // Say something, then call `then` (unless the question moved on in the meantime).
  function speak(words: string, then: () => void) {
    const myTurn = turn.current;
    let finished = false;
    const done = () => {
      if (finished || myTurn !== turn.current) return;
      finished = true;
      then();
    };
    if (!window.speechSynthesis) return done();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(words);
    utterance.lang = "en-US";
    utterance.onend = done;
    utterance.onerror = done;
    // Some browsers never say they finished. Move on anyway after about as long as it takes to say.
    setTimeout(done, 1500 + words.split(" ").length * 450);
    setPhase("speaking");
    window.speechSynthesis.speak(utterance);
  }

  function listen(forField: F) {
    const speech = makeRecognition();
    if (!speech) {
      setCanListen(false);
      setPhase("waiting");
      return;
    }
    const myTurn = turn.current;
    speech.lang = "en-US";
    speech.continuous = false; // stops by itself after a pause
    speech.interimResults = true;
    heard.current = "";
    speech.onresult = (event) => {
      heard.current = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join("")
        .trim();
      setText(heard.current);
    };
    speech.onerror = () => {
      if (myTurn !== turn.current) return;
      setMessage("Couldn't hear that. Check the microphone, or type your answer.");
    };
    speech.onend = () => {
      if (myTurn !== turn.current) return;
      if (heard.current) submit(forField, heard.current);
      else setPhase("waiting");
    };
    recognition.current = speech;
    setPhase("listening");
    speech.start();
  }

  function ask(forField: F, before = "") {
    speak(`${before}${VOICE_QUESTIONS[forField]}`, () => listen(forField));
  }

  // Couldn't use that answer: say why and ask again, a couple of times at most.
  function askAgain(forField: F, why: string) {
    setMessage(why);
    tries.current += 1;
    if (tries.current < MAX_TRIES) ask(forField, `${why} `);
    else setPhase("waiting");
  }

  function next() {
    stopEverything();
    tries.current = 0;
    setText("");
    setMessage(null);
    if (index + 1 < props.fields.length) {
      setIndex(index + 1);
    } else {
      props.onDone();
    }
  }

  async function submit(forField: F, answerText: string) {
    recognition.current?.stop();
    setPhase("reading");
    setMessage(null);
    const myTurn = turn.current;
    try {
      const response = await fetch("/api/sign/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: forField, text: answerText }),
      });
      const result = await response.json();
      if (myTurn !== turn.current) return;

      if (result.offTopic) return askAgain(forField, result.error);
      if (!response.ok) {
        setMessage(result.error);
        setPhase("waiting");
        return;
      }
      if (result.answer === null) return askAgain(forField, "Sorry, I didn't catch that.");

      props.onAnswer(forField, result.answer);
      setMessage(`Got it: ${describeAnswer(forField, result.answer)}`);
      speak("Got it.", next);
    } catch {
      if (myTurn !== turn.current) return;
      setMessage("Couldn't read that right now. You can use the buttons instead.");
      setPhase("waiting");
    }
  }

  // Ask each question as it comes up. Stop talking and listening when the box closes.
  useEffect(() => {
    const start = setTimeout(() => ask(field), 0);
    return () => {
      clearTimeout(start);
      stopEverything();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const status: Record<Phase, string> = {
    speaking: "Asking...",
    listening: "Listening...",
    reading: "Reading your answer...",
    waiting: canListen ? "Tap Answer out loud, or type your answer." : "Type your answer.",
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border p-5" aria-live="polite">
      {props.fields.length > 1 && (
        <p className="text-muted-foreground">
          Question {index + 1} of {props.fields.length}
        </p>
      )}
      <Label htmlFor="voice-answer" className={props.hideQuestion ? "sr-only" : "text-lg font-medium"}>
        {VOICE_QUESTIONS[field]}
      </Label>
      <p className="text-muted-foreground">{status[phase]}</p>

      <Textarea
        id="voice-answer"
        value={text}
        maxLength={500}
        onChange={(event) => setText(event.target.value)}
        placeholder="Your answer shows up here. You can fix it before using it."
        className="min-h-20 text-lg md:text-lg"
      />
      {message && <p role="status">{message}</p>}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button
          onClick={() => submit(field, text)}
          disabled={text.trim() === "" || phase === "reading"}
          className="h-12 text-lg"
        >
          Use this answer
        </Button>
        {canListen && (
          <Button
            variant="outline"
            onClick={() => {
              stopEverything();
              tries.current = 0;
              setText("");
              setMessage(null);
              listen(field);
            }}
            disabled={phase === "listening" || phase === "reading"}
            className="h-12 text-lg"
          >
            Answer out loud
          </Button>
        )}
        <Button variant="outline" onClick={next} className="h-12 text-lg">
          Skip
        </Button>
      </div>
    </div>
  );
}
