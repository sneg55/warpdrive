import { sql } from "drizzle-orm";
import { EMAIL_PROVIDER_KIND } from "@/constants/email";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { err, ok, type Result } from "@/types/result";
import { createGmailClient } from "../gmailClient";
import { makeRefresh } from "../gmailRefresh";
import { ensureAccessToken } from "../tokens";
import { createAgenticClient } from "./agenticClient";
import { decryptAgenticCredentials } from "./agenticCredentials";
import { agenticProvider } from "./agenticProvider";
import { gmailProvider } from "./gmailProvider";
import type { MailProvider } from "./types";

interface ProviderRow {
  provider: string;
  status: string;
  email_address: string;
  provider_base_url: string | null;
  provider_credentials_enc: Buffer | null;
}

function resolveAgentic(row: ProviderRow, accountId: string): Result<MailProvider, AppError> {
  if (
    row.status === "disconnected" ||
    row.provider_base_url === null ||
    row.provider_credentials_enc === null
  ) {
    return err(
      new AppError(ERROR_IDS.AINBOX_AUTH_FAILED, "agentic inbox is not connected", { accountId }),
    );
  }
  const credentials = decryptAgenticCredentials(row.provider_credentials_enc);
  if (!credentials.ok) return credentials;
  const client = createAgenticClient({
    baseUrl: row.provider_base_url,
    mailbox: row.email_address,
    ...credentials.value,
  });
  return ok(agenticProvider(client, row.email_address));
}

export async function resolveProvider(
  db: Db,
  accountId: string,
  signal: AbortSignal,
): Promise<Result<MailProvider, AppError>> {
  signal.throwIfAborted();
  const rows = await db.execute(sql`SELECT provider, status, email_address, provider_base_url,
    provider_credentials_enc FROM email_accounts WHERE id=${accountId}`);
  signal.throwIfAborted();
  const row = rows.rows[0] as ProviderRow | undefined;
  if (row?.provider === EMAIL_PROVIDER_KIND.agenticInbox) return resolveAgentic(row, accountId);
  const token = await ensureAccessToken(db, {
    accountId,
    deps: { refresh: makeRefresh(signal) },
  });
  if (!token.ok) return token;
  return ok(gmailProvider(createGmailClient(token.value.token)));
}
