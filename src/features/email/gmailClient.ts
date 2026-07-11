import { AppError } from "@/constants/errorIds";
import { err, ok, type Result } from "@/types/result";
import {
  type GmailMessage,
  gmailMessageSchema,
  gmailProfileSchema,
  gmailThreadSchema,
  type HistoryList,
  historyListSchema,
  type MessageList,
  messageListSchema,
  type SendResult,
  sendResultSchema,
} from "./gmailSchemas";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailClient {
  historyList(a: {
    startHistoryId: string;
    pageToken?: string;
    signal: AbortSignal;
  }): Promise<Result<HistoryList, AppError>>;

  getMessage(a: { id: string; signal: AbortSignal }): Promise<Result<GmailMessage, AppError>>;

  getThread(a: {
    id: string;
    signal: AbortSignal;
  }): Promise<Result<{ id: string; messages: { id: string; labelIds: string[] }[] }, AppError>>;

  sendRaw(a: {
    rawBase64: string;
    threadId?: string;
    signal: AbortSignal;
  }): Promise<Result<SendResult, AppError>>;

  searchByRfc822(a: {
    messageIdHeader: string;
    signal: AbortSignal;
  }): Promise<Result<MessageList, AppError>>;

  getAttachment(a: {
    messageId: string;
    attachmentId: string;
    signal: AbortSignal;
  }): Promise<Result<{ dataBase64: string }, AppError>>;

  listMessages(a: {
    q?: string;
    pageToken?: string;
    signal: AbortSignal;
  }): Promise<Result<MessageList, AppError>>;

  getProfile(a: { signal: AbortSignal }): Promise<Result<{ historyId: string }, AppError>>;

  // Move a whole conversation to Gmail Trash (P4). POST threads/{id}/trash. Unlike the local
  // Archive flag this is a real Gmail mutation, so it lives on the client, not just in our DB.
  trashThread(a: {
    threadId: string;
    signal: AbortSignal;
  }): Promise<Result<{ id: string }, AppError>>;
}

// Shared fetch wrapper: validates the response through the given Zod schema
// exactly once. Returns err(AppError) on non-OK status or parse failure.
// AbortError from fetch propagates unwrapped (never converted to Result).
async function gmailFetch<T>(
  url: string,
  init: RequestInit,
  schema: { parse: (u: unknown) => T },
  signal: AbortSignal,
): Promise<Result<T, AppError>> {
  const res = await fetch(url, { ...init, signal });
  signal.throwIfAborted();
  if (!res.ok) {
    return err(
      new AppError("E_GMAIL_001", "gmail call failed", {
        status: res.status,
        statusText: res.statusText,
      }),
    );
  }
  const body: unknown = await res.json();
  signal.throwIfAborted();
  try {
    return ok(schema.parse(body));
  } catch {
    return err(new AppError("E_GMAIL_001", "gmail response failed schema validation", { body }));
  }
}

export function createGmailClient(accessToken: string): GmailClient {
  const auth = { Authorization: `Bearer ${accessToken}` } as const;

  return {
    historyList({ startHistoryId, pageToken, signal }) {
      const p = new URLSearchParams({ startHistoryId });
      if (pageToken !== undefined) p.set("pageToken", pageToken);
      return gmailFetch(
        `${API}/history?${p.toString()}`,
        { headers: auth },
        historyListSchema,
        signal,
      );
    },

    getMessage({ id, signal }) {
      return gmailFetch(
        `${API}/messages/${id}?format=full`,
        { headers: auth },
        gmailMessageSchema,
        signal,
      );
    },

    getThread({ id, signal }) {
      return gmailFetch(
        `${API}/threads/${id}?format=metadata`,
        { headers: auth },
        gmailThreadSchema,
        signal,
      );
    },

    sendRaw({ rawBase64, threadId, signal }) {
      const body = threadId !== undefined ? { raw: rawBase64, threadId } : { raw: rawBase64 };
      return gmailFetch(
        `${API}/messages/send`,
        {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify(body),
        },
        sendResultSchema,
        signal,
      );
    },

    searchByRfc822({ messageIdHeader, signal }) {
      const p = new URLSearchParams({ q: `rfc822msgid:${messageIdHeader}` });
      return gmailFetch(
        `${API}/messages?${p.toString()}`,
        { headers: auth },
        messageListSchema,
        signal,
      );
    },

    getAttachment({ messageId, attachmentId, signal }) {
      const url = `${API}/messages/${messageId}/attachments/${attachmentId}`;
      return gmailFetch(
        url,
        { headers: auth },
        {
          parse(u) {
            const raw = u as { data?: string };
            if (typeof raw.data !== "string") {
              throw new AppError("E_GMAIL_001", "attachment body missing data field", { body: u });
            }
            return { dataBase64: raw.data };
          },
        },
        signal,
      );
    },

    listMessages({ q, pageToken, signal }) {
      const p = new URLSearchParams();
      if (q !== undefined) p.set("q", q);
      if (pageToken !== undefined) p.set("pageToken", pageToken);
      const qs = p.toString();
      return gmailFetch(
        `${API}/messages${qs.length > 0 ? `?${qs}` : ""}`,
        { headers: auth },
        messageListSchema,
        signal,
      );
    },

    async getProfile({ signal }) {
      const r = await gmailFetch(`${API}/profile`, { headers: auth }, gmailProfileSchema, signal);
      if (!r.ok) return r;
      return ok({ historyId: r.value.historyId });
    },

    trashThread({ threadId, signal }) {
      return gmailFetch(
        `${API}/threads/${threadId}/trash`,
        { method: "POST", headers: auth },
        {
          // Gmail returns the trashed thread resource; we only need it succeeded. Fall back to the
          // requested id if the body omits it.
          parse(u) {
            const raw = u as { id?: string };
            return { id: typeof raw.id === "string" ? raw.id : threadId };
          },
        },
        signal,
      );
    },
  };
}
