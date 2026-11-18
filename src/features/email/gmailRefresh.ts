import { env } from "@/config/env";
import { AppError } from "@/constants/errorIds";
import { err, ok, type Result } from "@/types/result";
import { tokenResponseSchema } from "./gmailSchemas";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

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
