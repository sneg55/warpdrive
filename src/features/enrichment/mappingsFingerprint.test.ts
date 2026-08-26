import { describe, expect, it } from "vitest";
import { mappingsFingerprint } from "./mappingsFingerprint";
import type { ResolvedMapping } from "./types";

const builtin = (canonicalKey: string, targetKey: string): ResolvedMapping => ({
  canonicalKey,
  label: targetKey,
  targetKind: "builtin",
  targetKey,
  targetFieldDefId: null,
});

const custom = (canonicalKey: string, defId: string): ResolvedMapping => ({
  canonicalKey,
  label: "Custom",
  targetKind: "custom",
  targetKey: null,
  targetFieldDefId: defId,
});

describe("mappingsFingerprint", () => {
  it("changes when a canonical key is repointed at another target", () => {
    const before = mappingsFingerprint([builtin("org.industry", "industry")]);
    const after = mappingsFingerprint([custom("org.industry", "def-1")]);
    expect(before).not.toBe(after);
  });

  it("changes when a custom target is swapped for a different definition", () => {
    expect(mappingsFingerprint([custom("org.industry", "def-1")])).not.toBe(
      mappingsFingerprint([custom("org.industry", "def-2")]),
    );
  });

  it("changes when a mapping is added or removed", () => {
    const one = mappingsFingerprint([builtin("org.industry", "industry")]);
    const two = mappingsFingerprint([
      builtin("org.industry", "industry"),
      builtin("org.domain", "domain"),
    ]);
    expect(one).not.toBe(two);
  });

  it("does not depend on the order the rows came back in", () => {
    const a = mappingsFingerprint([
      builtin("org.industry", "industry"),
      builtin("org.domain", "domain"),
    ]);
    const b = mappingsFingerprint([
      builtin("org.domain", "domain"),
      builtin("org.industry", "industry"),
    ]);
    expect(a).toBe(b);
  });

  it("ignores the label, which is presentation rather than a target", () => {
    const a = mappingsFingerprint([{ ...builtin("org.industry", "industry"), label: "Industry" }]);
    const b = mappingsFingerprint([{ ...builtin("org.industry", "industry"), label: "Sector" }]);
    expect(a).toBe(b);
  });

  it("cannot be forged by a value that contains a delimiter", () => {
    const smuggled = mappingsFingerprint([builtin("org.industry", "industry|org.domain=x")]);
    const genuine = mappingsFingerprint([
      builtin("org.industry", "industry"),
      builtin("org.domain", "x"),
    ]);
    expect(smuggled).not.toBe(genuine);
  });

  it("is stable for an empty mapping set", () => {
    expect(mappingsFingerprint([])).toBe(mappingsFingerprint([]));
  });
});
