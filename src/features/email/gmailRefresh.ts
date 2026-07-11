import { env } from "@/config/env";
import { AppError } from "@/constants/errorIds";
import { err, ok, type Result } from "@/types/result";
import { tokenResponseSchema } from "./gmailSchemas";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

// Build the deps.refresh callback ensureAccessToken (Task 7) needs: exchange a stored
// refresh token for a fresh access token at Google's token endpoint. Shared by the
// interactive send action and the system-send primitive so there is one refresh path.
// Only OAuth error=invalid_grant means the grant is genuinely revoked (E_GMAIL_002,
// which disconnects the account and nulls the stored refresh token). Every other non-OK,
// including config errors like invalid_client/invalid_request that also return 4xx, is
// transient (E_GMAIL_001) so a single misconfiguration can never destroy refresh tokens
// across mailboxes (F32). A rotated refresh_token is passed through so it gets re-encrypted.
// Threaded with the request signal so an aborted send cannot keep the refresh alive.
export function makeRefresh(
  signal: AbortSignal,
): (
  refreshToken: string,
) => Promise<Result<{ accessToken: string; expiresIn: number; refreshToken?: string }, AppError>> {
  return async (refreshToken: string) => {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_OAUTH_CLIENT_ID,
        client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      signal,
    });
    signal.throwIfAborted();
    if (!res.ok) {
      // Classify by Google's OAuth error code, not the raw status: only invalid_grant
      // definitively means the grant was revoked. Anything unparseable stays transient.
      const oauthError = await res
        .clone()
        .json()
        .then((b: unknown) =>
          typeof b === "object" && b !== null && "error" in b ? b.error : null,
        )
        .catch(() => null);
      const id = oauthError === "invalid_grant" ? "E_GMAIL_002" : "E_GMAIL_001";
      return err(new AppError(id, "token refresh failed", { status: res.status, oauthError }));
    }
    const parsed = tokenResponseSchema.safeParse(await res.json());
    if (!parsed.success) return err(new AppError("E_GMAIL_001", "token response invalid", {}));
    return ok({
      accessToken: parsed.data.access_token,
      expiresIn: parsed.data.expires_in,
      refreshToken: parsed.data.refresh_token,
    });
  };
}
