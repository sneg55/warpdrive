import { afterEach, describe, expect, it, vi } from "vitest";
import { makeRefresh } from "./gmailRefresh";

// Codex finding F32: makeRefresh mapped EVERY 4xx from Google's token endpoint to
// E_GMAIL_002, which ensureAccessToken (tokens.ts) treats as a genuine revocation and
// nulls refresh_token_enc. A config/deployment error (invalid_client, invalid_request)
// is a 4xx too, so a single misconfiguration could permanently destroy the stored
// refresh token across every mailbox as workers refresh. Only invalid_grant means the
// grant is actually revoked; all other statuses must be transient (E_GMAIL_001), which
// preserves the encrypted refresh token.
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("makeRefresh error classification", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps invalid_grant (revocation) to E_GMAIL_002", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse(400, { error: "invalid_grant" }))),
    );
    const refresh = makeRefresh(new AbortController().signal);
    const r = await refresh("stored-refresh-token");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.id).toBe("E_GMAIL_002");
  });

  it("maps invalid_client (config error) to transient E_GMAIL_001, not revocation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse(401, { error: "invalid_client" }))),
    );
    const refresh = makeRefresh(new AbortController().signal);
    const r = await refresh("stored-refresh-token");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.id).toBe("E_GMAIL_001");
  });

  it("maps invalid_request (4xx) to transient E_GMAIL_001, not revocation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse(400, { error: "invalid_request" }))),
    );
    const refresh = makeRefresh(new AbortController().signal);
    const r = await refresh("stored-refresh-token");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.id).toBe("E_GMAIL_001");
  });

  it("maps an unparseable 4xx body to transient E_GMAIL_001, not revocation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("<html>gateway</html>", { status: 400 }))),
    );
    const refresh = makeRefresh(new AbortController().signal);
    const r = await refresh("stored-refresh-token");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.id).toBe("E_GMAIL_001");
  });

  it("maps a 5xx to transient E_GMAIL_001", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("busy", { status: 503 }))),
    );
    const refresh = makeRefresh(new AbortController().signal);
    const r = await refresh("stored-refresh-token");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.id).toBe("E_GMAIL_001");
  });
});
