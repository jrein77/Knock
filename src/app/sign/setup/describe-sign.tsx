"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RedirectAction, Status, VisitSlot } from "@/lib/types";

// What /api/sign/parse sends back. null means the doctor didn't mention it.
export type ParsedSign = {
  status: Status | null;
  topics: string[] | null;
  topicsNote: string | null;
  visitSlots: VisitSlot[] | null;
  weeklyCap: number | null;
  redirectOptions: RedirectAction[] | null;
};

export type Mode = "type" | "talk";

// The browser's own speech-to-text (Chrome, Edge, Safari). Just the parts used here.
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

// "Say it in your own words": one sentence about rep visits fills in the whole draft.
// Talk mode listens and writes what it hears into the box, where it can be fixed before
// sending. Type mode is the same box without the microphone.
export function DescribeSign(props: { mode: Mode; onFilled: (parsed: ParsedSign) => void }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canListen, setCanListen] = useState(true);
  const recognition = useRef<Recognition | null>(null);
  const textBefore = useRef("");

  // Stop listening when switching to Type or leaving the page.
  useEffect(() => {
    if (props.mode === "type") recognition.current?.stop();
    return () => recognition.current?.stop();
  }, [props.mode]);

  function startListening() {
    const speech = makeRecognition();
    if (!speech) {
      setCanListen(false);
      return;
    }
    speech.lang = "en-US";
    speech.continuous = true;
    speech.interimResults = true;
    textBefore.current = text.trim();
    speech.onresult = (event) => {
      const heard = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join("");
      setText([textBefore.current, heard.trim()].filter(Boolean).join(" "));
    };
    speech.onend = () => setListening(false);
    speech.onerror = () => {
      setListening(false);
      setError("Couldn't hear that. Check the microphone, or type it instead.");
    };
    recognition.current = speech;
    setError(null);
    setListening(true);
    speech.start();
  }

  async function fillIn() {
    recognition.current?.stop();
    setReading(true);
    setError(null);
    try {
      const response = await fetch("/api/sign/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      props.onFilled(result as ParsedSign);
      setText("");
    } catch (caught) {
      setError((caught as Error).message || "Couldn't read that right now. Use the buttons below.");
    } finally {
      setReading(false);
    }
  }

  const talk = props.mode === "talk";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border p-5">
      <Label htmlFor="describe" className="text-lg">
        {talk ? "Tell us about rep visits, out loud" : "Or say it all in your own words"}
      </Label>
      <p className="text-muted-foreground">
        For example: “No more statin reps. Happy to hear about diabetes. Tuesdays at lunch work,
        two a week at most.”
      </p>

      {talk && canListen && (
        <Button
          variant={listening ? "default" : "outline"}
          onClick={() => (listening ? recognition.current?.stop() : startListening())}
          className="h-14 text-lg"
        >
          {listening ? "Listening... tap to stop" : "Start talking"}
        </Button>
      )}
      {talk && !canListen && (
        <p role="alert">This browser can&apos;t listen. Type it in the box instead.</p>
      )}

      <Textarea
        id="describe"
        value={text}
        maxLength={1000}
        onChange={(event) => setText(event.target.value)}
        placeholder={talk ? "What you say shows up here. You can fix it before sending." : ""}
        className="min-h-24 text-lg md:text-lg"
      />
      <Button
        onClick={fillIn}
        disabled={text.trim() === "" || reading}
        className="h-14 text-lg"
      >
        {reading ? "Reading..." : "Fill in my sign"}
      </Button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
