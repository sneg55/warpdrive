import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import {
  backfillTokens,
  disableTokens,
  mintTokensForSend,
  recordClick,
  recordOpen,
  rewriteBody,
} from "./tracking";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const newSignal = (): AbortSignal => new AbortController().signal;

// Seed a send attempt plus a sent message, so tracking events (message_id NOT NULL)
// can reference a real message after backfill. Returns ids the tests need.
async function seedAttempt(
  db: TestDb,
): Promise<{ attemptId: string; accountId: string; messageId: string }> {
  const u = (
    await db.execute(
      sql`INSERT INTO users (email, name, google_sub) VALUES ('o@gunsnation.com','O','sub-o') RETURNING id`,
    )
  ).rows[0] as { id: string };
  const acct = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${u.id},'o@gunsnation.com') RETURNING id`,
    )
  ).rows[0] as { id: string };
  const att = (
    await db.execute(sql`
      INSERT INTO email_send_attempts (idempotency_key, message_id_header, account_id, payload)
      VALUES (gen_random_uuid(), 'h1', ${acct.id}, '{}'::jsonb) RETURNING id
    `)
  ).rows[0] as { id: string };
  const thread = (
    await db.execute(sql`
      INSERT INTO email_threads (gmail_thread_id, account_id) VALUES ('t1', ${acct.id}) RETURNING id
    `)
  ).rows[0] as { id: string };
  const msg = (
    await db.execute(sql`
      INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email)
      VALUES (${thread.id}, ${acct.id}, 'g1', 'outbound', 'o@gunsnation.com') RETURNING id
    `)
  ).rows[0] as { id: string };
  return { attemptId: att.id, accountId: acct.id, messageId: msg.id };
}

async function eventCount(db: TestDb, kind: "open" | "click"): Promise<number> {
  const r = await db.execute(
    sql`SELECT count(*)::int AS n FROM email_tracking_events WHERE event_type=${kind}`,
  );
  return (r.rows[0] as { n: number }).n;
}

describe("mintTokensForSend", () => {
  it("mints no tokens when tracking is off", async () => {
    await withTestDb(async (db) => {
      const { attemptId } = await seedAttempt(db);
      const out = await mintTokensForSend(db, {
        sendAttemptId: attemptId,
        recipient: "you@y.com",
        links: ["https://x.com"],
        trackOpens: false,
        trackLinks: false,
        signal: newSignal(),
      });
      expect(out.openToken).toBeNull();
      expect(out.linkTokens).toEqual([]);
      const n = (await db.execute(sql`SELECT count(*)::int AS n FROM email_tracking_tokens`))
        .rows[0] as { n: number };
      expect(n.n).toBe(0);
    });
  });

  it("mints rows with message_id null when tracking is on", async () => {
    await withTestDb(async (db) => {
      const { attemptId } = await seedAttempt(db);
      const out = await mintTokensForSend(db, {
        sendAttemptId: attemptId,
        recipient: "you@y.com",
        links: ["https://dest.com/x"],
        trackOpens: true,
        trackLinks: true,
        signal: newSignal(),
      });
      expect(out.openToken).not.toBeNull();
      expect(out.linkTokens).toHaveLength(1);
      const rows = (
        await db.execute(
          sql`SELECT message_id FROM email_tracking_tokens WHERE send_attempt_id=${attemptId}`,
        )
      ).rows as { message_id: string | null }[];
      expect(rows).toHaveLength(2); // open + 1 link
      expect(rows.every((r) => r.message_id === null)).toBe(true);
    });
  });

  it("does not store a javascript: or data: link as a redirect target (open-redirect guard)", async () => {
    await withTestDb(async (db) => {
      const { attemptId } = await seedAttempt(db);
      const out = await mintTokensForSend(db, {
        sendAttemptId: attemptId,
        recipient: "you@y.com",

        links: ["javascript:alert(1)", "data:text/html,<script>", "https://ok.com/y"],
        trackOpens: true,
        trackLinks: true,
        signal: newSignal(),
      });
      // Only the http(s) link is tokenized; the dangerous schemes are skipped.
      expect(out.linkTokens.map((l) => l.original)).toEqual(["https://ok.com/y"]);
      const targets = (
        await db.execute(
          sql`SELECT target_url FROM email_tracking_tokens WHERE send_attempt_id=${attemptId} AND kind='click'`,
        )
      ).rows as { target_url: string | null }[];
      const stored = targets.map((t) => t.target_url);
      expect(stored).toContain("https://ok.com/y");
      expect(stored.some((u) => u?.startsWith("javascript:") === true)).toBe(false);
      expect(stored.some((u) => u?.startsWith("data:") === true)).toBe(false);
    });
  });
});

describe("rewriteBody (pure)", () => {
  it("rewrites link hrefs to /t/click and injects the open pixel", () => {
    const html = rewriteBody({
      html: '<a href="https://dest.com/x">go</a>',
      openToken: "OPEN",
      linkTokens: [{ original: "https://dest.com/x", token: "CLK" }],
    });
    expect(html).toContain("/t/click/CLK");
    expect(html).toContain("/t/open/OPEN");
    // The original raw href is gone (replaced by the click URL).
    expect(html).not.toContain('href="https://dest.com/x"');
  });

  it("injects no pixel when openToken is null", () => {
    const html = rewriteBody({ html: "<p>hi</p>", openToken: null, linkTokens: [] });
    expect(html).not.toContain("/t/open/");
  });
});

describe("recordOpen / recordClick", () => {
  it("records an open event after the token is backfilled with its message", async () => {
    await withTestDb(async (db) => {
      const { attemptId, messageId } = await seedAttempt(db);
      const out = await mintTokensForSend(db, {
        sendAttemptId: attemptId,
        recipient: "you@y.com",
        links: [],
        trackOpens: true,
        trackLinks: true,
        signal: newSignal(),
      });
      await backfillTokens(db, { sendAttemptId: attemptId, messageId, signal: newSignal() });
      const openToken = out.openToken;
      expect(openToken).not.toBeNull();
      if (openToken !== null) await recordOpen(db, openToken, "Mozilla/5.0", newSignal());
      expect(await eventCount(db, "open")).toBe(1);
    });
  });

  it("records a click event AND returns the stored target", async () => {
    await withTestDb(async (db) => {
      const { attemptId, messageId } = await seedAttempt(db);
      const out = await mintTokensForSend(db, {
        sendAttemptId: attemptId,
        recipient: "you@y.com",
        links: ["https://dest.com/x"],
        trackOpens: true,
        trackLinks: true,
        signal: newSignal(),
      });
      await backfillTokens(db, { sendAttemptId: attemptId, messageId, signal: newSignal() });
      const link = out.linkTokens[0];
      expect(link).toBeDefined();
      const target =
        link !== undefined ? await recordClick(db, link.token, "UA", newSignal()) : null;
      // The redirect target is the STORED url, not anything from the request.
      expect(target).toBe("https://dest.com/x");
      expect(await eventCount(db, "click")).toBe(1);
    });
  });

  it("click still returns the target but records no event when disabled", async () => {
    await withTestDb(async (db) => {
      const { attemptId, messageId } = await seedAttempt(db);
      const out = await mintTokensForSend(db, {
        sendAttemptId: attemptId,
        recipient: "you@y.com",
        links: ["https://dest.com/x"],
        trackOpens: true,
        trackLinks: true,
        signal: newSignal(),
      });
      await backfillTokens(db, { sendAttemptId: attemptId, messageId, signal: newSignal() });
      await disableTokens(db, attemptId, newSignal());
      const link = out.linkTokens[0];
      const target =
        link !== undefined ? await recordClick(db, link.token, "UA", newSignal()) : null;
      expect(target).toBe("https://dest.com/x");
      expect(await eventCount(db, "click")).toBe(0);
    });
  });

  it("an unknown token returns null target and records nothing", async () => {
    await withTestDb(async (db) => {
      const target = await recordClick(db, "does-not-exist", "UA", newSignal());
      expect(target).toBeNull();
      expect(await eventCount(db, "click")).toBe(0);
    });
  });
});
