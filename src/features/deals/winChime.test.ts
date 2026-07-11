// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { playWinChime } from "./winChime";

function fakeAudioContext() {
  const oscillators: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> =
    [];
  class FakeCtx {
    currentTime = 0;
    destination = {};
    createOscillator() {
      const osc = {
        type: "sine",
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(osc);
      return osc;
    }
    createGain() {
      return {
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      };
    }
    close = vi.fn();
  }
  return { FakeCtx, oscillators };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("playWinChime", () => {
  it("does not throw when no AudioContext is available", () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", undefined);
    expect(() => playWinChime()).not.toThrow();
  });

  it("schedules a cascade of tones when an AudioContext exists", () => {
    const { FakeCtx, oscillators } = fakeAudioContext();
    vi.stubGlobal("AudioContext", FakeCtx);
    playWinChime();
    expect(oscillators.length).toBeGreaterThan(1);
    for (const osc of oscillators) {
      expect(osc.start).toHaveBeenCalled();
      expect(osc.stop).toHaveBeenCalled();
    }
  });

  it("swallows a constructor that throws (autoplay blocked)", () => {
    class Boom {
      constructor() {
        throw new Error("autoplay blocked");
      }
    }
    vi.stubGlobal("AudioContext", Boom);
    expect(() => playWinChime()).not.toThrow();
  });
});
