import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((to: string): never => {
  throw new Error(`NEXT_REDIRECT ${to}`);
});
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));

const state: { actor: { id: string } | null; pipelines: { id: string }[] } = {
  actor: { id: "actor-1" },
  pipelines: [],
};
vi.mock("@/server/trpc/context", () => ({
  createContext: vi.fn(() => Promise.resolve({ actor: state.actor })),
}));
vi.mock("@/features/observability/serverTiming", () => ({
  timed: <T,>(_name: string, work: () => Promise<T>): Promise<T> => work(),
  timingRoute: (): Promise<void> => Promise.resolve(),
}));
vi.mock("@/server/trpc/root", () => ({
  createCaller: vi.fn(() => ({ pipeline: { list: () => Promise.resolve(state.pipelines) } })),
}));

async function landingPath(): Promise<string> {
  const { default: Home } = await import("./page");
  await expect(Home()).rejects.toThrow("NEXT_REDIRECT");
  return redirect.mock.calls.at(-1)?.[0] ?? "";
}

beforeEach(() => {
  redirect.mockClear();
  state.actor = { id: "actor-1" };
  state.pipelines = [];
});

describe("root page", () => {
  it("sends a signed-in user straight to the first pipeline board in one hop", async () => {
    state.pipelines = [{ id: "p-first" }, { id: "p-second" }];
    expect(await landingPath()).toBe("/pipeline/p-first");
  });

  it("sends a signed-out visitor straight to the login page", async () => {
    state.actor = null;
    expect(await landingPath()).toBe("/login");
  });

  it("falls back to the pipeline index when no pipeline exists yet", async () => {
    expect(await landingPath()).toBe("/pipeline");
  });
});
