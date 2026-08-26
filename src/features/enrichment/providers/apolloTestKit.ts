// Stubs shared by the Apollo test files, which are split to stay under the file-size rule.
import { vi } from "vitest";
import { apolloProvider } from "./apollo";
import type { OrgLookup, PersonLookup, ProviderOutcome } from "./types";

export type FetchSpy = ReturnType<typeof vi.fn>;

export const API_KEY = "sk-apollo-secret-value";
export const NOW = new Date("2026-08-24T12:00:00.000Z");
export const MISS: ProviderOutcome = { provider: "apollo", kind: "no_match" };

export const signal = (): AbortSignal => new AbortController().signal;

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

export function stubFetch(response: Response): FetchSpy {
  const spy = vi.fn(() => Promise.resolve(response));
  vi.stubGlobal("fetch", spy);
  return spy;
}

export function stubReject(name: string): void {
  const fail = (): Promise<Response> => Promise.reject(Object.assign(new Error("boom"), { name }));
  vi.stubGlobal("fetch", vi.fn(fail));
}

export function callOf(spy: FetchSpy): { url: string; init: RequestInit } {
  const [url, init] = spy.mock.calls[0] as [string, RequestInit];
  return { url, init };
}

export function sentQuery(spy: FetchSpy): Record<string, string> {
  return Object.fromEntries(new URL(callOf(spy).url).searchParams);
}

export function endpointOf(spy: FetchSpy): string {
  const parsed = new URL(callOf(spy).url);
  return `${parsed.origin}${parsed.pathname}`;
}

export const person = (i: PersonLookup = { email: "a@b.co" }): Promise<ProviderOutcome> =>
  apolloProvider.matchPerson(i, API_KEY, signal());

export const org = (i: OrgLookup = { domain: "apollo.io" }): Promise<ProviderOutcome> =>
  apolloProvider.matchOrganization(i, API_KEY, signal());

export function freeze(): void {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
}
