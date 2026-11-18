import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { ok } from "@/types/result";
import { seedAgenticMailbox } from "../agentic.test-helpers";
import { applyParsedMessages } from "../applyMessages";
import { agenticParse } from "./agenticParse";
import type { ChangeEmail } from "./agenticSchemas";

const MAILBOX = "media@example.com";

function row(partial: Partial<ChangeEmail> & { id: string }): ChangeEmail {
  return {
    seq: 1,
    folder: "inbox",
    thread_id: null,
    message_id: null,
    in_reply_to: null,
    email_references: null,
    sender: "jane@acme.com",
    recipient: MAILBOX,
    cc: null,
    bcc: null,
    subject: "Hello",
    date: "2026-11-10T10:00:00.000Z",
    body: "plain words",
    raw_headers: null,
    attachments: [],
    ...partial,
  };
}

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeEach(async () => {
  ctx = await makeTestDb();
});
afterEach(async () => {
  await ctx.close();
});

describe("agenticParse", () => {
  it("agenticParse maps a sent row from the mailbox to outbound via applyParsedMessages", async () => {
    const signal = AbortSignal.timeout(8000);
    const member = await seedUser(ctx.db);
    const accountId = await seedAgenticMailbox(
      ctx.db,
      { address: MAILBOX, baseUrl: "http://127.0.0.1:1", memberIds: [member.id] },
      signal,
    );
    const sent = agenticParse(
      row({ id: "s1", folder: "sent", sender: MAILBOX, recipient: "jane@acme.com" }),
      MAILBOX,
    );
    const inbound = agenticParse(row({ id: "i1", thread_id: "s1" }), MAILBOX);

    expect(await applyParsedMessages({ db: ctx.db, accountId, signal }, [sent, inbound])).toEqual(
      ok(2),
    );
    const rows = (
      await ctx.db.execute(sql`
        SELECT m.gmail_message_id, m.direction, t.gmail_thread_id FROM email_messages m
        JOIN email_threads t ON t.id = m.thread_id
        WHERE m.account_id=${accountId} ORDER BY m.gmail_message_id`)
    ).rows;
    expect(rows).toEqual([
      { gmail_message_id: "i1", direction: "inbound", gmail_thread_id: "s1" },
      { gmail_message_id: "s1", direction: "outbound", gmail_thread_id: "s1" },
    ]);
  });

  it("an inbox row sent from the mailbox address to itself is stored inbound and updates last_inbound_at", async () => {
    const signal = AbortSignal.timeout(8000);
    const member = await seedUser(ctx.db);
    const accountId = await seedAgenticMailbox(
      ctx.db,
      { address: MAILBOX, baseUrl: "http://127.0.0.1:1", memberIds: [member.id] },
      signal,
    );
    const self = agenticParse(row({ id: "self", sender: MAILBOX, recipient: MAILBOX }), MAILBOX);

    expect(await applyParsedMessages({ db: ctx.db, accountId, signal }, [self])).toEqual(ok(1));
    const stored = (
      await ctx.db.execute(sql`
        SELECT m.direction, t.last_inbound_at FROM email_messages m
        JOIN email_threads t ON t.id = m.thread_id WHERE m.account_id=${accountId}`)
    ).rows[0] as { direction: string; last_inbound_at: unknown };
    expect(stored.direction).toBe("inbound");
    expect(stored.last_inbound_at).not.toBeNull();
  });

  it("takes display names from raw_headers and splits recipients into bare addresses", () => {
    const parsed = agenticParse(
      row({
        id: "n1",
        recipient: `${MAILBOX}, bob@acme.com`,
        cc: "Carol <carol@acme.com>",
        raw_headers: JSON.stringify([{ key: "from", value: '"Jane, Doe" <jane@acme.com>' }]),
      }),
      MAILBOX,
    );
    expect(parsed.fromEmail).toBe("jane@acme.com");
    expect(parsed.fromName).toBe("Jane, Doe");
    expect(parsed.toEmails).toEqual([MAILBOX, "bob@acme.com"]);
    expect(parsed.ccEmails).toEqual(["carol@acme.com"]);
    expect(parsed.participants).toEqual([
      "jane@acme.com",
      MAILBOX,
      "bob@acme.com",
      "carol@acme.com",
    ]);
  });

  it("falls back to a null name when raw_headers is missing or malformed", () => {
    expect(agenticParse(row({ id: "a" }), MAILBOX).fromName).toBeNull();
    expect(agenticParse(row({ id: "b", raw_headers: "not json" }), MAILBOX).fromName).toBeNull();
  });

  it("stores an html body as html and a tagless body as text", () => {
    const html = agenticParse(row({ id: "h", body: "<p>Hi &amp; bye</p>" }), MAILBOX);
    const text = agenticParse(row({ id: "t", body: "Hi there" }), MAILBOX);
    expect([html.bodyHtml, html.bodyText, html.snippet]).toEqual([
      "<p>Hi &amp; bye</p>",
      null,
      "Hi & bye",
    ]);
    expect([text.bodyHtml, text.bodyText, text.snippet]).toEqual([null, "Hi there", "Hi there"]);
  });

  it("keeps a text body with an angle-bracket address or link as text", () => {
    const body = "Sounds good.\n\nOn Mon, Jane <jane@acme.com> wrote:\n> see <https://acme.com/x>";
    const parsed = agenticParse(row({ id: "q", body }), MAILBOX);
    expect([parsed.bodyHtml, parsed.bodyText]).toEqual([null, body]);
    const html = agenticParse(row({ id: "q2", body: "<br/>hi" }), MAILBOX);
    expect(html.bodyHtml).toBe("<br/>hi");
  });

  it("uses the row id as the thread id when thread_id is null and parses the date", () => {
    const parsed = agenticParse(
      row({
        id: "solo",
        attachments: [
          {
            id: "att1",
            filename: "deck.pdf",
            mimetype: "application/pdf",
            size: 42,
            content_id: null,
            disposition: "attachment",
          },
        ],
      }),
      MAILBOX,
    );
    expect(parsed.gmailMessageId).toBe("solo");
    expect(parsed.threadId).toBe("solo");
    expect(parsed.sentAt).toEqual(new Date("2026-11-10T10:00:00.000Z"));
    expect(parsed.attachments).toEqual([
      {
        filename: "deck.pdf",
        mimeType: "application/pdf",
        sizeBytes: 42,
        gmailAttachmentId: "att1",
      },
    ]);
  });
});
