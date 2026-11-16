import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { X_API_BASE } from "@/constants/xDms";
import { err, ok, type Result } from "@/types/result";
import type { XClient, XHttpConfig } from "./types";
import { bearer, xRequest } from "./xHttp";
import { hyphenId, type Parser, parseBody } from "./xParse";
import {
  addKeysResponseSchema,
  chatSendResponseSchema,
  publicKeysResponseSchema,
} from "./xSchemas";

const THRIFT_TYPE_STRING = 11;
const THRIFT_FIELD_ID_EVENT_ID = 1;
const THRIFT_HEADER_BYTES = 7;

type ChatMethods = Pick<XClient, "getPublicKeys" | "addConversationKeys" | "sendChatMessage">;

const snakeKey = (k: string): string => k.replaceAll(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

function snakeKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(snakeKeys);
  if (typeof v !== "object" || v === null) return v;
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [snakeKey(k), snakeKeys(x)]));
}

function firstThriftString(encoded: string): string | null {
  const buf = Buffer.from(encoded, "base64");
  if (buf.length < THRIFT_HEADER_BYTES) return null;
  if (buf.readUInt8(0) !== THRIFT_TYPE_STRING) return null;
  if (buf.readInt16BE(1) !== THRIFT_FIELD_ID_EVENT_ID) return null;
  const len = buf.readInt32BE(3);
  if (len <= 0 || buf.length < THRIFT_HEADER_BYTES + len) return null;
  return buf.subarray(THRIFT_HEADER_BYTES, THRIFT_HEADER_BYTES + len).toString("utf8");
}

export function makeChatMethods(cfg: XHttpConfig): ChatMethods {
  async function post<T>(
    path: string,
    token: string,
    body: unknown,
    schema: Parser<T>,
    signal: AbortSignal,
  ): Promise<Result<T, AppError>> {
    const url = `${X_API_BASE}${path}`;
    const res = await xRequest(
      cfg,
      {
        url,
        method: "POST",
        headers: { Authorization: bearer(token), "Content-Type": "application/json" },
        body: JSON.stringify(snakeKeys(body)),
        forbiddenIsSendRefusal: true,
      },
      signal,
    );
    if (!res.ok) return res;
    return parseBody(schema, res.value, new URL(url).pathname);
  }

  const conversationPath = (id: string, leaf: string): string =>
    `/2/chat/conversations/${encodeURIComponent(hyphenId(id))}/${leaf}`;

  return {
    async getPublicKeys(accessToken, userId, s) {
      const url = `${X_API_BASE}/2/users/${encodeURIComponent(userId)}/public_keys`;
      const res = await xRequest(
        cfg,
        { url, method: "GET", headers: { Authorization: bearer(accessToken) } },
        s,
      );
      if (!res.ok) return res;
      const parsed = parseBody(publicKeysResponseSchema, res.value, new URL(url).pathname);
      if (!parsed.ok) return parsed;
      const items = Array.isArray(parsed.value.data) ? parsed.value.data : [parsed.value.data];
      return ok(
        items.map((k) => ({
          version: k.public_key_version,
          identityPublicKey: k.public_key,
          signingPublicKey: k.signing_public_key,
          identityPublicKeySignature: k.identity_public_key_signature ?? null,
          juiceboxConfig: k.juicebox_config ?? null,
        })),
      );
    },
    async addConversationKeys(accessToken, id, body, s) {
      const r = await post(
        conversationPath(id, "keys"),
        accessToken,
        body,
        addKeysResponseSchema,
        s,
      );
      if (!r.ok) return r;
      return ok({
        conversationId: hyphenId(r.value.data.conversation_id),
        sequenceId: r.value.data.sequence_id,
      });
    },
    async sendChatMessage(accessToken, conversationId, body, s) {
      const path = conversationPath(conversationId, "messages");
      const r = await post(path, accessToken, body, chatSendResponseSchema, s);
      if (!r.ok) return r;
      const eventId = firstThriftString(r.value.data.encoded_message_event);
      if (eventId === null) {
        return err(
          new AppError(ERROR_IDS.X_PARSE_FAILED, "x message event had no leading id field", {
            path,
          }),
        );
      }
      return ok({ eventId });
    },
  };
}
