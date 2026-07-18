import { describe, expect, it } from "vitest";
import { computeStatus } from "./computeStatus";
import type { ReleaseRow } from "./types";

const row: ReleaseRow = {
  latestTag: "v1.7.0",
  releaseUrl: "https://github.com/sneg55/warpdrive/releases/tag/v1.7.0",
  releaseNotes: "## What's new\n- stuff",
  fetchedAt: new Date("2026-07-18T12:00:00.000Z"),
};

describe("computeStatus", () => {
  it("reports disabled with no release data when the check is off", () => {
    const s = computeStatus("1.6.0", row, true);
    expect(s).toEqual({
      current: "1.6.0",
      latest: null,
      releaseUrl: null,
      releaseNotes: null,
      updateAvailable: null,
      checkedAt: null,
      disabled: true,
    });
  });

  it("returns the current version with null fields when no row is cached yet", () => {
    const s = computeStatus("1.6.0", null, false);
    expect(s.current).toBe("1.6.0");
    expect(s.latest).toBeNull();
    expect(s.updateAvailable).toBeNull();
    expect(s.checkedAt).toBeNull();
    expect(s.disabled).toBe(false);
  });

  it("marks an update available when the cached tag is newer", () => {
    const s = computeStatus("1.6.0", row, false);
    expect(s.latest).toBe("v1.7.0");
    expect(s.releaseUrl).toBe(row.releaseUrl);
    expect(s.releaseNotes).toBe(row.releaseNotes);
    expect(s.updateAvailable).toBe(true);
    expect(s.checkedAt).toBe("2026-07-18T12:00:00.000Z");
  });

  it("reports no update when the cached tag matches the current version", () => {
    expect(computeStatus("1.7.0", row, false).updateAvailable).toBe(false);
  });

  it("reports updateAvailable null for a dev build even with a cached tag", () => {
    const s = computeStatus("dev", row, false);
    expect(s.latest).toBe("v1.7.0");
    expect(s.updateAvailable).toBeNull();
  });
});
