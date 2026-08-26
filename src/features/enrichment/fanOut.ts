// Calls every usable provider at once and collects one outcome each. One provider failing must
// never abandon the other two, which is the whole reason this is allSettled and not Promise.all.
import type {
  EnrichmentProvider,
  OutcomeKind,
  ProviderId,
  ProviderOutcome,
} from "./providers/types";
import type { UsableProvider } from "./providersRepo";

// A provider that answered, even to say it found nothing. Anything else is a failure to answer.
const ANSWERED: readonly OutcomeKind[] = ["ok", "no_match"];

// Wider than RocketReach's 15s poll budget, so its own cutoff is what ends a poll, not this one.
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
      // A provider stamping the wrong id would misattribute a value in the dialog and write the
      // cooldown onto someone else's row.
      return { ...outcome, provider };
    }),
  );

  // The caller giving up cancels the run: a cancelled click is not an outage, and recorded as
  // outcomes it would persist an all-failed run for the next click to replay. Only a provider's
  // own deadline, which leaves this signal untouched, becomes an outcome.
  input.signal.throwIfAborted();

  return settled.map((result, index) => {
    const provider = input.usable[index]?.provider ?? "apollo";
    if (result.status === "fulfilled") return result.value;
    return { provider, ...failureOf(result.reason) };
  });
}

// Each provider gets its own clock, so one hang costs only that provider and not the whole wait.
async function callWithin(
  input: FanOutInput,
  provider: ProviderId,
  apiKey: string,
  deadlineMs: number,
): Promise<ProviderOutcome> {
  const signal = AbortSignal.any([input.signal, AbortSignal.timeout(deadlineMs)]);
  // Raced, because a provider that ignores its signal must still not hold the others open.
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
  // An abort is us giving up on the clock, not the provider misbehaving, and the two read very
  // differently in the dialog footer.
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
    // A provider can fail and still hand back data: RocketReach answers with cached fields and
    // then hits a 429 mid-poll, and that outcome keeps the throttled kind so the cooldown gets
    // recorded. Judging success on kind alone would throw away fields we are holding whenever
    // that provider was the only one enabled.
    anySucceeded: outcomes.some((o) => ANSWERED.includes(o.kind) || o.candidate !== undefined),
    reasons,
    earliestRetryIso: earliest,
  };
}
