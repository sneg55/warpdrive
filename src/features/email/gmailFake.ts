import { AppError } from "@/constants/errorIds";
import { err, ok, type Result } from "@/types/result";
import type { GmailClient } from "./gmailClient";
import type { GmailMessage, HistoryList, MessageList, SendResult } from "./gmailSchemas";

// Programmable in-memory Gmail double. Tests inject this; the DB is NEVER faked.
// Satisfies the identical GmailClient interface so it is a drop-in.
export class FakeGmailClient implements GmailClient {
  // Programmable state: set these before calling methods under test.
  historyPages: HistoryList[] = [];
  messages = new Map<string, GmailMessage>();
  searchHits = new Map<string, MessageList>();
  sendImpl: (a: { rawBase64: string; threadId?: string }) => Result<SendResult, AppError> = () =>
    ok({ id: "sent-1", threadId: "t1" });

  // listMessages pages: pageToken "0","1",... indexes into this array.
  // listMessages({}) with no pageToken uses index 0.
  listResults: MessageList[] = [];

  // getProfile returns this historyId.
  profileHistoryId = "0";

  // trashThread returns this result; default success. Set to an err() to exercise the failure path.
  trashImpl: (a: { threadId: string }) => Result<{ id: string }, AppError> = (a) =>
    ok({ id: a.threadId });

  // getThread looks up by gmail thread id; absent ids return an empty message list.
  threads = new Map<string, { id: string; messages: { id: string; labelIds: string[] }[] }>();

  // Thread ids getThread should 404 on (a purged/permanently-deleted Gmail thread).
  getThread404Ids = new Set<string>();

  // Records every call received so tests can assert what was requested.
  calls: { method: string; args: unknown }[] = [];

  historyList(a: {
    startHistoryId: string;
    pageToken?: string;
    signal: AbortSignal;
  }): Promise<Result<HistoryList, AppError>> {
    a.signal.throwIfAborted();
    this.calls.push({ method: "historyList", args: a });
    const idx = a.pageToken !== undefined ? Number(a.pageToken) : 0;
    const page = this.historyPages[idx];
    return Promise.resolve(ok(page ?? { historyId: a.startHistoryId, history: [] }));
  }

  getMessage(a: { id: string; signal: AbortSignal }): Promise<Result<GmailMessage, AppError>> {
    a.signal.throwIfAborted();
    this.calls.push({ method: "getMessage", args: a });
    const msg = this.messages.get(a.id);
    return Promise.resolve(ok(msg ?? { id: a.id, threadId: "t1", labelIds: [] }));
  }

  getThread(a: {
    id: string;
    signal: AbortSignal;
  }): Promise<Result<{ id: string; messages: { id: string; labelIds: string[] }[] }, AppError>> {
    a.signal.throwIfAborted();
    this.calls.push({ method: "getThread", args: a });
    if (this.getThread404Ids.has(a.id)) {
      return Promise.resolve(err(new AppError("E_GMAIL_001", "thread not found", { status: 404 })));
    }
    return Promise.resolve(ok(this.threads.get(a.id) ?? { id: a.id, messages: [] }));
  }

  sendRaw(a: {
    rawBase64: string;
    threadId?: string;
    signal: AbortSignal;
  }): Promise<Result<SendResult, AppError>> {
    a.signal.throwIfAborted();
    this.calls.push({ method: "sendRaw", args: a });
    return Promise.resolve(this.sendImpl(a));
  }

  searchByRfc822(a: {
    messageIdHeader: string;
    signal: AbortSignal;
  }): Promise<Result<MessageList, AppError>> {
    a.signal.throwIfAborted();
    this.calls.push({ method: "searchByRfc822", args: a });
    const hits = this.searchHits.get(a.messageIdHeader);
    return Promise.resolve(ok(hits ?? { messages: [] }));
  }

  getAttachment(a: {
    messageId: string;
    attachmentId: string;
    signal: AbortSignal;
  }): Promise<Result<{ dataBase64: string }, AppError>> {
    a.signal.throwIfAborted();
    this.calls.push({ method: "getAttachment", args: a });
    return Promise.resolve(ok({ dataBase64: "" }));
  }

  listMessages(a: {
    q?: string;
    pageToken?: string;
    signal: AbortSignal;
  }): Promise<Result<MessageList, AppError>> {
    a.signal.throwIfAborted();
    this.calls.push({ method: "listMessages", args: a });
    const idx = a.pageToken !== undefined ? Number(a.pageToken) : 0;
    const page = this.listResults[idx];
    return Promise.resolve(ok(page ?? { messages: [] }));
  }

  getProfile(a: { signal: AbortSignal }): Promise<Result<{ historyId: string }, AppError>> {
    a.signal.throwIfAborted();
    this.calls.push({ method: "getProfile", args: a });
    return Promise.resolve(ok({ historyId: this.profileHistoryId }));
  }

  trashThread(a: {
    threadId: string;
    signal: AbortSignal;
  }): Promise<Result<{ id: string }, AppError>> {
    a.signal.throwIfAborted();
    this.calls.push({ method: "trashThread", args: a });
    return Promise.resolve(this.trashImpl({ threadId: a.threadId }));
  }
}
