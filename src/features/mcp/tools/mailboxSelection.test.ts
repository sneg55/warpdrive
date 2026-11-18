import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sql } from "drizzle-orm";
import { expect, test } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { buildAppContext } from "@/features/mcp/actorContext";
import { buildMcpServer } from "../server";
import { actorOf, payload, seedPersonal, seedTeam } from "./mailboxTools.test-helpers";
import { registerReadTools } from "./reads";
import { registerWriteTools } from "./writes";

const draftInput = { to: ["poc@example.com"], subject: "Pitch", body: "hi" };

test("create_email_draft with a team mailbox address drafts into that mailbox", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, {});
    await seedPersonal(db, user.id, "me@example.com");
    const teamId = await seedTeam(db, "media@example.com", [user.id], "agentic_inbox");
    const actor = await actorOf(db, user.id);
    const server = new McpServer({ name: "t", version: "1.0.0" });
    const tools = registerWriteTools(server, () => buildAppContext(db, actor), db);

    const result = await tools.invoke("create_email_draft", {
      ...draftInput,
      mailbox: "Media@Example.com",
    });

    expect(result.isError).not.toBe(true);
    const rows = (await db.execute(sql`SELECT account_id FROM email_drafts`)).rows as Array<{
      account_id: string;
    }>;
    expect(rows).toEqual([{ account_id: teamId }]);
  });
});

test("create_email_draft with an address the caller cannot use returns an error and creates nothing", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, {});
    const other = await seedUser(db, {});
    await seedPersonal(db, user.id, "me@example.com");
    await seedPersonal(db, other.id, "other@example.com");
    await seedTeam(db, "media@example.com", [other.id]);
    const actor = await actorOf(db, user.id);
    const server = new McpServer({ name: "t", version: "1.0.0" });
    const tools = registerWriteTools(server, () => buildAppContext(db, actor), db);

    for (const mailbox of ["media@example.com", "other@example.com", "nobody@example.com"]) {
      const result = await tools.invoke("create_email_draft", { ...draftInput, mailbox });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain(mailbox);
    }
    expect((await db.execute(sql`SELECT 1 FROM email_drafts`)).rows).toHaveLength(0);
  });
});

test("create_email_draft without mailbox keeps the personal mailbox", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, {});
    const personalId = await seedPersonal(db, user.id, "me@example.com");
    await seedTeam(db, "media@example.com", [user.id]);
    const actor = await actorOf(db, user.id);
    const server = new McpServer({ name: "t", version: "1.0.0" });
    const tools = registerWriteTools(server, () => buildAppContext(db, actor), db);

    const result = await tools.invoke("create_email_draft", draftInput);

    expect(result.isError).not.toBe(true);
    const rows = (await db.execute(sql`SELECT account_id FROM email_drafts`)).rows as Array<{
      account_id: string;
    }>;
    expect(rows).toEqual([{ account_id: personalId }]);
  });
});

test("list_mailboxes returns personal and team mailboxes the caller can use", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, {});
    const other = await seedUser(db, {});
    await seedPersonal(db, user.id, "me@example.com");
    await seedPersonal(db, other.id, "other@example.com");
    await seedTeam(db, "media@example.com", [user.id], "agentic_inbox");
    await seedTeam(db, "hidden@example.com", [other.id]);
    const actor = await actorOf(db, user.id);
    const server = new McpServer({ name: "t", version: "1.0.0" });
    const reads = registerReadTools(server, () => buildAppContext(db, actor));

    const result = payload(await reads.invoke("list_mailboxes", {})) as {
      mailboxes: Array<Record<string, string>>;
    };

    expect(result.mailboxes).toEqual([
      {
        address: "me@example.com",
        displayName: "me@example.com",
        kind: "personal",
        provider: "gmail",
      },
      {
        address: "media@example.com",
        displayName: "Media",
        kind: "team",
        provider: "agentic_inbox",
      },
    ]);
  });
});

test("the tool list still includes every tool", async () => {
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
      expect(names).toContain("list_mailboxes");
      expect(names).toContain("create_email_draft");
      const draft = (await client.listTools()).tools.find((t) => t.name === "create_email_draft");
      expect(draft?.inputSchema.properties).toHaveProperty("mailbox");
    } finally {
      await client.close();
      await server.close();
    }
  });
});
