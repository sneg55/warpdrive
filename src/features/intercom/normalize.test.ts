import { describe, expect, it } from "vitest";
import { matchableEmail, normalizeConversation } from "./normalize";
import type { IntercomConversation } from "./types";

function part(
  id: string,
  partType: string,
  createdAt: number,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    part_type: partType,
    body: `<p>${id} body</p>`,
    created_at: createdAt,
    author: { type: "admin", name: `Agent ${id}`, email: null },
    redacted: false,
    ...extra,
  };
}

function conversation(overrides: Partial<IntercomConversation> = {}): IntercomConversation {
  return {
    id: "c1",
    title: null,
    state: "open",
    createdAt: 1_000,
    updatedAt: 9_000,
    source: {
      id: "s1",
      body: "<p>My invoice &amp; my <b>order</b></p>",
      author: { type: "user", name: "Pat Customer", email: "pat@example.com" },
      delivered_as: "customer_initiated",
      redacted: false,
    },
    contactIds: ["k1"],
    parts: [
      part("p1", "comment", 2_000),
      part("p2", "note", 3_000),
      part("p3", "assignment", 4_000),
      part("p4", "close", 5_000),
      part("p5", "open", 6_000),
      part("p6", "brand_new_internal_type", 7_000),
      part("p7", "comment", 8_000, { redacted: true }),
      part("p8", "comment", 8_500, { body: "" }),
    ],
    ...overrides,
  };
}

describe("normalizeConversation", () => {
  it("keeps the opening message and public comments only", () => {
    const n = normalizeConversation(conversation());
    expect(n.parts.map((p) => p.id)).toEqual(["source-c1", "p1"]);
    expect(n.parts[0]?.partType).toBe("source");
    expect(n.parts[0]?.authorName).toBe("Pat Customer");
  });

  it("derives count, last replier and last part time from visible parts only", () => {
    const n = normalizeConversation(conversation());
    expect(n.conversation.messageCount).toBe(2);
    expect(n.conversation.lastReplierName).toBe("Agent p1");
    expect(n.conversation.lastReplierType).toBe("admin");
    expect(n.conversation.lastPartAt).toEqual(new Date(2_000_000));
  });

  it("builds a plain-text snippet from the opening message", () => {
    const n = normalizeConversation(conversation());
    expect(n.conversation.snippet).toBe("My invoice & my order");
  });

  it("drops a redacted opening message", () => {
    const base = conversation();
    const n = normalizeConversation({
      ...base,
      source: base.source === null ? null : { ...base.source, redacted: true },
    });
    expect(n.parts.map((p) => p.id)).toEqual(["p1"]);
    expect(n.conversation.snippet).toBeNull();
  });

  it("falls back to the conversation creation time when nothing is visible", () => {
    const n = normalizeConversation(conversation({ source: null, parts: [] }));
    expect(n.conversation.messageCount).toBe(0);
    expect(n.conversation.lastPartAt).toEqual(new Date(1_000_000));
    expect(n.conversation.lastReplierName).toBeNull();
  });
});

describe("matchableEmail", () => {
  it("lowercases and trims", () => {
    expect(matchableEmail("  Pat@Example.COM ")).toBe("pat@example.com");
  });

  it("rejects empty, malformed and noreply addresses", () => {
    expect(matchableEmail(null)).toBeNull();
    expect(matchableEmail("")).toBeNull();
    expect(matchableEmail("not-an-email")).toBeNull();
    for (const local of ["noreply", "no-reply", "donotreply", "do-not-reply", "mailer-daemon"]) {
      expect(matchableEmail(`${local}@example.com`)).toBeNull();
      expect(matchableEmail(`${local.toUpperCase()}@example.com`)).toBeNull();
    }
  });
});
