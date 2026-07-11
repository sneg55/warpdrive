import { describe, expect, it } from "vitest";
import { gmailMessageSchema, historyListSchema, pushPayloadSchema } from "./gmailSchemas";

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
  it("decodes a Pub/Sub push envelope (drop-in adapter)", () => {
    const data = Buffer.from(
      JSON.stringify({ emailAddress: "a@x.com", historyId: "500" }),
    ).toString("base64");
    const parsed = pushPayloadSchema.parse({ message: { data }, subscription: "s" });
    expect(parsed.emailAddress).toBe("a@x.com");
    expect(parsed.historyId).toBe("500");
  });
});
