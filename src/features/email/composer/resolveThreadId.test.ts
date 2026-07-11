import { expect, it } from "vitest";
import { resolveComposerThreadId } from "./resolveThreadId";

it("prefers an explicit threadId, then a resumed draft's, then inbox context, else undefined", () => {
  expect(resolveComposerThreadId("t1", "t2", { kind: "inbox", threadId: "t3" })).toBe("t1");
  // A resumed reply draft must keep its thread linkage (else send forks a new thread and the
  // next autosave nulls the draft's thread_id).
  expect(resolveComposerThreadId(undefined, "t2", undefined)).toBe("t2");
  expect(resolveComposerThreadId(undefined, null, { kind: "inbox", threadId: "t3" })).toBe("t3");
  expect(resolveComposerThreadId(undefined, null, undefined)).toBeUndefined();
  expect(
    resolveComposerThreadId(undefined, undefined, { kind: "deal", dealId: "d1" }),
  ).toBeUndefined();
});
