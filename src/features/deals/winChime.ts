// Synthesized "falling coins" chime played when a deal is marked Won (personal preference
// ui.winSound). No audio asset: a short cascade of descending metallic pings is scheduled on the
// Web Audio graph. Entirely best-effort: if the browser has no AudioContext, or autoplay policy
// blocks it, we silently do nothing. A celebratory sound must never surface an error.

// Descending "coin drop" pitches (Hz). Each ping is a brief triangle tone with a fast decay so the
// run reads as coins tumbling rather than a chord.
const COIN_PITCHES = [1318, 1174, 987, 880, 784, 659] as const;
const PING_SPACING = 0.07; // seconds between successive pings
const PING_DURATION = 0.16; // seconds each ping rings before it decays

type AudioContextCtor = new () => AudioContext;

function resolveAudioContextCtor(): AudioContextCtor | undefined {
  // The DOM lib types `AudioContext` as always defined, but it is absent in some browsers/SSR and
  // stubbed away in tests, so read it through a partial index type that admits undefined.
  const w = globalThis as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext;
}

export function playWinChime(): void {
  try {
    const Ctor = resolveAudioContextCtor();
    if (Ctor === undefined) return;
    const ctx = new Ctor();
    const start = ctx.currentTime;
    COIN_PITCHES.forEach((pitch, i) => {
      const at = start + i * PING_SPACING;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(pitch, at);
      // Quick attack, exponential decay: a plucked coin-ping envelope.
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(0.2, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + PING_DURATION);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + PING_DURATION);
    });
  } catch {
    // No audio hardware, or autoplay blocked before a user gesture: ignore.
  }
}
