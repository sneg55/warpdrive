import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sql } from "drizzle-orm";
import { expect, test } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { buildAppContext } from "@/features/mcp/actorContext";
import { hydrateActor } from "@/server/hydrateActor";
import { buildMcpServer } from "../server";
import { registerReadTools } from "./reads";
import { registerWriteTools } from "./writes";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

async function seedPersonal(db: TestDb, userId: string, email: string): Promise<string> {
  const row = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${userId}, ${email}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  return row.id;
}

async function seedTeam(
  db: TestDb,
  email: string,
  memberIds: string[],
  provider: "gmail" | "agentic_inbox" = "gmail",
): Promise<string> {
  const row = (
    await db.execute(
      sql`INSERT INTO email_accounts (kind, email_address, display_name, status)
        VALUES ('team', ${email}, 'Media', ${provider === "gmail" ? "connected" : "disconnected"}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  if (provider === "agentic_inbox") {
    await db.execute(sql`UPDATE email_accounts SET provider='agentic_inbox' WHERE id=${row.id}`);
  }
  for (const id of memberIds) {
    await db.execute(sql`INSERT INTO email_account_members VALUES (${row.id}, ${id})`);
  }
  return row.id;
}

function payload(result: { content: Array<{ type: string; text?: string }> }): unknown {
  const first = result.content[0];
  return first?.type === "text" ? JSON.parse(first.text ?? "null") : null;
}

async function actorOf(db: TestDb, userId: string) {
  const actor = await hydrateActor(db, userId, AbortSignal.timeout(5_000));
  if (actor === null) throw new Error("actor missing");
  return actor;
}

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
