import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sql } from "drizzle-orm";
import { expect, test } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { buildAppContext } from "@/features/mcp/actorContext";
import { hydrateActor } from "@/server/hydrateActor";
import { registerReadTools } from "./reads";
import { registerWriteTools } from "./writes";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

async function seedMailbox(db: TestDb, userId: string, email: string): Promise<string> {
  const row = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${userId}, ${email}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  return row.id;
}

async function seedDeal(db: TestDb, ownerId: string): Promise<string> {
  const { pipeline, stages } = await seedPipelineWithStages(db, ["Qualified"]);
  const row = (
    await db.execute(sql`
      INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level)
      VALUES ('MCP Deal', ${pipeline.id}, ${stages[0]?.id}, ${ownerId}, 'all')
      RETURNING id
    `)
  ).rows[0] as { id: string };
  return row.id;
}

function payload(result: { content: Array<{ type: string; text?: string }> }): unknown {
  const first = result.content[0];
  return first?.type === "text" ? JSON.parse(first.text ?? "null") : null;
}

test("list_email_drafts returns the drafts written for one deal", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, { isAdmin: true });
    await seedMailbox(db, user.id, "owner@example.com");
    const dealId = await seedDeal(db, user.id);
    const actor = await hydrateActor(db, user.id, AbortSignal.timeout(5_000));
    if (actor === null) throw new Error("actor missing");
    const ctx = () => buildAppContext(db, actor);

    const server = new McpServer({ name: "email-reads-test", version: "1.0.0" });
    const writes = registerWriteTools(server, ctx, db);
    await writes.invoke("create_email_draft", {
      to: ["poc@example.com"],
      subject: "On the deal",
      body: "hi",
      dealId,
    });
    await writes.invoke("create_email_draft", {
      to: ["other@example.com"],
      subject: "Unlinked",
      body: "hi",
    });

    const reads = registerReadTools(server, ctx);
    const scoped = payload(await reads.invoke("list_email_drafts", { dealId })) as Array<{
      subject: string;
    }>;
    expect(scoped.map((d) => d.subject)).toEqual(["On the deal"]);

    const all = payload(await reads.invoke("list_email_drafts", {})) as Array<{ subject: string }>;
    expect(all.map((d) => d.subject).sort()).toEqual(["On the deal", "Unlinked"]);
  });
});

test("list_emails returns the messages linked to a deal", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, { isAdmin: true });
    const accountId = await seedMailbox(db, user.id, "owner@example.com");
    const dealId = await seedDeal(db, user.id);
    const thread = (
      await db.execute(sql`
        INSERT INTO email_threads (gmail_thread_id, account_id, deal_id, visibility)
        VALUES ('t1', ${accountId}, ${dealId}, 'shared') RETURNING id
      `)
    ).rows[0] as { id: string };
    await db.execute(sql`
      INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, subject, body_html, sent_at)
      VALUES (${thread.id}, ${accountId}, 'm1', 'outbound', 'owner@example.com', 'Sent already', '<p>body</p>', now())
    `);
    const actor = await hydrateActor(db, user.id, AbortSignal.timeout(5_000));
    if (actor === null) throw new Error("actor missing");

    const server = new McpServer({ name: "email-reads-test", version: "1.0.0" });
    const reads = registerReadTools(server, () => buildAppContext(db, actor));
    const rows = payload(await reads.invoke("list_emails", { dealId })) as Array<{
      subject: string;
      messageId: string;
    }>;

    expect(rows.map((m) => m.subject)).toEqual(["Sent already"]);

    const one = payload(await reads.invoke("get_email", { messageId: rows[0]?.messageId })) as {
      bodyHtml: string;
    };
    expect(one.bodyHtml).toContain("body");
  });
});

test("list_emails rejects a call that names neither a deal nor a person", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, { isAdmin: true });
    const actor = await hydrateActor(db, user.id, AbortSignal.timeout(5_000));
    if (actor === null) throw new Error("actor missing");

    const server = new McpServer({ name: "email-reads-test", version: "1.0.0" });
    const reads = registerReadTools(server, () => buildAppContext(db, actor));

    expect((await reads.invoke("list_emails", {})).isError).toBe(true);
  });
});
