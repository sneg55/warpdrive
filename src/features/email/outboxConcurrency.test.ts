import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { ok } from "@/types/result";
import { FakeStorageClient } from "../files/storageFake";
import { FakeGmailClient } from "./gmailFake";
import { enqueueSend, processSendAttempt } from "./outbox";
import { markSent } from "./outboxReconcile";
import { gmailProvider } from "./provider/gmailProvider";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const newSignal = (): AbortSignal => new AbortController().signal;

const KEY = "11111111-1111-1111-1111-111111111111";
const payload = {
  to: ["you@y.com"],
  cc: [],
  subject: "Hi",
  html: "<p>hi</p>",
  trackingEnabled: false,
};

async function seedAccount(db: TestDb, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  const u = (
    await db.execute(
      sql`INSERT INTO users (email, name) VALUES ('o@gunsnation.com','O') RETURNING id`,
    )
  ).rows[0] as { id: string };
  signal.throwIfAborted();
  const acct = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${u.id},'o@gunsnation.com') RETURNING id`,
    )
  ).rows[0] as { id: string };
  signal.throwIfAborted();
  return acct.id;
}

describe("processSendAttempt concurrency", () => {
  it("worker B reconciles while worker A is mid-send: exactly one send, one final id", async () => {
    await withTestDb(async (db) => {
      const acct = await seedAccount(db, newSignal());
      const e = await enqueueSend(
        db,
        { accountId: acct, idempotencyKey: KEY, payload },
        AbortSignal.timeout(8000),
      );
      const attemptId = e.ok ? e.value.attemptId : "";
      const header = (
        await db.execute(
          sql`SELECT message_id_header FROM email_send_attempts WHERE id=${attemptId}`,
        )
      ).rows[0] as { message_id_header: string };

      let releaseSend!: () => void;
      const sendGate = new Promise<void>((resolve) => {
        releaseSend = resolve;
      });
      const fakeA = new FakeGmailClient();
      fakeA.sendRaw = async (a) => {
        fakeA.calls.push({ method: "sendRaw", args: a });
        await sendGate;
        return ok({ id: "gmail-A", threadId: "t1" });
      };

      const fakeB = new FakeGmailClient();
      fakeB.searchHits.set(header.message_id_header, {
        messages: [{ id: "gmail-found", threadId: "t1" }],
      });

      const aPromise = processSendAttempt(db, {
        accountId: acct,
        idempotencyKey: KEY,
        provider: gmailProvider(fakeA),
        storage: new FakeStorageClient(),
        signal: newSignal(),
      });
      for (let i = 0; i < 100 && fakeA.calls.length === 0; i++) {
        await new Promise((r) => setTimeout(r, 5));
      }
      expect(fakeA.calls.filter((c) => c.method === "sendRaw")).toHaveLength(1);

      const rB = await processSendAttempt(db, {
        accountId: acct,
        idempotencyKey: KEY,
        provider: gmailProvider(fakeB),
        storage: new FakeStorageClient(),
        signal: newSignal(),
      });
      expect(rB.ok).toBe(true);
      releaseSend();
      const rA = await aPromise;
      expect(rA.ok).toBe(true);

      expect(fakeB.calls.filter((c) => c.method === "sendRaw")).toHaveLength(0);
      expect(fakeA.calls.filter((c) => c.method === "sendRaw")).toHaveLength(1);

      const finalRow = (
        await db.execute(
          sql`SELECT status, gmail_message_id FROM email_send_attempts WHERE id=${attemptId}`,
        )
      ).rows[0] as { status: string; gmail_message_id: string | null };
      expect(finalRow.status).toBe("sent");
      expect(["gmail-A", "gmail-found"]).toContain(finalRow.gmail_message_id);
    });
  });

  it("markSent ignores a second, divergent gmail id (no silent overwrite)", async () => {
    await withTestDb(async (db) => {
      const acct = await seedAccount(db, newSignal());
      const e = await enqueueSend(
        db,
        { accountId: acct, idempotencyKey: KEY, payload },
        AbortSignal.timeout(8000),
      );
      const attemptId = e.ok ? e.value.attemptId : "";
      const signal = newSignal();

      await db.execute(sql`
        UPDATE email_send_attempts
        SET status='sending', gmail_message_id='gmail-first' WHERE id=${attemptId}
      `);

      await markSent(db, attemptId, "gmail-second", signal);
      const row = (
        await db.execute(
          sql`SELECT status, gmail_message_id FROM email_send_attempts WHERE id=${attemptId}`,
        )
      ).rows[0] as { status: string; gmail_message_id: string | null };
      expect(row.gmail_message_id).toBe("gmail-first");
      expect(row.status).toBe("sending");

      await markSent(db, attemptId, "gmail-first", signal);
      const again = (
        await db.execute(
          sql`SELECT status, gmail_message_id FROM email_send_attempts WHERE id=${attemptId}`,
        )
      ).rows[0] as { status: string; gmail_message_id: string | null };
      expect(again.gmail_message_id).toBe("gmail-first");
      expect(again.status).toBe("sent");
    });
  });
});
