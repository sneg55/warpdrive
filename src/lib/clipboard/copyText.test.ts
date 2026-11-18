import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./copyText";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("copyText", () => {
  it("writes the text and returns ok", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const r = await copyText("https://x.test/a");
    expect(writeText).toHaveBeenCalledWith("https://x.test/a");
    expect(r.ok).toBe(true);
  });

  it("returns an error value when the browser denies the write", async () => {
    const denied = new DOMException("Write permission denied.", "NotAllowedError");
    vi.stubGlobal("navigator", { clipboard: { writeText: () => Promise.reject(denied) } });
    const r = await copyText("x");
    expect(r).toEqual({
      ok: false,
      error: { reason: "denied", message: "Write permission denied." },
    });
  });

  it("returns an error value when the clipboard API is missing", async () => {
    vi.stubGlobal("navigator", {});
    const r = await copyText("x");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.reason).toBe("unavailable");
  });

  it("returns an error value for any other failure", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: () => Promise.reject(new Error("boom")) },
    });
    const r = await copyText("x");
    expect(r).toEqual({ ok: false, error: { reason: "failed", message: "boom" } });
  });
});
