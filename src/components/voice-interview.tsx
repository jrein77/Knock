"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { listenForAnswer, type Listening } from "@/lib/mic";
import { VOICE_REPLIES, type VoiceAnswer, type VoiceField } from "@/lib/voice-questions";

// Talk mode for one question: asks it out loud, listens, and turns the answer into that field.
// - Grok's voice reads the question (/api/voice/speak), or the browser's voice if that fails.
// - The microphone (src/lib/mic.ts) listens the whole time, so the office can answer before the
//   question ends; the voice stops as soon as they start talking.
// - Grok turns the recording into text (/api/voice/transcribe), then into the field (/api/sign/parse).
// What it heard shows in a box that can be fixed or typed into, so it works without a microphone.

// The browser's voice, only if Grok's voice can't play. Prefers the more natural-sounding ones.
function browserSay(words: string, done: () => void) {
  if (!window.speechSynthesis) return done();
  const utterance = new SpeechSynthesisUtterance(words);
  const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.startsWith("en"));
  utterance.voice =
    voices.find((voice) => /natural|google us english|samantha|ava/i.test(voice.name)) ?? voices[0] ?? null;
  utterance.lang = "en-US";
  utterance.onend = done;
  utterance.onerror = done;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

// Speech that started while the voice was talking might just be the voice's own echo.
// It counts as the office's answer only if it has a word the voice wasn't saying.
function soundsLikeTheOffice(heard: string, beingSaid: string): boolean {
  const said = new Set(words(beingSaid));
  return words(heard).some((word) => !said.has(word));
}

// How long a pause means "I'm done". Visit times take thinking, so they get the longest.
const PAUSE_MS: Record<VoiceField, number> = {
  status: 1500,
  topics: 2200,
  visitSlots: 3500,
  redirectOptions: 2200,
  weeklyCap: 1500,
  blockedCompanies: 2200,
};
// How long to wait for a first word after the question, before waiting for a tap instead.
const FIRST_WORD_MS = 12_000;

type Phase = "speaking" | "listening" | "reading" | "waiting";

// After this many answers it couldn't use, it stops re-asking and waits for a tap.
const MAX_TRIES = 2;

