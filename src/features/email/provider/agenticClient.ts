import { type AppError, ERROR_IDS } from "@/constants/errorIds";
import { ok, type Result } from "@/types/result";
import {
  type AgenticClientConfig,
  createAgenticHttp,
  fail,
  HTTP_BAD_REQUEST,
  HTTP_CONFLICT,
  HTTP_NOT_FOUND,
  HTTP_OK,
  HTTP_TOO_MANY_REQUESTS,
  HTTP_UNAVAILABLE,
  HTTP_UNPROCESSABLE,
  isAbort,
  parseRetryAfter,
  REQUIRED_WARPDRIVE_CAPABILITY,
  readJson,
} from "./agenticHttp";
import {
  type AgenticMailbox,
  type AgenticSendBody,
  type AgenticSendResult,
  type ChangeEmail,
  capabilitiesSchema,
  changesResponseSchema,
  forkSingleEmailSchema,
  headResponseSchema,
  mailboxSchema,
  sendErrorSchema,
  sendOkSchema,
} from "./agenticSchemas";

export type { AgenticClientConfig } from "./agenticHttp";

export interface AgenticClient {
  capabilities(signal: AbortSignal): Promise<Result<{ warpdrive: number }, AppError>>;
  getMailbox(signal: AbortSignal): Promise<Result<AgenticMailbox, AppError>>;
  head(signal: AbortSignal): Promise<Result<number, AppError>>;
  changes(a: {
    after: number;
    limit: number;
    signal: AbortSignal;
  }): Promise<Result<{ emails: ChangeEmail[]; cursor: number }, AppError>>;
  getEmail(a: { id: string; signal: AbortSignal }): Promise<Result<ChangeEmail, AppError>>;
  send(a: {
    body: AgenticSendBody;
    signal: AbortSignal;
  }): Promise<Result<AgenticSendResult, AppError>>;
  getAttachment(a: {
    emailId: string;
    attachmentId: string;
    signal: AbortSignal;
  }): Promise<Result<Uint8Array, AppError>>;
}

export function createAgenticClient(cfg: AgenticClientConfig): AgenticClient {
  const { mailboxPath, raw, getJson } = createAgenticHttp(cfg);

  async function send(a: {
    body: AgenticSendBody;
    signal: AbortSignal;
  }): Promise<Result<AgenticSendResult, AppError>> {
    const res = await raw(`${mailboxPath}/emails`, a.signal, { method: "POST", body: a.body });
    if (!res.ok) return res;
    const r = res.value;
    if (r.status === HTTP_NOT_FOUND || r.status === HTTP_BAD_REQUEST) {
      return ok({ status: "rejected", code: null });
    }
    if (r.status === HTTP_TOO_MANY_REQUESTS) {
      return ok({ status: "retry_later", reason: "limit", retryAfterSeconds: parseRetryAfter(r) });
    }
    if (r.status === HTTP_UNAVAILABLE)
      return ok({ status: "retry_later", reason: "temporary", retryAfterSeconds: null });
    if (r.status === HTTP_CONFLICT) return ok({ status: "unknown" });
    const json = await readJson(r);
    if (r.status === HTTP_UNPROCESSABLE) {
      const parsed = sendErrorSchema.safeParse(json);
      return ok({ status: "rejected", code: parsed.success ? (parsed.data.code ?? null) : null });
    }
    if (r.status !== HTTP_OK) return ok({ status: "unknown" });
    const parsed = sendOkSchema.safeParse(json);
    if (!parsed.success) {
      return fail(ERROR_IDS.AINBOX_SCHEMA_FAILED, "agentic inbox send response did not match");
    }
    return ok({ status: "sent", ...parsed.data });
  }

  return {
    async capabilities(signal) {
      const r = await getJson("/api/v1/capabilities", capabilitiesSchema, signal);
      if (!r.ok) {
        const notFork =
          r.error.id === ERROR_IDS.AINBOX_MAILBOX_NOT_FOUND ||
          r.error.id === ERROR_IDS.AINBOX_SCHEMA_FAILED;
        return notFork
          ? fail(ERROR_IDS.AINBOX_NOT_FORK, "agentic inbox is not the warpdrive fork")
          : r;
      }
      if (r.value.warpdrive < REQUIRED_WARPDRIVE_CAPABILITY) {
        return fail(ERROR_IDS.AINBOX_NOT_FORK, "agentic inbox is not the warpdrive fork");
      }
      return r;
    },
    getMailbox: (signal) => getJson(mailboxPath, mailboxSchema, signal),
    async head(signal) {
      const r = await getJson(`${mailboxPath}/changes/head`, headResponseSchema, signal);
      return r.ok ? ok(r.value.cursor) : r;
    },
    changes: ({ after, limit, signal }) =>
      getJson(
        `${mailboxPath}/changes?after=${after}&limit=${limit}`,
        changesResponseSchema,
        signal,
      ),
    getEmail: ({ id, signal }) =>
      getJson(
        `${mailboxPath}/emails/${encodeURIComponent(id)}`,
        forkSingleEmailSchema,
        signal,
        ERROR_IDS.AINBOX_MESSAGE_NOT_FOUND,
      ),
    send,
    async getAttachment({ emailId, attachmentId, signal }) {
      const res = await raw(
        `${mailboxPath}/emails/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}`,
        signal,
      );
      if (!res.ok) return res;
      if (res.value.status === HTTP_NOT_FOUND) {
        return fail(ERROR_IDS.AINBOX_MESSAGE_NOT_FOUND, "agentic message not found");
      }
      if (res.value.status !== HTTP_OK) {
        return fail(ERROR_IDS.AINBOX_TRANSPORT_FAILED, "agentic inbox attachment failed", {
          status: res.value.status,
        });
      }
      try {
        return ok(new Uint8Array(await res.value.arrayBuffer()));
      } catch (e) {
        if (isAbort(e)) throw e;
        return fail(ERROR_IDS.AINBOX_TRANSPORT_FAILED, "agentic inbox attachment read failed");
      }
    },
  };
}
