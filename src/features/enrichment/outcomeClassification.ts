// Turning a set of provider outcomes into the one error the dialog shows. Which error it is
// decides what the user is told to do: wait, connect a provider, or add an identifier.
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { OutcomeSummary } from "./fanOut";
import type { ProviderId, ProviderOutcome } from "./providers/types";
import type { ProviderView } from "./providersRepo";

// Nothing usable reads two very different ways to an admin: nobody has configured a provider, or
// all of them are sitting out a cooldown. Saying which is the difference between a settings link
// and a time to come back.
export function noUsableProviderError(configured: readonly ProviderView[], now: Date): AppError {
  if (configured.length === 0) {
    return new AppError(ERROR_IDS.ENRICH_NO_PROVIDER, "no provider configured", {});
  }
  // Three things keep an enabled, credentialled provider out of the fan-out: a cooldown, a stored
  // key that will not decrypt, or nothing. With none of them cooling, waiting cannot help, and the
  // admin has to paste the key again.
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

// A limit lifts on its own, so the user needs the resume time. An unsupported lookup never lifts,
// so a resume time there is a deadline that means nothing; it needs the missing identifier instead.
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
  // An unreadable key outranks a cooldown, and noUsableProviderError orders them the same way:
  // only one of the two fixes itself. Told to come back at the resume time, the admin returns to
  // find that provider just as dead, and nothing else on the screen would have said so. The
  // resume time stays in the context for whoever wants it.
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

// A cached failure is classified exactly like a fresh one, except for its resume time: the run is
// replayed later than it happened, and a deadline already in the past is not a time to come back at.
export function cachedNoAnswerError(summary: OutcomeSummary, now: Date): AppError {
  const retry = summary.earliestRetryIso;
  const stale = retry !== null && retry <= now.toISOString();
  return noAnswerError(stale ? { ...summary, earliestRetryIso: null } : summary);
}

// A provider left out while its cooldown has already passed was dropped for its credential, not
// for a limit, and it carries no resume time because none of it is about a clock.
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
