import { z } from "zod";
import { TEAM_MAILBOX_BACKFILL_CHOICES } from "@/constants/teamMailbox";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const MAX_SECRET_LENGTH = 1000;

function normalizeBaseUrl(raw: string): string | null {
  const url = URL.parse(raw.trim());
  if (url === null) return null;
  const secure = url.protocol === "https:";
  const local = url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname);
  if (!secure && !local) return null;
  return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}

const baseUrl = z.string().transform((raw, ctx) => {
  const normalized = normalizeBaseUrl(raw);
  if (normalized === null) ctx.addIssue({ code: "custom", message: "invalid base url" });
  return normalized ?? "";
});

const credentials = {
  clientId: z.string().trim().min(1).max(MAX_SECRET_LENGTH),
  clientSecret: z.string().min(1).max(MAX_SECRET_LENGTH),
};

export const agenticConnectSchema = z.object({
  baseUrl,
  address: z.string().trim().toLowerCase().pipe(z.email()),
  displayName: z.string().trim().min(1).max(200),
  backfillDays: z.union([z.literal(0), ...TEAM_MAILBOX_BACKFILL_CHOICES.map((d) => z.literal(d))]),
  ...credentials,
});

export const agenticReconnectSchema = z.object({ accountId: z.uuid(), ...credentials });
