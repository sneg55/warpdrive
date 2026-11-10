import { expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { ok } from "@/types/result";
import { FakeStorageClient } from "../files/storageFake";
import { FakeGmailClient } from "./gmailFake";
import { sendEmail } from "./send";
import { seedAccount, threadVisibility } from "./send.visibility.test-helpers";

it("INTERACTIVE send: a private compose creates a private thread", async () => {
  await withTestDb(async (db) => {
    const owner = await seedUser(db, { email: "owner-vis@gunsnation.com" });
    const acctId = await seedAccount(
      db,
      owner.id,
      "owner-vis@gunsnation.com",
      AbortSignal.timeout(8000),
    );

    const fake = new FakeGmailClient();
    fake.sendImpl = () => ok({ id: "g-vis-1", threadId: "th-vis-1" });
    fake.messages.set("g-vis-1", {
      id: "g-vis-1",
      threadId: "th-vis-1",
      labelIds: [],
      snippet: "p",
    });

    const r = await sendEmail(db, {
      signal: AbortSignal.timeout(8000),
      actorId: owner.id,
      actorType: "regular",
      actorGroupIds: new Set<string>(),
      gmail: fake,
      storage: new FakeStorageClient(),
      input: {
        accountId: acctId,
        idempotencyKey: "11111111-1111-1111-1111-111111111111",
        to: ["stranger@nowhere.com"],
        subject: "Hi",
        bodyHtml: "<p>hi</p>",
        trackingEnabled: false,
        visibility: "private",
      },
    });
    expect(r.ok).toBe(true);
    expect(await threadVisibility(db, acctId, "th-vis-1", AbortSignal.timeout(8000))).toBe(
      "private",
    );
  });
});

it("omitting visibility falls back to the column default (shared not forced), unchanged", async () => {
  await withTestDb(async (db) => {
    const owner = await seedUser(db, { email: "owner-vis4@gunsnation.com" });
    const acctId = await seedAccount(
      db,
      owner.id,
      "owner-vis4@gunsnation.com",
      AbortSignal.timeout(8000),
    );

    const fake = new FakeGmailClient();
    fake.sendImpl = () => ok({ id: "g-vis-4", threadId: "th-vis-4" });
    fake.messages.set("g-vis-4", {
      id: "g-vis-4",
      threadId: "th-vis-4",
      labelIds: [],
      snippet: "p",
    });

    const r = await sendEmail(db, {
      signal: AbortSignal.timeout(8000),
      actorId: owner.id,
      actorType: "regular",
      actorGroupIds: new Set<string>(),
      gmail: fake,
      storage: new FakeStorageClient(),
      input: {
        accountId: acctId,
        idempotencyKey: "44444444-4444-4444-4444-444444444444",
        to: ["stranger@nowhere.com"],
        subject: "Hi",
        bodyHtml: "<p>hi</p>",
        trackingEnabled: false,
      },
    });
    expect(r.ok).toBe(true);
    expect(await threadVisibility(db, acctId, "th-vis-4", AbortSignal.timeout(8000))).toBe(
      "private",
    );
  });
});
