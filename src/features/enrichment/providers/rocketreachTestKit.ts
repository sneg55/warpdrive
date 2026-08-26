// Stubs shared by the RocketReach test files, which are split to stay under the file-size rule.
import { vi } from "vitest";
import personSearching from "./__fixtures__/rocketreach-person-searching.json";
import { ROCKETREACH_POLL_BUDGET_MS } from "./rocketreach";
import type { ProviderOutcome } from "./types";

export type Spy = ReturnType<typeof vi.fn>;

export const API_KEY = "rr-secret-value";
export const LOOKUP = { email: "ada@analyticalengines.com" };

export function body(
  payload: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(typeof payload === "string" ? payload : JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

// Unconsumed calls keep answering "searching", which is what a budget cutoff needs.
export function stubFetch(...responses: Response[]): Spy {
  const spy = vi.fn(() => Promise.resolve(responses.shift() ?? body(personSearching)));
  vi.stubGlobal("fetch", spy);
  return spy;
}

// Answers the given responses, then models a request that never replies: only its signal ends it.
export function hangingFetch(...responses: Response[]): Spy {
  const spy = vi.fn((_url: URL, init: { signal: AbortSignal }) => {
    const next = responses.shift();
    if (next !== undefined) return Promise.resolve(next);
    return new Promise<Response>((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason as Error), {
        once: true,
      });
    });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

// Virtual clock: the injected sleep advances it, so a cutoff is reached with no real waiting.
export function opts(budgetMs = ROCKETREACH_POLL_BUDGET_MS): {
  budgetMs: number;
  slept: number[];
  now: () => number;
  sleep: (ms: number) => Promise<void>;
} {
  let elapsed = 0;
  const slept: number[] = [];
  return {
    budgetMs,
    slept,
    now: () => elapsed,
    sleep: (ms: number) => {
      slept.push(ms);
      elapsed += ms;
      return Promise.resolve();
    },
  };
}

export function urlOf(spy: Spy, call = 0): string {
  return String((spy.mock.calls[call] as [URL, RequestInit])[0]);
}

export function initOf(spy: Spy, call = 0): RequestInit {
  return (spy.mock.calls[call] as [URL, RequestInit])[1];
}

export function fields(out: ProviderOutcome): Record<string, string | number> {
  return out.candidate?.fields ?? {};
}

export function resumesInMs(out: ProviderOutcome): number {
  return Date.parse(out.retryAfterIso ?? "") - Date.now();
}

export const signal = (): AbortSignal => new AbortController().signal;
