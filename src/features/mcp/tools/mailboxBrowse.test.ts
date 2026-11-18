import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sql } from "drizzle-orm";
import { expect, test } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { buildAppContext } from "@/features/mcp/actorContext";
import { buildMcpServer } from "../server";
import {
  actorOf,
  errorText,
  payload,
  seedPersonal,
  seedTeam,
  seedThreadWithMessage,
  type TestDb,
} from "./mailboxTools.test-helpers";
import { registerReadTools } from "./reads";
import { registerWriteTools } from "./writes";

type ThreadPage = { threads: Array<{ id: string; subject: string }>; nextCursor: string | null };

async function readTools(db: TestDb, userId: string) {
  const actor = await actorOf(db, userId);
  const server = new McpServer({ name: "t", version: "1.0.0" });
  return registerReadTools(server, () => buildAppContext(db, actor));
}

test("list_mailbox_threads reads a team agentic inbox by address and defaults to the personal one", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, {});
    const personal = await seedPersonal(db, user.id, "me@example.com");
    const team = await seedTeam(db, "media@example.com", [user.id], "agentic_inbox");
    await seedThreadWithMessage(db, personal, "Personal hello");
    await seedThreadWithMessage(db, team, "Unlinked partner pitch");
    const reads = await readTools(db, user.id);

    const teamPage = payload(
      await reads.invoke("list_mailbox_threads", { mailbox: "Media@example.com" }),
    ) as ThreadPage;
    expect(teamPage.threads.map((t) => t.subject)).toEqual(["Unlinked partner pitch"]);

    const personalPage = payload(await reads.invoke("list_mailbox_threads", {})) as ThreadPage;
    expect(personalPage.threads.map((t) => t.subject)).toEqual(["Personal hello"]);
    const byAddress = payload(
      await reads.invoke("list_mailbox_threads", { mailbox: "me@example.com" }),
    ) as ThreadPage;
    expect(byAddress.threads.map((t) => t.subject)).toEqual(["Personal hello"]);
  });
});

test("list_mailbox_threads reads the sent and archive folders of a team mailbox", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, {});
    const team = await seedTeam(db, "media@example.com", [user.id]);
    const threadId = await seedThreadWithMessage(db, team, "Our offer", { direction: "outbound" });
    const reads = await readTools(db, user.id);

    const sent = payload(
      await reads.invoke("list_mailbox_threads", { mailbox: "media@example.com", folder: "sent" }),
    ) as ThreadPage;
    expect(sent.threads.map((t) => t.id)).toEqual([threadId]);
    await db.execute(sql`UPDATE email_threads SET archived_at = now() WHERE id = ${threadId}`);
    const archive = payload(
      await reads.invoke("list_mailbox_threads", {
        mailbox: "media@example.com",
        folder: "archive",
      }),
    ) as ThreadPage;
    expect(archive.threads.map((t) => t.id)).toEqual([threadId]);
  });
});

test("list_mailbox_threads pages with an opaque cursor", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, {});
    const team = await seedTeam(db, "media@example.com", [user.id]);
    await seedThreadWithMessage(db, team, "Newer", { minutesAgo: 1 });
    await seedThreadWithMessage(db, team, "Older", { minutesAgo: 10 });
    const reads = await readTools(db, user.id);
    const first = payload(
      await reads.invoke("list_mailbox_threads", { mailbox: "media@example.com", limit: 1 }),
    ) as ThreadPage;
    expect(first.threads.map((t) => t.subject)).toEqual(["Newer"]);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = payload(
      await reads.invoke("list_mailbox_threads", {
        mailbox: "media@example.com",
        limit: 1,
        cursor: first.nextCursor,
      }),
    ) as ThreadPage;
    expect(second.threads.map((t) => t.subject)).toEqual(["Older"]);

    const garbled = await reads.invoke("list_mailbox_threads", {
      mailbox: "media@example.com",
      cursor: "not-a-cursor",
    });
    expect(garbled.isError).toBe(true);
  });
});

test("list_mailbox_threads and search_emails refuse a mailbox the caller cannot use", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, {});
    const other = await seedUser(db, {});
    const hidden = await seedTeam(db, "hidden@example.com", [other.id]);
    await seedThreadWithMessage(db, hidden, "Secret");
    const reads = await readTools(db, user.id);

    for (const [tool, input] of [
      ["list_mailbox_threads", { mailbox: "hidden@example.com" }],
      ["search_emails", { query: "Secret", mailbox: "hidden@example.com" }],
    ] as const) {
      const result = await reads.invoke(tool, input);
      expect(result.isError).toBe(true);
      expect(errorText(result)).toContain("list_mailboxes");
    }
  });
});

test("search_emails finds mail in a team mailbox and in the personal one by default", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, {});
    const personal = await seedPersonal(db, user.id, "me@example.com");
    const team = await seedTeam(db, "media@example.com", [user.id], "agentic_inbox");
    await seedThreadWithMessage(db, personal, "Invoice March");
    await seedThreadWithMessage(db, team, "Invoice from partner");
    const reads = await readTools(db, user.id);

    const teamHits = payload(
      await reads.invoke("search_emails", { query: "invoice", mailbox: "media@example.com" }),
    ) as Array<{ subject: string }>;
    expect(teamHits.map((t) => t.subject)).toEqual(["Invoice from partner"]);
    const personalHits = payload(
      await reads.invoke("search_emails", { query: "invoice" }),
    ) as Array<{ subject: string }>;
    expect(personalHits.map((t) => t.subject)).toEqual(["Invoice March"]);
  });
});

test("get_email_thread returns the messages of a team mailbox thread", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, {});
    const team = await seedTeam(db, "media@example.com", [user.id], "agentic_inbox");
    const threadId = await seedThreadWithMessage(db, team, "Partner pitch");
    const reads = await readTools(db, user.id);

    const view = payload(await reads.invoke("get_email_thread", { threadId })) as {
      thread: { id: string };
      messages: Array<{ messageId: string }>;
    };
    expect(view.thread.id).toBe(threadId);
    expect(view.messages).toHaveLength(1);
  });
});

test("create_email_draft without a personal mailbox points the caller at list_mailboxes", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, {});
    await seedTeam(db, "media@example.com", [user.id]);
    const actor = await actorOf(db, user.id);
    const server = new McpServer({ name: "t", version: "1.0.0" });
    const writes = registerWriteTools(server, () => buildAppContext(db, actor), db);

    const result = await writes.invoke("create_email_draft", {
      to: ["poc@example.com"],
      subject: "Pitch",
      body: "hi",
    });
    expect(result.isError).toBe(true);
    expect(errorText(result)).toContain("list_mailboxes");
  });
});

test("the tool list includes the mailbox browsing tools", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, {});
    const actor = await actorOf(db, user.id);
    const server = buildMcpServer(() => buildAppContext(db, actor), db);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "test", version: "0.0.0" });
    await client.connect(clientTransport);
    try {
      const names = (await client.listTools()).tools.map((t) => t.name);
      expect(names).toEqual(
        expect.arrayContaining(["list_mailbox_threads", "search_emails", "get_email_thread"]),
      );
    } finally {
      await client.close();
      await server.close();
    }
  });
});
