import type { AppError } from "@/constants/errorIds";
import type { Result } from "@/types/result";

export interface XTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string[];
}

export interface XUser {
  id: string;
  username: string;
  name: string;
  profileImageUrl: string | null;
}

export interface XChatConversation {
  id: string;
  type: string;
  participantIds: string[];
  unread: boolean;
  newestEventId: string | null;
}

export interface XRawEvent {
  id: string;
  conversationId: string;
  senderId: string;
  createdAt: Date;
  isTrusted: boolean | null;
  encodedEvent: string;
}

export interface XPage<T> {
  items: T[];
  users: XUser[];
  nextToken: string | null;
}

export interface XClient {
  exchangeCode(
    a: { code: string; codeVerifier: string },
    s: AbortSignal,
  ): Promise<Result<XTokens, AppError>>;
  refresh(refreshToken: string, s: AbortSignal): Promise<Result<XTokens, AppError>>;
  revoke(token: string, s: AbortSignal): Promise<Result<void, AppError>>;
  getMe(accessToken: string, s: AbortSignal): Promise<Result<XUser, AppError>>;
  listConversations(
    accessToken: string,
    a: { maxResults: number; paginationToken?: string },
    s: AbortSignal,
  ): Promise<Result<XPage<XChatConversation>, AppError>>;
  listEvents(
    accessToken: string,
    a: { conversationId: string; maxResults: number; paginationToken?: string },
    s: AbortSignal,
  ): Promise<Result<XPage<XRawEvent>, AppError>>;
  sendDm(
    accessToken: string,
    a: { participantId: string; text: string },
    s: AbortSignal,
  ): Promise<Result<{ eventId: string; conversationId: string }, AppError>>;
}

export interface XHttpConfig {
  fetch: typeof fetch;
  sleep: (ms: number, s: AbortSignal) => Promise<void>;
  nowMs: () => number;
}
