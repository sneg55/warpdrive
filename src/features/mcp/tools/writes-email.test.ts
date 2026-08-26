import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sql } from "drizzle-orm";
import { expect, test } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { buildAppContext } from "@/features/mcp/actorContext";
import { hydrateActor } from "@/server/hydrateActor";
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

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
  const first = result.content[0];
  return first?.type === "text" ? (first.text ?? "") : "";
}

test("create_email_draft saves a draft in the actor's mailbox, linked to the deal", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, { isAdmin: true });
    const accountId = await seedMailbox(db, user.id, "owner@example.com");
    const dealId = await seedDeal(db, user.id);
    const actor = await hydrateActor(db, user.id, AbortSignal.timeout(5_000));
    if (actor === null) throw new Error("actor missing");

    const server = new McpServer({ name: "email-tools-test", version: "1.0.0" });
    const tools = registerWriteTools(server, () => buildAppContext(db, actor), db);
    const result = await tools.invoke("create_email_draft", {
      to: ["poc@example.com"],
      cc: ["cc@example.com"],
      subject: "Feed gaps in your GTFS",
      body: "Hi there,\n\nWe found 527 validator errors.",
      dealId,
    });

    expect(result.isError).not.toBe(true);
    const rows = (
      await db.execute(sql`
        SELECT subject, body_html, to_emails, cc_emails, link_deal_id, account_id
        FROM email_drafts
      `)
    ).rows as Array<{
      subject: string;
      body_html: string;
      to_emails: unknown;
      cc_emails: unknown;
      link_deal_id: string;
      account_id: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subject).toBe("Feed gaps in your GTFS");
    expect(rows[0]?.link_deal_id).toBe(dealId);
    expect(rows[0]?.account_id).toBe(accountId);
    expect(rows[0]?.to_emails).toEqual(["poc@example.com"]);
    expect(rows[0]?.cc_emails).toEqual(["cc@example.com"]);
  });
});

test("create_email_draft turns the plain-text body into escaped html paragraphs", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, { isAdmin: true });
    await seedMailbox(db, user.id, "owner@example.com");
    const actor = await hydrateActor(db, user.id, AbortSignal.timeout(5_000));
    if (actor === null) throw new Error("actor missing");

    const server = new McpServer({ name: "email-tools-test", version: "1.0.0" });
    const tools = registerWriteTools(server, () => buildAppContext(db, actor), db);
    await tools.invoke("create_email_draft", {
      to: ["poc@example.com"],
      subject: "Hi",
      body: "Line one\n\n<script>alert(1)</script>",
    });

    const row = (await db.execute(sql`SELECT body_html FROM email_drafts`)).rows[0] as {
      body_html: string;
    };
    expect(row.body_html).toContain("<p>Line one</p>");
    expect(row.body_html).not.toContain("<script>");
    expect(row.body_html).toContain("&lt;script&gt;");
  });
});

test("create_email_draft fails with a typed error when the actor has no connected mailbox", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, { isAdmin: true });
    const actor = await hydrateActor(db, user.id, AbortSignal.timeout(5_000));
    if (actor === null) throw new Error("actor missing");

    const server = new McpServer({ name: "email-tools-test", version: "1.0.0" });
    const tools = registerWriteTools(server, () => buildAppContext(db, actor), db);
    const result = await tools.invoke("create_email_draft", {
      to: ["poc@example.com"],
      subject: "Hi",
      body: "text",
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("E_GMAIL");
  });
});

test("create_email_draft rejects a deal id that names no deal", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, { isAdmin: true });
    await seedMailbox(db, user.id, "owner@example.com");
    const actor = await hydrateActor(db, user.id, AbortSignal.timeout(5_000));
    if (actor === null) throw new Error("actor missing");

    const server = new McpServer({ name: "email-tools-test", version: "1.0.0" });
    const tools = registerWriteTools(server, () => buildAppContext(db, actor), db);
    const result = await tools.invoke("create_email_draft", {
      to: ["poc@example.com"],
      subject: "Hi",
      body: "text",
      dealId: crypto.randomUUID(),
    });

    expect(result.isError).toBe(true);
    expect((await db.execute(sql`SELECT id FROM email_drafts`)).rows).toHaveLength(0);
  });
});

