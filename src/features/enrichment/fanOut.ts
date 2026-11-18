import type {
  EnrichmentProvider,
  OutcomeKind,
  ProviderId,
  ProviderOutcome,
} from "./providers/types";
import type { UsableProvider } from "./providersRepo";

const ANSWERED: readonly OutcomeKind[] = ["ok", "no_match"];

export const PROVIDER_DEADLINE_MS = 20_000;

export interface FanOutInput {
  usable: readonly UsableProvider[];
  providerFor: (id: ProviderId) => EnrichmentProvider;
  call: (
    provider: EnrichmentProvider,
    apiKey: string,
    signal: AbortSignal,
  ) => Promise<ProviderOutcome>;
  signal: AbortSignal;
  deadlineMs?: number;
}

export async function fanOut(input: FanOutInput): Promise<ProviderOutcome[]> {
  if (input.usable.length === 0) return [];
  const deadlineMs = input.deadlineMs ?? PROVIDER_DEADLINE_MS;

  const settled = await Promise.allSettled(
    input.usable.map(async ({ provider, apiKey }) => {
      const outcome = await callWithin(input, provider, apiKey, deadlineMs);
      return { ...outcome, provider };
    }),
  );

  input.signal.throwIfAborted();

  return settled.map((result, index) => {
    const provider = input.usable[index]?.provider ?? "apollo";
    if (result.status === "fulfilled") return result.value;
    return { provider, ...failureOf(result.reason) };
  });
}

async function callWithin(
  input: FanOutInput,
  provider: ProviderId,
  apiKey: string,
  deadlineMs: number,
): Promise<ProviderOutcome> {
  const signal = AbortSignal.any([input.signal, AbortSignal.timeout(deadlineMs)]);
  return await Promise.race([
    input.call(input.providerFor(provider), apiKey, signal),
    aborted(signal),
  ]);
}

function aborted(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason as Error);
      return;
    }
    signal.addEventListener("abort", () => reject(signal.reason as Error), { once: true });
  });
}

function failureOf(reason: unknown): { kind: OutcomeKind; message: string } {
  const name = reason instanceof Error ? reason.name : "";
  if (name === "AbortError" || name === "TimeoutError") {
    return { kind: "timeout", message: "Timed out" };
  }
  return { kind: "provider_error", message: "Unavailable" };
}

export interface OutcomeSummary {
  anySucceeded: boolean;
  reasons: Partial<Record<ProviderId, OutcomeKind>>;
  earliestRetryIso: string | null;
}

export function summariseOutcomes(outcomes: readonly ProviderOutcome[]): OutcomeSummary {
  const reasons: Partial<Record<ProviderId, OutcomeKind>> = {};
  let earliest: string | null = null;

  for (const outcome of outcomes) {
    if (!ANSWERED.includes(outcome.kind)) reasons[outcome.provider] = outcome.kind;
    if (outcome.retryAfterIso === undefined) continue;
    if (earliest === null || outcome.retryAfterIso < earliest) earliest = outcome.retryAfterIso;
  }

  return {
    anySucceeded: outcomes.some((o) => ANSWERED.includes(o.kind) || o.candidate !== undefined),
    reasons,
    earliestRetryIso: earliest,
  };
}
