import type { AppError } from "@/constants/errorIds";
import type { Result } from "@/types/result";
import type { IntercomPartRaw, IntercomSourceRaw } from "./intercomSchemas";

export interface SearchItem {
  id: string;
  updatedAt: number;
}

export interface SearchPage {
  items: SearchItem[];
  nextCursor: string | null;
}

export interface IntercomConversation {
  id: string;
  title: string | null;
  state: string;
  createdAt: number;
  updatedAt: number;
  source: IntercomSourceRaw | null;
  contactIds: string[];
  parts: IntercomPartRaw[];
}

export interface IntercomContact {
  id: string;
  email: string | null;
  role: string | null;
}

export interface IntercomClient {
  searchConversations(
    args: { updatedAfter: number; startingAfter: string | null; perPage?: number },
    signal: AbortSignal,
  ): Promise<Result<SearchPage, AppError>>;
  getConversation(id: string, signal: AbortSignal): Promise<Result<IntercomConversation, AppError>>;
  getContact(id: string, signal: AbortSignal): Promise<Result<IntercomContact, AppError>>;
}

export interface IntercomHttpConfig {
  token: string;
  baseUrl: string;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  nowMs: () => number;
}
