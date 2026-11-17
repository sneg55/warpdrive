import { describe, expect, it } from "vitest";
import { gmailMessageSchema, historyListSchema } from "./gmailSchemas";

describe("gmail response schemas", () => {
  it("parses a history.list page with nextPageToken", () => {
    const parsed = historyListSchema.parse({
      historyId: "4567",
      nextPageToken: "pg2",
      history: [{ messagesAdded: [{ message: { id: "m1", threadId: "t1" } }] }],
    });
    expect(parsed.historyId).toBe("4567");
    expect(parsed.history[0]?.messagesAdded?.[0]?.message.id).toBe("m1");
  });
  it("defaults missing history array to empty (no deltas page)", () => {
    expect(historyListSchema.parse({ historyId: "99" }).history).toEqual([]);
  });
  it("rejects a message payload missing the id", () => {
    expect(() => gmailMessageSchema.parse({ threadId: "t1" })).toThrow();
  });
});
