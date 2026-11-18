import { AppError } from "@/constants/errorIds";
import { err, ok, type Result } from "@/types/result";
import type { GmailClient } from "./gmailClient";
import type { GmailMessage, HistoryList, MessageList, SendResult } from "./gmailSchemas";

export class FakeGmailClient implements GmailClient {
  historyPages: HistoryList[] = [];
  messages = new Map<string, GmailMessage>();
  searchHits = new Map<string, MessageList>();
  sendImpl: (a: { rawBase64: string; threadId?: string }) => Result<SendResult, AppError> = () =>
    ok({ id: "sent-1", threadId: "t1" });

  listResults: MessageList[] = [];

  profileHistoryId = "0";

  trashImpl: (a: { threadId: string }) => Result<{ id: string }, AppError> = (a) =>
    ok({ id: a.threadId });

  threads = new Map<string, { id: string; messages: { id: string; labelIds: string[] }[] }>();

  getThread404Ids = new Set<string>();

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
    includeSpamTrash?: boolean;
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
