import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./workerJobs.ts", import.meta.url), "utf8");

describe("boot enqueue", () => {
  it("schedules every mailbox that is not switched off, not only the healthy ones", () => {
    // It selected status='connected'. recoverFrom404 sets status='error' on an expired cursor, and
    // both sync.ts and resync.ts only skip 'disconnected', so an errored mailbox is meant to keep
    // ticking and recover. Excluding it here meant a worker restart while its queue happened to be
    // empty dropped that mailbox from sync with nothing to re-add it.
    expect(source).toMatch(/status\s*<>\s*'disconnected'/);
    expect(source).not.toMatch(/status='connected'/);
  });
});