export function VoiceAnswerBox<F extends VoiceField>(props: {
  field: F;
  question: string;
  onAnswer: (answer: VoiceAnswer[F]) => void;
}) {
  const { field, question } = props;
  const [phase, setPhase] = useState<Phase>("speaking");
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [canListen, setCanListen] = useState(true);
  const [level, setLevel] = useState(0); // how loud the office is, for the icon

  const audio = useRef<HTMLAudioElement | null>(null);
  const listening = useRef<Listening | null>(null);
  const talking = useRef(false); // the voice is saying something right now
  const talkedOver = useRef(false); // the office started answering while the voice was talking
  const beingSaid = useRef(question);
  const tries = useRef(0);
  // Bumped whenever this box stops or moves on, so late callbacks are ignored.
  const turn = useRef(0);

  function stopEverything() {
    turn.current += 1;
    talking.current = false;
    audio.current?.pause();
    window.speechSynthesis?.cancel();
    listening.current?.cancel();
    listening.current = null;
    setLevel(0);
  }

  // Stop the voice mid-sentence (the office started answering, or tapped Answer now).
  function stopTalking() {
    if (!talking.current) return;
    talking.current = false;
    audio.current?.pause();
    window.speechSynthesis?.cancel();
  }

  // Say one of Knock's fixed lines, then call `then` (unless this box stopped or was talked over).
  function speak(line: string, then: () => void) {
    const myTurn = turn.current;
    let finished = false;
    const done = () => {
      if (finished || myTurn !== turn.current) return;
      finished = true;
      const wasTalking = talking.current;
      talking.current = false;
      if (wasTalking) then();
    };
    talking.current = true;
    beingSaid.current = line;

    const player = new Audio(`/api/voice/speak?text=${encodeURIComponent(line)}`);
    audio.current = player;
    player.onended = done;
    player.onerror = () => myTurn === turn.current && !finished && browserSay(line, done);
    player.play().catch(() => myTurn === turn.current && !finished && browserSay(line, done));
    // Never get stuck if neither voice says it finished.
    setTimeout(done, 4000 + line.split(" ").length * 450);
  }

  // Start listening for the answer. Returns false if there's no microphone to use.
  async function listen(): Promise<boolean> {
    const myTurn = turn.current;
    talkedOver.current = false;
    try {
      const started = await listenForAnswer({
        pauseMs: PAUSE_MS[field],
        firstWordMs: FIRST_WORD_MS,
        voiceIsTalking: () => talking.current,
        onSpeech: () => {
          if (myTurn !== turn.current) return;
          talkedOver.current = talking.current;
          stopTalking(); // they're answering, so the voice stops
          setPhase("listening");
        },
        onLevel: (loudness) => myTurn === turn.current && setLevel(loudness),
        onDone: (recording) => {
          if (myTurn !== turn.current) return;
          listening.current = null;
          if (recording) hear(recording);
          else if (!talking.current) setPhase("waiting");
        },
      });
      if (myTurn !== turn.current) {
        started.cancel();
        return false;
      }
      listening.current = started;
      return true;
    } catch {
      if (myTurn === turn.current) {
        setCanListen(false);
        setMessage("The microphone is off. Allow it in the browser, or type your answer.");
      }
      return false;
    }
  }

  function ask(before = "") {
    const line = before ? `${before} ${question}` : question;
    setPhase("speaking");
    const ready = listen(); // the microphone gets ready while the question is asked
    speak(line, async () => {
      setPhase((await ready) ? "listening" : "waiting");
    });
  }

  // Couldn't use that answer: say why and ask again, a couple of times at most.
  function askAgain(why: string) {
    setMessage(why);
    tries.current += 1;
    if (tries.current < MAX_TRIES) ask(why);
    else setPhase("waiting");
  }

  // The office finished talking: turn the recording into text, then into the answer.
  async function hear(recording: Blob) {
    const myTurn = turn.current;
    setPhase("reading");
    setMessage(null);
    try {
      const response = await fetch("/api/voice/transcribe", {
        method: "POST",
        headers: { "Content-Type": "audio/wav" },
        body: recording,
      });
      const result = await response.json();
      if (myTurn !== turn.current) return;
      if (!response.ok) {
        setMessage(result.error);
        setPhase("waiting");
        return;
      }
      const heard = (result.text as string) ?? "";
      // Just the voice's own echo: keep listening for the real answer.
      if (talkedOver.current && !soundsLikeTheOffice(heard, beingSaid.current)) {
        if (await listen()) setPhase("listening");
        else setPhase("waiting");
        return;
      }
      setText(heard);
      if (!heard) return askAgain(VOICE_REPLIES.missed);
      submit(heard);
    } catch {
      if (myTurn !== turn.current) return;
      setMessage("Couldn't hear that right now. You can type your answer.");
      setPhase("waiting");
    }
  }

  async function submit(answerText: string) {
    stopEverything();
    const myTurn = turn.current;
    setPhase("reading");
    setMessage(null);
    try {
      const response = await fetch("/api/sign/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, text: answerText }),
      });
      const result = await response.json();
      if (myTurn !== turn.current) return;

      if (result.offTopic) return askAgain(VOICE_REPLIES.offTopic);
      if (!response.ok) {
        setMessage(result.error);
        setPhase("waiting");
        return;
      }
      if (result.answer === null) return askAgain(VOICE_REPLIES.missed);

      const answer = result.answer as VoiceAnswer[F];
      setPhase("speaking");
      speak(VOICE_REPLIES.gotIt, () => props.onAnswer(answer));
    } catch {
      if (myTurn !== turn.current) return;
      setMessage("Couldn't read that right now. Fill it in yourself instead.");
      setPhase("waiting");
    }
  }

  // Tap to answer: stop the voice if it's talking, and start listening if it isn't already.
  async function answerNow() {
    if (phase === "speaking" && listening.current) {
      stopTalking();
      setPhase("listening");
      return;
    }
    stopEverything();
    tries.current = 0;
    setText("");
    setMessage(null);
    setPhase("listening");
    if (!(await listen())) setPhase("waiting");
  }

  // Ask as soon as the box opens. Stop talking and listening when it closes.
  useEffect(() => {
    const start = setTimeout(() => ask(), 0);
    return () => {
      clearTimeout(start);
      stopEverything();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, question]);

  const status: Record<Phase, string> = {
    speaking: canListen ? "Asking... you can start answering anytime." : "Asking...",
    listening: "Listening... take your time.",
    reading: "Getting your answer...",
    waiting: canListen ? "Tap Answer out loud, or type your answer." : "Type your answer below.",
  };

  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <div className="flex items-center gap-3">
        <KnockMark busy={phase === "speaking" || phase === "reading"} level={phase === "listening" ? level : 0} />
        <p className="text-muted-foreground">{message ?? status[phase]}</p>
      </div>

      <Label htmlFor={`answer-${field}`} className="sr-only">
        Your answer
      </Label>
      <Textarea
        id={`answer-${field}`}
        value={text}
        maxLength={500}
        onChange={(event) => setText(event.target.value)}
        placeholder="Your answer shows up here. You can fix it before using it."
        className="min-h-20 text-lg md:text-lg"
      />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {phase === "listening" ? (
          <Button onClick={() => listening.current?.finish()} className="h-12 text-lg">
            I&apos;m done
          </Button>
        ) : (
          <Button
            onClick={() => submit(text)}
            disabled={text.trim() === "" || phase === "reading"}
            className="h-12 text-lg"
          >
            Use this answer
          </Button>
        )}
        {canListen && (
          <Button
            variant="outline"
            onClick={answerNow}
            disabled={phase === "listening" || phase === "reading"}
            className="h-12 text-lg"
          >
            {phase === "speaking" ? "Answer now" : "Answer out loud"}
          </Button>
        )}
      </div>
    </div>
  );
}

// The Knock app icon (same as src/app/icon.svg). It pulses while the voice talks or thinks,
// and grows with the office's voice while it listens, so they can see they're being heard.
function KnockMark({ busy, level }: { busy: boolean; level: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden
      data-busy={busy}
      style={{ transform: `scale(${1 + level * 0.35})` }}
      className="voice-mark size-6 shrink-0 transition-transform duration-75"
    >
      <rect width="64" height="64" rx="14" fill="#1c1917" />
      <text x="8" y="50" fill="#fff" fontFamily="Arial Black, Arial, sans-serif" fontSize="40" fontWeight="900">
        K
      </text>
      <g stroke="#fff" strokeWidth="5" strokeLinecap="round">
        <line x1="44" y1="17" x2="46" y2="8" />
        <line x1="48" y1="22" x2="55" y2="15" />
        <line x1="50" y1="29" x2="58" y2="28" />
      </g>
    </svg>
  );
}
