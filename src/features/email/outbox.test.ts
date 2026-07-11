import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { AppError } from "@/constants/errorIds";
import { withTestDb } from "@/db/testing";
import { err, ok } from "@/types/result";
import { FakeStorageClient } from "../files/storageFake";
import { FakeGmailClient } from "./gmailFake";
import { enqueueSend, processSendAttempt } from "./outbox";

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

async function seedAccount(db: TestDb): Promise<string> {
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
  return acct.id;
}

function sendCount(fake: FakeGmailClient): number {
  return fake.calls.filter((c) => c.method === "sendRaw").length;
}

describe("enqueueSend", () => {
  it("is idempotent and reports replay for an already-sent row", async () => {
    await withTestDb(async (db) => {
      const acct = await seedAccount(db);
      const first = await enqueueSend(db, { accountId: acct, idempotencyKey: KEY, payload });
      expect(first.ok).toBe(true);
      if (first.ok) expect(first.value.replay).toBe(false);

      // Re-enqueue before send: same attempt id, not a replay yet (no sent row).
      const again = await enqueueSend(db, { accountId: acct, idempotencyKey: KEY, payload });
      expect(again.ok).toBe(true);
      if (first.ok && again.ok) expect(again.value.attemptId).toBe(first.value.attemptId);

      // Mark it sent, then re-enqueue: now it is a replay.
      await db.execute(sql`UPDATE email_send_attempts SET status='sent' WHERE account_id=${acct}`);
      const replay = await enqueueSend(db, { accountId: acct, idempotencyKey: KEY, payload });
      expect(replay.ok).toBe(true);
      if (replay.ok) expect(replay.value.replay).toBe(true);
    });
  });
});