async function seedDraft(
  db: TestDb,
  accountId: string,
  fields: { dealId?: string } = {},
): Promise<string> {
  const row = (
    await db.execute(sql`
      INSERT INTO email_drafts (account_id, subject, body_html, to_emails, cc_emails, link_deal_id)
      VALUES (${accountId}, 'Original subject', '<p>Original body</p>',
        '["poc@example.com"]'::jsonb, '["cc@example.com"]'::jsonb, ${fields.dealId ?? null})
      RETURNING id
    `)
  ).rows[0] as { id: string };
  return row.id;
}

test("update_email_draft patches only the given fields and keeps the rest of the draft", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, { isAdmin: true });
    const accountId = await seedMailbox(db, user.id, "owner@example.com");
    const dealId = await seedDeal(db, user.id);
    const draftId = await seedDraft(db, accountId, { dealId });
    const actor = await hydrateActor(db, user.id, AbortSignal.timeout(5_000));
    if (actor === null) throw new Error("actor missing");

    const server = new McpServer({ name: "email-tools-test", version: "1.0.0" });
    const tools = registerWriteTools(server, () => buildAppContext(db, actor), db);
    const result = await tools.invoke("update_email_draft", {
      draftId,
      body: "Validation ships today.",
    });

    expect(result.isError).not.toBe(true);
    const row = (
      await db.execute(sql`
        SELECT subject, body_html, to_emails, cc_emails, link_deal_id FROM email_drafts
      `)
    ).rows[0] as {
      subject: string;
      body_html: string;
      to_emails: unknown;
      cc_emails: unknown;
      link_deal_id: string;
    };
    expect(row.body_html).toContain("<p>Validation ships today.</p>");
    expect(row.subject).toBe("Original subject");
    expect(row.to_emails).toEqual(["poc@example.com"]);
    expect(row.cc_emails).toEqual(["cc@example.com"]);
    expect(row.link_deal_id).toBe(dealId);
  });
});

test("update_email_draft escapes the plain-text body it is handed", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, { isAdmin: true });
    const accountId = await seedMailbox(db, user.id, "owner@example.com");
    const draftId = await seedDraft(db, accountId);
    const actor = await hydrateActor(db, user.id, AbortSignal.timeout(5_000));
    if (actor === null) throw new Error("actor missing");

    const server = new McpServer({ name: "email-tools-test", version: "1.0.0" });
    const tools = registerWriteTools(server, () => buildAppContext(db, actor), db);
    await tools.invoke("update_email_draft", {
      draftId,
      subject: "Revised",
      to: ["new@example.com"],
      cc: [],
      body: "Line one\n\n<script>alert(1)</script>",
    });

    const row = (
      await db.execute(sql`SELECT subject, body_html, to_emails, cc_emails FROM email_drafts`)
    ).rows[0] as { subject: string; body_html: string; to_emails: unknown; cc_emails: unknown };
    expect(row.subject).toBe("Revised");
    expect(row.to_emails).toEqual(["new@example.com"]);
    expect(row.cc_emails).toEqual([]);
    expect(row.body_html).toContain("<p>Line one</p>");
    expect(row.body_html).not.toContain("<script>");
  });
});

test("update_email_draft leaves the linked deal untouched", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, { isAdmin: true });
    const accountId = await seedMailbox(db, user.id, "owner@example.com");
    const dealId = await seedDeal(db, user.id);
    const draftId = await seedDraft(db, accountId, { dealId });
    const actor = await hydrateActor(db, user.id, AbortSignal.timeout(5_000));
    if (actor === null) throw new Error("actor missing");
    const before = (await db.execute(sql`SELECT updated_at, last_activity_at FROM deals`)).rows[0];

    const server = new McpServer({ name: "email-tools-test", version: "1.0.0" });
    const tools = registerWriteTools(server, () => buildAppContext(db, actor), db);
    const result = await tools.invoke("update_email_draft", { draftId, subject: "Revised" });
    expect(result.isError).not.toBe(true);

    const after = (await db.execute(sql`SELECT updated_at, last_activity_at FROM deals`)).rows[0];
    expect(after).toEqual(before);
  });
});

