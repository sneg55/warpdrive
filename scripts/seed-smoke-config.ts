/**
 * scripts/seed-smoke-config.ts
 *
 * Constants and env-reading for the smoke seed script.
 * This file uses process.env directly: scripts/ are dev tooling that run
 * outside the Next.js app and cannot use src/config/env.ts without satisfying
 * every required env var (MINIO, WS keys, etc.). The ESLint override for
 * scripts/** permits this.
 */

export const DATABASE_URL: string = (() => {
  const v = process.env.DATABASE_URL;
  if (v === undefined || v.length === 0) throw new Error("DATABASE_URL is not set");
  return v;
})();

export const WORKSPACE_DOMAIN = process.env.GOOGLE_WORKSPACE_DOMAIN ?? "example.com";
export const BASE_CURRENCY = process.env.BASE_CURRENCY ?? "USD";

export const SMOKE_EMAIL = `smoke@${WORKSPACE_DOMAIN}`;
// Must match src/features/auth/devLogin.ts: sub = `dev-${email}`
export const SMOKE_GOOGLE_SUB = `dev-${SMOKE_EMAIL}`;

// Fixed values so re-runs always target the same rows.
export const SMOKE_PIPELINE_NAME = "BD";
export const SMOKE_STAGE_NAME = "Lead";
export const SMOKE_GMAIL_THREAD_ID = "smoke-thread-1";
export const SMOKE_MSG_IN_ID = "smoke-msg-in-1";
export const SMOKE_MSG_OUT_ID = "smoke-msg-out-1";
export const SMOKE_IDEMPOTENCY_KEY = "00000000-0000-0000-0000-000000000001";
export const SMOKE_MESSAGE_ID_HEADER = "<smoke-send-attempt-1@warpdrive.local>";
export const SMOKE_OPEN_TOKEN = "smoketokenopen1";

export const SMOKE_INBOUND_BODY_HTML = `<p>Hi, can we discuss the Acme renewal?</p>
<a href="https://acme.com/renewal">View details</a>
<img src="https://example.com/pixel.png" alt="">`;
