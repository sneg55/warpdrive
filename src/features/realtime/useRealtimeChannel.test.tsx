// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import type React from "react";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ urls: [] as string[] }));

vi.mock("./wsMultiplexer", () => ({
  WsMultiplexer: class {
    constructor(url: string) {
      state.urls.push(url);
    }
    subscribe(): () => void {
      return () => undefined;
    }
  },
}));

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    realtime: {
      ticket: { useMutation: () => ({ mutateAsync: () => Promise.resolve({ ticket: "t" }) }) },
    },
  },
}));

beforeEach(() => {
  vi.resetModules();
  state.urls.length = 0;
});

it("connects to the URL the server provided at request time", async () => {
  const { useRealtimeChannel } = await import("./useRealtimeChannel");
  const { RealtimeUrlProvider } = await import("./RealtimeUrlProvider");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <RealtimeUrlProvider url="wss://runtime.example.com/_ws">{children}</RealtimeUrlProvider>
  );
  renderHook(() => useRealtimeChannel("pipeline:p1", vi.fn()), { wrapper });
  expect(state.urls).toEqual(["wss://runtime.example.com/_ws"]);
});

it("gets an empty URL, so it never connects, outside the provider", async () => {
  const { useRealtimeChannel } = await import("./useRealtimeChannel");
  renderHook(() => useRealtimeChannel("pipeline:p1", vi.fn()));
  expect(state.urls).toEqual([""]);
});
