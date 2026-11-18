import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLIPBOARD_STRINGS } from "@/constants/clipboard";

const success = vi.fn();
const error = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (...a: unknown[]) => success(...a), error: (...a: unknown[]) => error(...a) },
}));

import { copyWithToast } from "./copyWithToast";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("copyWithToast", () => {
  it("confirms a successful copy", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: () => Promise.resolve() } });
    const r = await copyWithToast("https://x.test/a");
    expect(r.ok).toBe(true);
    expect(success).toHaveBeenCalledWith(CLIPBOARD_STRINGS.copied);
    expect(error).not.toHaveBeenCalled();
  });

  it("tells the user to copy manually and shows the text when the write fails", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: () => Promise.reject(new DOMException("no", "NotAllowedError")) },
    });
    const r = await copyWithToast("https://x.test/a");
    expect(r.ok).toBe(false);
    expect(success).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      CLIPBOARD_STRINGS.failedManual,
      expect.objectContaining({ description: "https://x.test/a" }),
    );
  });
});
