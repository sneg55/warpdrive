// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { WsFrame } from "@/features/realtime/wsMultiplexer";

const state = vi.hoisted(() => ({
  onFrame: null as ((frame: WsFrame) => void) | null,
  calls: [] as string[],
}));

vi.mock("@/features/realtime/useRealtimeChannel", () => ({
  useRealtimeChannel: (_channel: string, onFrame: (frame: WsFrame) => void) => {
    state.onFrame = onFrame;
  },
}));

const spy = (name: string) => ({ invalidate: () => state.calls.push(name) });
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      email: { ...spy("email"), thread: { get: spy("email.thread.get") } },
      xDms: {
        ...spy("xDms"),
        list: spy("xDms.list"),
        conversation: spy("xDms.conversation"),
        unreadCount: spy("xDms.unreadCount"),
        accounts: spy("xDms.accounts"),
      },
    }),
  },
}));

import { useInboxRealtime } from "./useInboxRealtime";

it("invalidates the X list, conversation, unread count and accounts on x_conversation_updated", () => {
  renderHook(() => useInboxRealtime({ selfActorId: "actor" }));
  state.onFrame?.({
    kind: "event",
    event: { type: "x_conversation_updated", data: { conversationId: "c1", accountId: "a1" } },
  } as WsFrame);
  expect(state.calls).toEqual([
    "xDms.list",
    "xDms.conversation",
    "xDms.unreadCount",
    "xDms.accounts",
  ]);
});
