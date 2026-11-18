import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { OutcomeSummary } from "./fanOut";
import type { ProviderId, ProviderOutcome } from "./providers/types";
import type { ProviderView } from "./providersRepo";

export function noUsableProviderError(configured: readonly ProviderView[], now: Date): AppError {
  if (configured.length === 0) {
    return new AppError(ERROR_IDS.ENRICH_NO_PROVIDER, "no provider configured", {});
  }
  const unreadable = configured.filter((p) => !isResting(p, now));
  if (unreadable.length > 0) {
    return new AppError(ERROR_IDS.ENRICH_KEY_UNREADABLE, "stored key could not be decrypted", {
      providers: unreadable.map((p) => p.provider),
    });
  }
  const soonest = configured
    .map((p) => p.throttledUntil)
    .filter((d): d is Date => d !== null && d > now)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  return new AppError(ERROR_IDS.ENRICH_THROTTLED, "every provider is throttled", {
    earliestRetryIso: soonest?.toISOString() ?? null,
  });
}

function isResting(provider: ProviderView, now: Date): boolean {
  return provider.throttledUntil !== null && provider.throttledUntil > now;
}

const LIMITED: readonly ProviderOutcome["kind"][] = ["throttled", "quota", "skipped"];

const NOT_BROKEN: readonly ProviderOutcome["kind"][] = [
  "unsupported",
  "key_unreadable",
  "not_entitled",
];

export function noAnswerError(summary: OutcomeSummary): AppError {
  const context = {
    reasons: summary.reasons,
    earliestRetryIso: summary.earliestRetryIso,
  };
  const entries = Object.entries(summary.reasons);
  const kinds = entries.map(([, kind]) => kind);
  const nothingBroke =
    kinds.length > 0 && kinds.every((kind) => LIMITED.includes(kind) || NOT_BROKEN.includes(kind));
  if (!nothingBroke) {
    return new AppError(ERROR_IDS.ENRICH_ALL_FAILED, "every provider failed", context);
  }
  const unreadable = entries.filter(([, kind]) => kind === "key_unreadable").map(([id]) => id);
  if (unreadable.length > 0) {
    return new AppError(ERROR_IDS.ENRICH_KEY_UNREADABLE, "stored key could not be decrypted", {
      ...context,
      providers: unreadable,
    });
  }
  if (kinds.some((kind) => LIMITED.includes(kind))) {
    return new AppError(ERROR_IDS.ENRICH_THROTTLED, "every provider is rate limited", context);
  }
  if (kinds.every((kind) => kind === "not_entitled")) {
    return new AppError(ERROR_IDS.ENRICH_NOT_ENTITLED, "no provider plan includes this lookup", {
      ...context,
      providers: entries.map(([id]) => id),
    });
  }
  return new AppError(ERROR_IDS.ENRICH_UNSUPPORTED, "no provider can use this lookup", context);
}

export function cachedNoAnswerError(summary: OutcomeSummary, now: Date): AppError {
  const retry = summary.earliestRetryIso;
  const stale = retry !== null && retry <= now.toISOString();
  return noAnswerError(stale ? { ...summary, earliestRetryIso: null } : summary);
}

function leftOut(provider: ProviderView, now: Date): ProviderOutcome {
  if (!isResting(provider, now)) {
    return {
      provider: provider.provider,
      kind: "key_unreadable",
      message: "Key could not be read",
    };
  }
  return {
    provider: provider.provider,
    kind: "skipped",
    message: provider.throttleReason === "quota" ? "Out of credits" : "Rate limit reached",
    retryAfterIso: provider.throttledUntil?.toISOString(),
  };
}

export function skippedOutcomes(
  configured: readonly ProviderView[],
  usable: readonly { provider: ProviderId }[],
  now: Date,
): ProviderOutcome[] {
  const called = new Set(usable.map((u) => u.provider));
  return configured.filter((p) => !called.has(p.provider)).map((p) => leftOut(p, now));
}
