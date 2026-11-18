import { afterEach, beforeEach, expect, it } from "vitest";
import { ok } from "@/types/result";
import { fakeAgenticProvider } from "../agentic.test-helpers";
import { type FakeAgenticServer, startFakeAgenticServer } from "./agenticFakeServer";

const MAILBOX = "media@example.com";
const signal = () => AbortSignal.timeout(8000);

const forkRow = {
  id: "2c6ab605-67c0-45ec-b42f-9e7802310bbf",
  folder_id: "sent",
  subject: "Quarterly update",
  sender: MAILBOX,
  recipient: "recipient@example.org",
  cc: null,
  bcc: null,
  date: "2026-11-18T01:42:49.971Z",
  read: true,
  starred: false,
  body: "<p>hello</p>",
  in_reply_to: "parent@acme",
  email_references: JSON.stringify(["root@acme", "parent@acme"]),
  thread_id: "thread-1",
  message_id: "lHScoqeX@its-feed.com",
  raw_headers: JSON.stringify([{ key: "from", value: MAILBOX }]),
  send_state: "sent",
  client_ref: null,
  seq: null,
  attachments: [
    {
      id: "att-1",
      email_id: "2c6ab605-67c0-45ec-b42f-9e7802310bbf",
      filename: "a.txt",
      mimetype: "text/plain",
      size: 1,
      content_id: null,
      disposition: "attachment",
    },
  ],
};

let fake: FakeAgenticServer;
beforeEach(async () => {
  fake = await startFakeAgenticServer({ mailbox: MAILBOX });
  fake.setSingleEmailBody(forkRow.id, forkRow);
});
afterEach(async () => {
  await fake.close();
});

it("getEmail parses the fork single-email shape with folder_id", async () => {
  const { client } = fakeAgenticProvider(fake);
  const r = await client.getEmail({ id: forkRow.id, signal: signal() });
  expect(r).toEqual(
    ok({
      id: forkRow.id,
      folder: "sent",
      seq: 0,
      thread_id: "thread-1",
      message_id: "lHScoqeX@its-feed.com",
      in_reply_to: "parent@acme",
      email_references: forkRow.email_references,
      sender: MAILBOX,
      recipient: "recipient@example.org",
      cc: null,
      bcc: null,
      subject: "Quarterly update",
      date: "2026-11-18T01:42:49.971Z",
      body: "<p>hello</p>",
      raw_headers: forkRow.raw_headers,
      attachments: [
        {
          id: "att-1",
          filename: "a.txt",
          mimetype: "text/plain",
          size: 1,
          content_id: null,
          disposition: "attachment",
        },
      ],
    }),
  );
});

it("getEmail keeps the stored seq when the fork row has one", async () => {
  fake.setSingleEmailBody(forkRow.id, { ...forkRow, seq: 7 });
  const { client } = fakeAgenticProvider(fake);
  const r = await client.getEmail({ id: forkRow.id, signal: signal() });
  expect(r.ok && r.value.seq).toBe(7);
});

it("sentCopy succeeds against the real single-email shape", async () => {
  const { provider } = fakeAgenticProvider(fake);
  expect(await provider.sentCopy({ providerMessageId: forkRow.id, signal: signal() })).toEqual(
    ok({ threadId: "thread-1", snippet: "hello" }),
  );
});

it("replyHeaders reads message_id and email_references from the real shape", async () => {
  const { provider } = fakeAgenticProvider(fake);
  expect(
    await provider.replyHeaders({ parentProviderMessageId: forkRow.id, signal: signal() }),
  ).toEqual({
    inReplyTo: "<lHScoqeX@its-feed.com>",
    references: "<root@acme> <parent@acme> <lHScoqeX@its-feed.com>",
  });
});

it("a seeded email is served in the fork shape so the fake cannot hide a schema drift", async () => {
  fake.seedEmail({ id: "seeded", folder: "sent" });
  const res = await fetch(
    `${fake.url}/api/v1/mailboxes/${encodeURIComponent(MAILBOX)}/emails/seeded`,
    {
      signal: signal(),
    },
  );
  const body = (await res.json()) as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(Object.keys(forkRow).sort());
});
