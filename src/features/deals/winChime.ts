const COIN_PITCHES = [1318, 1174, 987, 880, 784, 659] as const;
const PING_SPACING = 0.07;
const PING_DURATION = 0.16;

type AudioContextCtor = new () => AudioContext;

function resolveAudioContextCtor(): AudioContextCtor | undefined {
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
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(0.2, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + PING_DURATION);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + PING_DURATION);
    });
  } catch {}
}
