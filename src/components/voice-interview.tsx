"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { VOICE_REPLIES, type VoiceAnswer, type VoiceField } from "@/lib/voice-questions";

// Talk mode for one question: asks it out loud, listens, and turns the answer into that field.
// Grok's voice reads the question (/api/voice/speak), falling back to the browser's own voice.
// The browser listens (SpeechRecognition), and /api/sign/parse reads the answer.
// It listens while it talks, so the office can start answering without waiting for the end.
// What it hears shows in a box that can be fixed or typed into, so it works without a microphone.

// The browser's speech-to-text (Chrome, Edge, Safari). Just the parts used here.
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function makeRecognition(): Recognition | null {
  const w = window as unknown as Record<string, (new () => Recognition) | undefined>;
  const Speech = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Speech ? new Speech() : null;
}

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

// While the voice is talking, the microphone can pick the voice up too. A bit of speech only counts
// as the office talking over it if it has at least two words that aren't in what the voice is saying.
function isOfficeTalking(heard: string, beingSaid: string): boolean {
  const said = new Set(words(beingSaid));
  return words(heard).filter((word) => !said.has(word)).length >= 2;
}

// How long a pause means "I'm done". Visit times take thinking, so they get the longest.
const PAUSE_MS: Record<VoiceField, number> = {
  status: 1800,
  topics: 2800,
  visitSlots: 4500,
  redirectOptions: 2800,
  weeklyCap: 1800,
  blockedCompanies: 2800,
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

  const recognition = useRef<Recognition | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const heard = useRef("");
  const talking = useRef(false); // the voice is saying something right now
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tries = useRef(0);
  // Bumped whenever this box stops, so late speech callbacks are ignored.
  const turn = useRef(0);

  function clearPauseTimer() {
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
    pauseTimer.current = null;
  }

  function stopEverything() {
    turn.current += 1;
    clearPauseTimer();
    talking.current = false;
    audio.current?.pause();
    window.speechSynthesis?.cancel();
    recognition.current?.abort();
  }

  // Stop the voice mid-sentence (the office started answering, or tapped Answer now).
  function stopTalking() {
    if (!talking.current) return;
    talking.current = false;
    audio.current?.pause();
    window.speechSynthesis?.cancel();
    setPhase("listening");
  }

  // Wait this long, then take what was heard as the answer (or give up if nothing was).
  function waitThenFinish(ms: number) {
    clearPauseTimer();
    pauseTimer.current = setTimeout(() => recognition.current?.stop(), ms);
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
    setPhase("speaking");

    const player = new Audio(`/api/voice/speak?text=${encodeURIComponent(line)}`);
    audio.current = player;
    player.onended = done;
    player.onerror = () => myTurn === turn.current && !finished && browserSay(line, done);
    player.play().catch(() => myTurn === turn.current && !finished && browserSay(line, done));
    // Never get stuck if neither voice says it finished.
    setTimeout(done, 4000 + line.split(" ").length * 450);
  }

  // Listen for the answer. Starts while the voice is still asking, so it can be talked over.
  function listen(beingSaid: string) {
    const speech = makeRecognition();
    if (!speech) {
      setCanListen(false);
      return false;
    }
    const myTurn = turn.current;
    const ignored = new Set<number>(); // bits that were just the voice itself
    speech.lang = "en-US";
    speech.continuous = true; // keeps listening through pauses; the pause timer decides when it's done
    speech.interimResults = true;
    heard.current = "";

    speech.onresult = (event) => {
      if (myTurn !== turn.current) return;
      const parts = Array.from(event.results).map((result) => result[0].transcript);
      if (talking.current) {
        parts.forEach((part, index) => {
          if (!isOfficeTalking(part, beingSaid)) ignored.add(index);
        });
      }
      const answer = parts
        .filter((_, index) => !ignored.has(index))
        .join(" ")
        .trim();
      if (!answer) return;
      stopTalking(); // they're answering, so the voice stops
      heard.current = answer;
      setText(answer);
      waitThenFinish(PAUSE_MS[field]);
    };
    speech.onerror = (event) => {
      if (myTurn !== turn.current || event.error === "no-speech" || event.error === "aborted") return;
      setMessage("Couldn't hear that. Check the microphone, or type your answer.");
    };
    speech.onend = () => {
      if (myTurn !== turn.current) return;
      clearPauseTimer();
      if (heard.current) submit(heard.current);
      else if (!talking.current) setPhase("waiting");
    };
    recognition.current = speech;
    speech.start();
    return true;
  }

  function ask(before = "") {
    const line = before ? `${before} ${question}` : question;
    const listening = listen(line);
    speak(line, () => {
      if (!listening) return setPhase("waiting");
      setPhase("listening");
      if (!heard.current) waitThenFinish(FIRST_WORD_MS);
    });
  }

  // Couldn't use that answer: say why and ask again, a couple of times at most.
  function askAgain(why: string) {
    setMessage(why);
    tries.current += 1;
    if (tries.current < MAX_TRIES) ask(why);
    else setPhase("waiting");
  }

  async function submit(answerText: string) {
    // A new turn first, so the listening that's stopping now can't send the answer again.
    turn.current += 1;
    const myTurn = turn.current;
    recognition.current?.abort();
    clearPauseTimer();
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
      speak(VOICE_REPLIES.gotIt, () => props.onAnswer(answer));
    } catch {
      if (myTurn !== turn.current) return;
      setMessage("Couldn't read that right now. Fill it in yourself instead.");
      setPhase("waiting");
    }
  }

  // Tap to answer: stop the voice if it's talking, and start listening if it isn't already.
  function answerNow() {
    if (phase === "speaking" && recognition.current) {
      stopTalking();
      waitThenFinish(FIRST_WORD_MS);
      return;
    }
    stopEverything();
    tries.current = 0;
    setText("");
    setMessage(null);
    if (listen(question)) {
      setPhase("listening");
      waitThenFinish(FIRST_WORD_MS);
    } else {
      setPhase("waiting");
    }
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
    reading: "Reading your answer...",
    waiting: canListen ? "Tap Answer out loud, or type your answer." : "Type your answer below.",
  };

  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <div className="flex items-center gap-3">
        <KnockMark busy={phase !== "waiting"} />
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
          <Button onClick={() => recognition.current?.stop()} className="h-12 text-lg">
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

// The Knock app icon (same as src/app/icon.svg). It pulses while the voice is talking or listening.
function KnockMark({ busy }: { busy: boolean }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden data-busy={busy} className="voice-mark size-6 shrink-0">
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