test("update_email_draft refuses a draft that belongs to another user", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, { isAdmin: true });
    await seedMailbox(db, user.id, "owner@example.com");
    const stranger = await seedUser(db, { email: "stranger@example.com" });
    const strangerAccount = await seedMailbox(db, stranger.id, "stranger@example.com");
    const draftId = await seedDraft(db, strangerAccount);
    const actor = await hydrateActor(db, user.id, AbortSignal.timeout(5_000));
    if (actor === null) throw new Error("actor missing");

    const server = new McpServer({ name: "email-tools-test", version: "1.0.0" });
    const tools = registerWriteTools(server, () => buildAppContext(db, actor), db);
    const result = await tools.invoke("update_email_draft", { draftId, subject: "Hijacked" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("E_GMAIL_014");
    const row = (await db.execute(sql`SELECT subject FROM email_drafts`)).rows[0] as {
      subject: string;
    };
    expect(row.subject).toBe("Original subject");
  });
});

test("delete_email_draft removes the actor's own draft", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, { isAdmin: true });
    const accountId = await seedMailbox(db, user.id, "owner@example.com");
    const draftId = await seedDraft(db, accountId);
    const actor = await hydrateActor(db, user.id, AbortSignal.timeout(5_000));
    if (actor === null) throw new Error("actor missing");

    const server = new McpServer({ name: "email-tools-test", version: "1.0.0" });
    const tools = registerWriteTools(server, () => buildAppContext(db, actor), db);
    const result = await tools.invoke("delete_email_draft", { draftId });

    expect(result.isError).not.toBe(true);
    expect((await db.execute(sql`SELECT id FROM email_drafts`)).rows).toHaveLength(0);
  });
});

test("delete_email_draft refuses a draft that belongs to another user", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, { isAdmin: true });
    await seedMailbox(db, user.id, "owner@example.com");
    const stranger = await seedUser(db, { email: "stranger@example.com" });
    const strangerAccount = await seedMailbox(db, stranger.id, "stranger@example.com");
    const draftId = await seedDraft(db, strangerAccount);
    const actor = await hydrateActor(db, user.id, AbortSignal.timeout(5_000));
    if (actor === null) throw new Error("actor missing");

    const server = new McpServer({ name: "email-tools-test", version: "1.0.0" });
    const tools = registerWriteTools(server, () => buildAppContext(db, actor), db);
    const result = await tools.invoke("delete_email_draft", { draftId });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("E_GMAIL_014");
    expect((await db.execute(sql`SELECT id FROM email_drafts`)).rows).toHaveLength(1);
  });
});

test("update_email_draft rejects a call that names no field to change", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, { isAdmin: true });
    const accountId = await seedMailbox(db, user.id, "owner@example.com");
    const draftId = await seedDraft(db, accountId);
    const actor = await hydrateActor(db, user.id, AbortSignal.timeout(5_000));
    if (actor === null) throw new Error("actor missing");

    const server = new McpServer({ name: "email-tools-test", version: "1.0.0" });
    const tools = registerWriteTools(server, () => buildAppContext(db, actor), db);
    const result = await tools.invoke("update_email_draft", { draftId, bodyHtml: "<p>wrong</p>" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("E_GMAIL_015");
    const row = (await db.execute(sql`SELECT body_html FROM email_drafts`)).rows[0] as {
      body_html: string;
    };
    expect(row.body_html).toBe("<p>Original body</p>");
  });
});

test("update_email_draft can clear the recipients of an unsent draft", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db, { isAdmin: true });
    const accountId = await seedMailbox(db, user.id, "owner@example.com");
    const draftId = await seedDraft(db, accountId);
    const actor = await hydrateActor(db, user.id, AbortSignal.timeout(5_000));
    if (actor === null) throw new Error("actor missing");

    const server = new McpServer({ name: "email-tools-test", version: "1.0.0" });
    const tools = registerWriteTools(server, () => buildAppContext(db, actor), db);
    const result = await tools.invoke("update_email_draft", { draftId, to: [] });

    expect(result.isError).not.toBe(true);
    const row = (await db.execute(sql`SELECT to_emails FROM email_drafts`)).rows[0] as {
      to_emails: unknown;
    };
    expect(row.to_emails).toEqual([]);
  });
});
