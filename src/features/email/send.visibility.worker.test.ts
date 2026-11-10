import { expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { ok } from "@/types/result";
import { FakeStorageClient } from "../files/storageFake";
import { FakeGmailClient } from "./gmailFake";
import { sendEmail } from "./send";
import {
  deliverScheduled,
  seedAccount,
  seedSentAttempt,
  threadVisibility,
} from "./send.visibility.test-helpers";
import { ensureLocalCopyForReplay } from "./sendReplayRepair";

it("SCHEDULED/worker send: a private compose creates a private thread when delivered later", async () => {
  await withTestDb(async (db) => {
    const owner = await seedUser(db, { email: "owner-vis2@gunsnation.com" });
    const acctId = await seedAccount(
      db,
      owner.id,
      "owner-vis2@gunsnation.com",
      AbortSignal.timeout(8000),
    );

    const idempotencyKey = "22222222-2222-2222-2222-222222222222";
    const future = new Date(Date.now() + 3_600_000);
    const scheduled = await sendEmail(db, {
      signal: AbortSignal.timeout(8000),
      actorId: owner.id,
      actorType: "regular",
      actorGroupIds: new Set<string>(),
      gmail: new FakeGmailClient(),
      storage: new FakeStorageClient(),
      input: {
        accountId: acctId,
        idempotencyKey,
        to: ["stranger@nowhere.com"],
        subject: "Hi later",
        bodyHtml: "<p>hi</p>",
        trackingEnabled: false,
        visibility: "private",
        scheduledSendAt: future,
      },
    });
    expect(scheduled.ok).toBe(true);
    if (scheduled.ok) expect(scheduled.value.status).toBe("scheduled");

    const workerFake = new FakeGmailClient();
    workerFake.sendImpl = () => ok({ id: "g-vis-2", threadId: "th-vis-2" });
    workerFake.messages.set("g-vis-2", {
      id: "g-vis-2",
      threadId: "th-vis-2",
      labelIds: [],
      snippet: "p",
    });

    await deliverScheduled(
      db,
      { accountId: acctId, idempotencyKey, workerFake },
      AbortSignal.timeout(8000),
    );
    expect(await threadVisibility(db, acctId, "th-vis-2", AbortSignal.timeout(8000))).toBe(
      "private",
    );
  });
});

it("REPLAY-REPAIR: a private compose recorded in the stored payload repairs a private thread", async () => {
  await withTestDb(async (db) => {
    const owner = await seedUser(db, { email: "owner-vis3@gunsnation.com" });
    const acctId = await seedAccount(
      db,
      owner.id,
      "owner-vis3@gunsnation.com",
      AbortSignal.timeout(8000),
    );

    const gmailMessageId = "g-vis-3";
    const attemptId = await seedSentAttempt(
      db,
      {
        accountId: acctId,
        gmailMessageId,
        payload: {
          to: ["stranger@nowhere.com"],
          subject: "Hi",
          html: "<p>hi</p>",
          trackOpens: false,
          trackLinks: false,
          visibility: "private",
        },
      },
      AbortSignal.timeout(8000),
    );

    const fake = new FakeGmailClient();
    fake.messages.set(gmailMessageId, {
      id: gmailMessageId,
      threadId: "th-vis-3",
      labelIds: [],
      snippet: "p",
    });

    const result = await ensureLocalCopyForReplay(db, {
      attemptId,
      accountId: acctId,
      fromEmail: "owner-vis3@gunsnation.com",
      gmail: fake,
      signal: AbortSignal.timeout(8000),
    });
    expect(result.ok).toBe(true);
    expect(await threadVisibility(db, acctId, "th-vis-3", AbortSignal.timeout(8000))).toBe(
      "private",
    );
  });
});
