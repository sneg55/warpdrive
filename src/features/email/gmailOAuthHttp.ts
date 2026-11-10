import { z } from "zod";
import { env } from "@/config/env";
import { AppError } from "@/constants/errorIds";
import { GOOGLE_TOKEN_URL, GOOGLE_USERINFO_URL } from "@/constants/gmailOAuth";
import { err, ok } from "@/types/result";
import { tokenResponseSchema } from "./gmailSchemas";

const userinfoSchema = z.object({
  email: z.string(),
  email_verified: z.boolean(),
  hd: z.string().nullable().default(null),
});
export const gmailOAuthDeps = {
  exchangeCode: async (code: string, signal: AbortSignal) => {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_OAUTH_CLIENT_ID,
        client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
        redirect_uri: `${env.BASE_URL}/api/gmail/oauth/callback`,
        grant_type: "authorization_code",
      }),
      signal,
    });
    signal.throwIfAborted();
    if (!res.ok) {
      return err(new AppError("E_GMAIL_001", "token exchange failed", { status: res.status }));
    }
    const t = tokenResponseSchema.safeParse(await res.json());
    signal.throwIfAborted();
    if (!t.success) {
      return err(new AppError("E_GMAIL_001", "token response failed validation", {}));
    }
    if (t.data.refresh_token === undefined) {
      return err(new AppError("E_AUTH_001", "no refresh token returned", {}));
    }
    return ok({
      accessToken: t.data.access_token,
      refreshToken: t.data.refresh_token,
      scopes: (t.data.scope ?? "").split(" ").filter((s) => s.length > 0),
    });
  },
  fetchIdentity: async (accessToken: string, signal: AbortSignal) => {
    const res = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    });
    signal.throwIfAborted();
    if (!res.ok) {
      return err(new AppError("E_GMAIL_001", "userinfo failed", { status: res.status }));
    }
    const u = userinfoSchema.safeParse(await res.json());
    signal.throwIfAborted();
    if (!u.success) {
      return err(new AppError("E_GMAIL_001", "userinfo failed validation", {}));
    }
    return ok({ email: u.data.email, emailVerified: u.data.email_verified, hd: u.data.hd });
  },
};
