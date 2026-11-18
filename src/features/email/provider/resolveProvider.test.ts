import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { seedAgenticMailbox } from "../agentic.test-helpers";
import { encryptToken } from "../crypto";
import { resolveProvider } from "./resolveProvider";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function gmailAccount(refresh: string | null): Promise<string> {
  const u = await seedUser(ctx.db);
  const row = (
    await ctx.db.execute(sql`INSERT INTO email_accounts (user_id, email_address, refresh_token_enc)
      VALUES (${u.id}, ${`${u.id}@example.com`}, ${refresh === null ? null : encryptToken(refresh)}) RETURNING id`)
  ).rows[0] as { id: string };
  return row.id;
}

describe("resolveProvider", () => {
  it("returns a Gmail provider after refreshing the token", async () => {
    const http = vi.fn(() =>
      Promise.resolve(Response.json({ access_token: "tok", expires_in: 3600 })),
    );
    vi.stubGlobal("fetch", http);
    const accountId = await gmailAccount("refresh");

    const r = await resolveProvider(ctx.db, accountId, AbortSignal.timeout(8000));
    expect(r.ok && r.value.kind).toBe("gmail");
    expect(r.ok && r.value.gmail !== null && r.value.agentic === null).toBe(true);
    expect(http).toHaveBeenCalledTimes(1);
  });

  it("returns E_GMAIL_002 for a Gmail account without a refresh token", async () => {
    const accountId = await gmailAccount(null);
    const r = await resolveProvider(ctx.db, accountId, AbortSignal.timeout(8000));
    expect(r.ok ? null : r.error.id).toBe("E_GMAIL_002");
  });

  it("returns an agentic provider from the stored credentials without any request", async () => {
    const http = vi.fn();
    vi.stubGlobal("fetch", http);
    const signal = AbortSignal.timeout(8000);
    const accountId = await seedAgenticMailbox(
      ctx.db,
      { address: "media@example.com", baseUrl: "https://inbox.example", memberIds: [] },
      signal,
    );

    const r = await resolveProvider(ctx.db, accountId, signal);
    expect(r.ok && r.value.kind).toBe("agentic_inbox");
    expect(r.ok && r.value.gmail === null && r.value.agentic !== null).toBe(true);
    expect(http).not.toHaveBeenCalled();
  });

  it("returns E_AINBOX_001 for a disconnected agentic mailbox", async () => {
    const signal = AbortSignal.timeout(8000);
    const accountId = await seedAgenticMailbox(
      ctx.db,
      { address: "gone@example.com", baseUrl: "https://inbox.example", memberIds: [] },
      signal,
    );
    await ctx.db.execute(sql`UPDATE email_accounts
      SET status='disconnected', provider_credentials_enc=NULL WHERE id=${accountId}`);

    const r = await resolveProvider(ctx.db, accountId, signal);
    expect(r.ok ? null : r.error.id).toBe("E_AINBOX_001");
  });

  it("returns E_AINBOX_001 when the stored credentials do not parse", async () => {
    const signal = AbortSignal.timeout(8000);
    const accountId = await seedAgenticMailbox(
      ctx.db,
      { address: "bad@example.com", baseUrl: "https://inbox.example", memberIds: [] },
      signal,
    );
    await ctx.db.execute(sql`UPDATE email_accounts
      SET provider_credentials_enc=${encryptToken('{"clientId":1}')} WHERE id=${accountId}`);

    const r = await resolveProvider(ctx.db, accountId, signal);
    expect(r.ok ? null : r.error.id).toBe("E_AINBOX_001");
  });
});
