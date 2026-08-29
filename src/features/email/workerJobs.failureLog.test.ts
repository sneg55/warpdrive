import { afterEach, expect, test, vi } from "vitest";
import { AppError } from "@/constants/errorIds";
import { syncFailureDetail } from "./syncFailureDetail";
import { syncJobError } from "./workerJobs";

afterEach(() => vi.restoreAllMocks());

test("the thrown error carries the Gmail status, so a failed job record names the cause", () => {
  const cause = new AppError("E_GMAIL_001", "gmail call failed", {
    status: 429,
    statusText: "Too Many Requests",
  });
  const thrown = syncJobError("acc-1", cause);
  expect(thrown.id).toBe("E_GMAIL_001");
  expect(thrown.context).toEqual({
    accountId: "acc-1",
    errorId: "E_GMAIL_001",
    cause: "gmail call failed",
    status: 429,
    statusText: "Too Many Requests",
  });
});

test("the failure is logged, because 4862 silent failures is how a dead mailbox goes unnoticed", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  const cause = new AppError("E_GMAIL_001", "gmail call failed", { status: 403 });
  syncJobError("acc-1", cause);
  expect(spy).toHaveBeenCalledWith("[email.sync] failed", {
    accountId: "acc-1",
    ...syncFailureDetail(cause),
  });
});

test("a schema failure never puts the offending message body in the log or the job record", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  const cause = new AppError("E_GMAIL_001", "gmail response failed schema validation", {
    body: { snippet: "Hi Blair" },
  });
  const thrown = syncJobError("acc-1", cause);
  expect(JSON.stringify(thrown.context)).not.toContain("Hi Blair");
  expect(JSON.stringify(spy.mock.calls)).not.toContain("Hi Blair");
});
