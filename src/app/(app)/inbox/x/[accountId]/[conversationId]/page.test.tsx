import { TRPCError } from "@trpc/server";
import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  conversation: vi.fn<(input: { conversationId: string }) => Promise<unknown>>(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/server/trpc/context", () => ({
  createContext: () => Promise.resolve({ actor: { id: "actor-1" } }),
}));
vi.mock("@/server/trpc/root", () => ({
  createCaller: () => ({ xDms: { conversation: state.conversation } }),
}));
vi.mock("./XConversationClient", () => ({ XConversationClient: () => null }));

import XConversationPage from "./page";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const CONVERSATION = "33333333-3333-4333-8333-333333333333";

const call = (accountId: string, conversationId: string) =>
  XConversationPage({
    params: Promise.resolve({ accountId, conversationId }),
    searchParams: Promise.resolve({}),
  });

afterEach(() => vi.clearAllMocks());

it("404s when the route account is not the conversation's account", async () => {
  state.conversation.mockResolvedValue({ conversation: { accountId: OTHER }, messages: [] });
  await expect(call(ACCOUNT, CONVERSATION)).rejects.toThrow("NEXT_NOT_FOUND");
});

it("404s when the conversation is not found", async () => {
  state.conversation.mockRejectedValue(new TRPCError({ code: "NOT_FOUND", message: "E_X_007" }));
  await expect(call(ACCOUNT, CONVERSATION)).rejects.toThrow("NEXT_NOT_FOUND");
});

it("404s on a malformed id without querying", async () => {
  await expect(call("nope", CONVERSATION)).rejects.toThrow("NEXT_NOT_FOUND");
  expect(state.conversation).not.toHaveBeenCalled();
});

it("rethrows other failures", async () => {
  state.conversation.mockRejectedValue(
    new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "E_DB_001" }),
  );
  await expect(call(ACCOUNT, CONVERSATION)).rejects.toThrow("E_DB_001");
});

it("renders when the accounts match", async () => {
  state.conversation.mockResolvedValue({ conversation: { accountId: ACCOUNT }, messages: [] });
  await expect(call(ACCOUNT, CONVERSATION)).resolves.toBeTruthy();
});
