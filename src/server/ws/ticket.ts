import { randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { env } from "@/config/env";
import { err, ok, type Result } from "@/types/result";

const secret = new TextEncoder().encode(env.WS_TICKET_SECRET);
const TICKET_TTL_SECONDS = 60;

export async function mintTicket(args: { userId: string; sessionId: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sid: args.sessionId, jti: randomUUID() })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(args.userId)
    .setIssuedAt(now)
    .setExpirationTime(now + TICKET_TTL_SECONDS)
    .sign(secret);
}

export async function verifyTicket(
  token: string,
): Promise<Result<{ userId: string; sessionId: string; jti: string }, "invalid">> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    const sub = payload.sub;
    const sid = payload.sid;
    const jti = payload.jti;
    if (typeof sub !== "string" || typeof sid !== "string" || typeof jti !== "string") {
      return err("invalid");
    }
    return ok({ userId: sub, sessionId: sid, jti });
  } catch (cause) {
    // Log the error CLASS only for observability. Never log the token or secret.
    const reason = cause instanceof Error ? cause.constructor.name : "Unknown";
    console.warn(`ws ticket verify rejected: ${reason}`);
    return err("invalid");
  }
}
