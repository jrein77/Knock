// The microphone for Talk mode. Opened once and kept open while the questions are being asked,
// so there's no wait to start listening after each question. The browser's own echo cancellation,
// noise suppression and automatic gain are on, so a normal speaking voice from arm's length works.
//
// It listens for speech by loudness: speech starts when the level stays above the room's noise for a
// moment, and the answer ends after a pause. What was said is recorded as a small WAV file, which
// /api/voice/transcribe turns into text.

type Mic = {
  context: AudioContext;
  stream: MediaStream;
  processor: ScriptProcessorNode;
};

let mic: Promise<Mic> | null = null;
let onAudio: ((samples: Float32Array, sampleRate: number) => void) | null = null;

// Open the microphone (asks permission the first time). Safe to call again; it opens only once.
export function openMic(): Promise<Mic> {
  if (!mic) {
    mic = (async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      const context = new AudioContext();
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      // Hands us the audio in small blocks (about 40 ms each). Its output stays silent.
      const processor = context.createScriptProcessor(2048, 1, 1);
      processor.onaudioprocess = (event) => {
        event.outputBuffer.getChannelData(0).fill(0);
        onAudio?.(new Float32Array(event.inputBuffer.getChannelData(0)), context.sampleRate);
      };
      source.connect(processor);
      processor.connect(context.destination);
      return { context, stream, processor };
    })();
    mic.catch(() => (mic = null));
  }
  return mic;
}

// Turn the microphone off (the browser's mic light goes out).
export function closeMic() {
  const closing = mic;
  mic = null;
  onAudio = null;
  closing
    ?.then(({ context, stream, processor }) => {
      processor.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      context.close();
    })
    .catch(() => {});
}

export type Listening = {
  finish: () => void; // "I'm done": use what was heard so far
  cancel: () => void; // stop without an answer
};

const PREROLL_MS = 400; // keep a little audio from just before speech starts, so first words aren't cut
const START_MS = 200; // this much steady sound counts as speech starting
const START_MS_OVER_VOICE = 350; // stricter while the voice is talking, so its echo doesn't count
const MAX_MS = 45_000; // longest single answer
const PROGRESS_MS = 1200; // how often to hand over the answer so far, so it can show while they talk

// Listen for one answer. Calls `onSpeech` when the office starts talking, `onLevel` with how loud
// they are (0 to 1, for the little meter), `onProgress` every so often with the recording so far
// (to show the words as they come), and `onDone` with the recording, or null if they said nothing.
export async function listenForAnswer(options: {
  pauseMs: number; // this much quiet after speaking means they're done
  firstWordMs: number; // give up after this long with no speech (not counting while the voice talks)
  voiceIsTalking: () => boolean;
  onSpeech: () => void;
  onLevel: (level: number) => void;
  onProgress: (recordingSoFar: Blob) => void;
  onDone: (recording: Blob | null) => void;
}): Promise<Listening> {
  await openMic();

  let noise = 0.01; // the room's background level, learned as we go
  let speaking = false;
  let loudMs = 0;
  let quietMs = 0;
  let waitedMs = 0;
  let spokenMs = 0;
  let sinceProgressMs = 0;
  let rate = 48_000;
  let preroll: Float32Array[] = [];
  let recorded: Float32Array[] = [];
  let over = false;

  // Stop hearing audio, but only if a newer answer hasn't taken over the microphone already.
  function detach() {
    over = true;
    if (onAudio === hear) onAudio = null;
  }

  function end(withRecording: boolean) {
    if (over) return;
    detach();
    options.onLevel(0);
    options.onDone(withRecording && recorded.length > 0 ? toWav(recorded, rate) : null);
  }

  const hear = (samples: Float32Array, sampleRate: number) => {
    rate = sampleRate;
    const blockMs = (samples.length / sampleRate) * 1000;
    const level = rms(samples);
    const overVoice = options.voiceIsTalking();
    const threshold = Math.max(0.012, noise * 2.5) * (overVoice ? 2 : 1);
    options.onLevel(Math.min(1, level / (threshold * 3)));

    if (!speaking) {
      preroll.push(samples);
      while (preroll.length * blockMs > PREROLL_MS) preroll.shift();
      if (level > threshold) {
        loudMs += blockMs;
      } else {
        loudMs = 0;
        noise = noise * 0.95 + level * 0.05;
      }
      if (loudMs >= (overVoice ? START_MS_OVER_VOICE : START_MS)) {
        speaking = true;
        recorded = [...preroll];
        preroll = [];
        options.onSpeech();
        return;
      }
      if (!overVoice) waitedMs += blockMs;
      if (waitedMs >= options.firstWordMs) end(false);
      return;
    }

    recorded.push(samples);
    spokenMs += blockMs;
    sinceProgressMs += blockMs;
    if (sinceProgressMs >= PROGRESS_MS) {
      sinceProgressMs = 0;
      options.onProgress(toWav(recorded, rate));
    }
    quietMs = level > threshold * 0.7 ? 0 : quietMs + blockMs;
    if (quietMs >= options.pauseMs || spokenMs >= MAX_MS) end(true);
  };
  onAudio = hear;

  return {
    finish: () => end(speaking),
    cancel: detach,
  };
}

function rms(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

// The recording as a 16 kHz mono 16-bit WAV file: small to upload, and plenty for speech.
function toWav(blocks: Float32Array[], sampleRate: number): Blob {
  const all = new Float32Array(blocks.reduce((total, block) => total + block.length, 0));
  let offset = 0;
  for (const block of blocks) {
    all.set(block, offset);
    offset += block.length;
  }

  const outRate = 16_000;
  const step = sampleRate / outRate;
  const length = Math.floor(all.length / step);
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  const text = (at: number, value: string) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));

  text(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true); // format block size
  view.setUint16(20, 1, true); // plain PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, outRate, true);
  view.setUint32(28, outRate * 2, true); // bytes per second
  view.setUint16(32, 2, true); // bytes per sample
  view.setUint16(34, 16, true); // bits per sample
  text(36, "data");
  view.setUint32(40, length * 2, true);

  for (let i = 0; i < length; i++) {
    // Average the samples that make up each output sample, then clip to 16 bits.
    const from = Math.floor(i * step);
    const to = Math.max(from + 1, Math.floor((i + 1) * step));
    let sum = 0;
    for (let j = from; j < to; j++) sum += all[j];
    const sample = Math.max(-1, Math.min(1, sum / (to - from)));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}
