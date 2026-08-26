// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  APPEARANCE_COOKIE,
  APPEARANCE_DEFAULT,
  appearanceCookieValue,
  appearanceScript,
  DARK_CLASS,
  isDarkAppearance,
  parseAppearance,
  readAppearanceCookie,
} from "./appearance";

describe("parseAppearance", () => {
  it("accepts the three shipped values", () => {
    expect(parseAppearance("day")).toBe("day");
    expect(parseAppearance("night")).toBe("night");
    expect(parseAppearance("system")).toBe("system");
  });

  it("falls back to the default for anything else", () => {
    expect(parseAppearance(null)).toBe(APPEARANCE_DEFAULT);
    expect(parseAppearance(undefined)).toBe(APPEARANCE_DEFAULT);
    expect(parseAppearance("dark")).toBe(APPEARANCE_DEFAULT);
  });

  it("defaults to system, so a fresh account follows the OS", () => {
    expect(APPEARANCE_DEFAULT).toBe("system");
  });
});

describe("readAppearanceCookie", () => {
  it("finds the value among unrelated cookies", () => {
    expect(readAppearanceCookie(`csrf=abc; ${APPEARANCE_COOKIE}=night; nav=1`)).toBe("night");
  });

  it("does not match a cookie whose name merely ends with the key", () => {
    expect(readAppearanceCookie(`x_${APPEARANCE_COOKIE}=night`)).toBe(APPEARANCE_DEFAULT);
  });

  it("falls back to the default when absent or empty", () => {
    expect(readAppearanceCookie("")).toBe(APPEARANCE_DEFAULT);
    expect(readAppearanceCookie("csrf=abc")).toBe(APPEARANCE_DEFAULT);
  });
});

describe("appearanceCookieValue", () => {
  it("is path-scoped to the whole app and long-lived so the class survives a hard reload", () => {
    const c = appearanceCookieValue("night");
    expect(c).toContain(`${APPEARANCE_COOKIE}=night`);
    expect(c).toContain("path=/");
    expect(c).toContain("SameSite=Lax");
    expect(c).toMatch(/max-age=\d+/i);
  });
});

describe("isDarkAppearance", () => {
  it("day is never dark and night is always dark, whatever the OS says", () => {
    expect(isDarkAppearance("day", true)).toBe(false);
    expect(isDarkAppearance("night", false)).toBe(true);
  });

  it("system follows the OS", () => {
    expect(isDarkAppearance("system", true)).toBe(true);
    expect(isDarkAppearance("system", false)).toBe(false);
  });
});

// The no-flash script is inlined before hydration, so it has to work from raw document.cookie
// and matchMedia alone. Running the real source here is the only way to know it does.
describe("appearanceScript", () => {
  function runScript(cookie: string, prefersDark: boolean): void {
    document.documentElement.className = "";
    for (const c of document.cookie.split(";")) {
      const name = c.split("=")[0]?.trim() ?? "";
      if (name !== "") document.cookie = `${name}=; max-age=0; path=/`;
    }
    if (cookie !== "") document.cookie = cookie;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: prefersDark, addEventListener: vi.fn() })),
    );
    // biome-ignore lint/security/noGlobalEval: running the real inlined source is the point of the test
    eval(appearanceScript());
  }

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds the dark class when the stored choice is night", () => {
    runScript(`${APPEARANCE_COOKIE}=night`, false);
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
  });

  it("leaves the dark class off when the stored choice is day, even on a dark OS", () => {
    runScript(`${APPEARANCE_COOKIE}=day`, true);
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);
  });

  it("follows the OS when there is no stored choice", () => {
    runScript("", true);
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
    runScript("", false);
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);
  });

  it("carries no closing script tag that would break out of the inline block", () => {
    expect(appearanceScript()).not.toContain("</script");
  });
});