describe("processSendAttempt", () => {
  it("sends once and a replay of a sent row does not re-send", async () => {
    await withTestDb(async (db) => {
      const acct = await seedAccount(db);
      await enqueueSend(db, { accountId: acct, idempotencyKey: KEY, payload });
      const fake = new FakeGmailClient();

      const r1 = await processSendAttempt(db, {
        accountId: acct,
        idempotencyKey: KEY,
        gmail: fake,
        storage: new FakeStorageClient(),
        signal: newSignal(),
      });
      expect(r1.ok).toBe(true);
      if (r1.ok) expect(r1.value.status).toBe("sent");
      const afterFirst = sendCount(fake);
      expect(afterFirst).toBe(1);

      const r2 = await processSendAttempt(db, {
        accountId: acct,
        idempotencyKey: KEY,
        gmail: fake,
        storage: new FakeStorageClient(),
        signal: newSignal(),
      });
      expect(r2.ok).toBe(true);
      if (r2.ok) expect(r2.value.status).toBe("sent"); // pure replay
      expect(sendCount(fake)).toBe(afterFirst); // NO second send
    });
  });

  it("crash-after-accept: a stamped row reconciles via search and never blind re-sends", async () => {
    await withTestDb(async (db) => {
      const acct = await seedAccount(db);
      const e = await enqueueSend(db, { accountId: acct, idempotencyKey: KEY, payload });
      expect(e.ok).toBe(true);
      const attemptId = e.ok ? e.value.attemptId : "";

      // Simulate a worker that claimed + stamped send_started_at, called Gmail (which
      // ACCEPTED + delivered), then crashed before recording sent.
      await db.execute(sql`
        UPDATE email_send_attempts
        SET status='sending', send_started_at=now(), claimed_at=now()-interval '5 minutes'
        WHERE id=${attemptId}
      `);
      const header = (
        await db.execute(
          sql`SELECT message_id_header FROM email_send_attempts WHERE id=${attemptId}`,
        )
      ).rows[0] as { message_id_header: string };

      const fake = new FakeGmailClient();
      // The accepted message IS searchable by its deterministic Message-ID header.
      fake.searchHits.set(header.message_id_header, {
        messages: [{ id: "gmail-found", threadId: "t1" }],
      });

      const r = await processSendAttempt(db, {
        accountId: acct,
        idempotencyKey: KEY,
        gmail: fake,
        storage: new FakeStorageClient(),
        signal: newSignal(),
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.status).toBe("sent");
        expect(r.value.gmailMessageId).toBe("gmail-found");
      }
      // Reconciled, NEVER blind re-sent.
      expect(sendCount(fake)).toBe(0);
      const row = (
        await db.execute(
          sql`SELECT status, gmail_message_id FROM email_send_attempts WHERE id=${attemptId}`,
        )
      ).rows[0] as { status: string; gmail_message_id: string | null };
      expect(row.status).toBe("sent");
      expect(row.gmail_message_id).toBe("gmail-found");
    });
  });

  it("moves to needs_review when reconcile finds nothing and the window is exhausted", async () => {
    await withTestDb(async (db) => {
      const acct = await seedAccount(db);
      const e = await enqueueSend(db, { accountId: acct, idempotencyKey: KEY, payload });
      const attemptId = e.ok ? e.value.attemptId : "";
      await db.execute(sql`
        UPDATE email_send_attempts
        SET status='sending', send_started_at=now()-interval '5 minutes', claimed_at=now()-interval '5 minutes'
        WHERE id=${attemptId}
      `);
      const fake = new FakeGmailClient(); // no searchHits -> empty search

      const r = await processSendAttempt(db, {
        accountId: acct,
        idempotencyKey: KEY,
        gmail: fake,
        storage: new FakeStorageClient(),
        signal: newSignal(),
        windowMs: 1, // tiny window: the deadline is already in the past
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.status).toBe("needs_review");
      expect(sendCount(fake)).toBe(0); // never blind re-sent during reconcile
      const row = (
        await db.execute(
          sql`SELECT status, error_id FROM email_send_attempts WHERE id=${attemptId}`,
        )
      ).rows[0] as { status: string; error_id: string | null };
      expect(row.status).toBe("needs_review");
      expect(row.error_id).toBe("E_GMAIL_004");
    });
  });

  it("marks failed with E_GMAIL_003 on a pre-acceptance 4xx rejection", async () => {
    await withTestDb(async (db) => {
      const acct = await seedAccount(db);
      await enqueueSend(db, { accountId: acct, idempotencyKey: KEY, payload });
      const fake = new FakeGmailClient();
      // Gmail rejects before accepting: a retryable pre-accept failure.
      fake.sendImpl = () => err(new AppError("E_GMAIL_003", "send rejected", {}));

      const r = await processSendAttempt(db, {
        accountId: acct,
        idempotencyKey: KEY,
        gmail: fake,
        storage: new FakeStorageClient(),
        signal: newSignal(),
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.status).toBe("failed");
      const row = (
        await db.execute(
          sql`SELECT status, error_id FROM email_send_attempts WHERE account_id=${acct}`,
        )
      ).rows[0] as { status: string; error_id: string | null };
      expect(row.status).toBe("failed");
      expect(row.error_id).toBe("E_GMAIL_003");
    });
  });

  // F12: a DEFINITE pre-acceptance rejection (HTTP 4xx) leaves the message NOT accepted, so
  // the next attempt must RETRY (re-send), not get stuck reconciling. The 4xx failure clears
  // send_started_at so processSendAttempt does not take the reconcile branch on the retry.
  it("retries a definite 4xx pre-acceptance rejection instead of reconciling", async () => {
    await withTestDb(async (db) => {
      const acct = await seedAccount(db);
      await enqueueSend(db, { accountId: acct, idempotencyKey: KEY, payload });
      const fake = new FakeGmailClient();
      fake.sendImpl = () => err(new AppError("E_GMAIL_001", "bad request", { status: 400 }));
      const r1 = await processSendAttempt(db, {
        accountId: acct,
        idempotencyKey: KEY,
        gmail: fake,
        storage: new FakeStorageClient(),
        signal: newSignal(),
      });
      expect(r1.ok).toBe(true);
      if (r1.ok) expect(r1.value.status).toBe("failed");

      // The retry: Gmail now accepts. It must actually send again, not reconcile.
      fake.sendImpl = () => ok({ id: "sent-2", threadId: "t1" });
      const r2 = await processSendAttempt(db, {
        accountId: acct,
        idempotencyKey: KEY,
        gmail: fake,
        storage: new FakeStorageClient(),
        signal: newSignal(),
      });
      expect(r2.ok).toBe(true);
      if (r2.ok) expect(r2.value.status).toBe("sent");
      expect(sendCount(fake)).toBe(2);
    });
  });

  // F13: an AMBIGUOUS failure (5xx) may mean Gmail accepted the message, so the next attempt
  // must reconcile by Message-ID, NEVER blind re-send (which would duplicate the email).
  it("does NOT re-send after an ambiguous 5xx failure (reconciles instead)", async () => {
    await withTestDb(async (db) => {
      const acct = await seedAccount(db);
      await enqueueSend(db, { accountId: acct, idempotencyKey: KEY, payload });
      const fake = new FakeGmailClient();
      fake.sendImpl = () => err(new AppError("E_GMAIL_001", "server error", { status: 503 }));
      const r1 = await processSendAttempt(db, {
        accountId: acct,
        idempotencyKey: KEY,
        gmail: fake,
        storage: new FakeStorageClient(),
        signal: newSignal(),
      });
      expect(r1.ok).toBe(true);

      // The retry MUST reconcile (search by Message-ID), not call sendRaw again. searchHits
      // is empty and the window is open, so no second send occurs.
      fake.sendImpl = () => ok({ id: "sent-2", threadId: "t1" });
      await processSendAttempt(db, {
        accountId: acct,
        idempotencyKey: KEY,
        gmail: fake,
        storage: new FakeStorageClient(),
        signal: newSignal(),
      });
      // Exactly one sendRaw across both attempts: no duplicate customer email.
      expect(sendCount(fake)).toBe(1);
    });
  });
});
