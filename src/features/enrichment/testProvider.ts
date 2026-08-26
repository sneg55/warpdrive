// Verifies a stored credential before anyone relies on it. Without this an admin finds out a key
// was mistyped only when a user clicks Fill the gaps and the footer says "key rejected".
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { err, ok, type Result } from "@/types/result";
import type { EnrichEntity } from "./canonical";
import { providerFor } from "./providers/registry";
import type {
  EnrichmentProvider,
  OutcomeKind,
  ProviderId,
  ProviderOutcome,
  QuotaRemaining,
} from "./providers/types";
import { listUsableProviders, recordOutcome } from "./providersRepo";

// The verdict plus whatever the provider volunteered about its own allowance.
export interface TestProviderOutcome {
  kind: OutcomeKind;
  quotaRemaining?: QuotaRemaining;
  notEntitled?: EnrichEntity[];
}

// A domain every provider holds, so a miss really does mean the credential or the quota is the
// problem rather than an obscure lookup.
const PROBE_DOMAIN = "apollo.io";
const PROBE_NAME = "Apollo";

// A run enriches people through a different endpoint than organizations, and on Apollo the two
// are entitled separately, so a green organization probe says nothing about the person one.
const PROBE_PERSON = {
  fullName: PROBE_NAME,
  companyName: PROBE_NAME,
  companyDomain: PROBE_DOMAIN,
};

// The person probe runs inside the calling action's budget, with room left for the bookkeeping
// writes. RocketReach polls well past this; overrunning is not a verdict about the key.
const PERSON_PROBE_MS = 3_000;

const ANSWERED: readonly OutcomeKind[] = ["ok", "no_match", "unsupported", "not_entitled"];

function verdict(outcomes: readonly ProviderOutcome[], fallback: ProviderOutcome): ProviderOutcome {
  return (
    outcomes.find((o) => !ANSWERED.includes(o.kind)) ??
    outcomes.find((o) => o.kind !== "not_entitled") ??
    fallback
  );
}

// Bounded and swallowed: an overrun or a transport failure on the person endpoint leaves the
// organization verdict standing rather than reporting a working key as broken.
async function probePerson(
  client: EnrichmentProvider,
  apiKey: string,
  signal: AbortSignal,
  budgetMs: number,
): Promise<ProviderOutcome | undefined> {
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(budgetMs)]);
  try {
    return await client.matchPerson(PROBE_PERSON, apiKey, bounded);
  } catch {
    return undefined;
  }
}

export async function testProvider(
  db: Db,
  provider: ProviderId,
  now: Date,
  signal: AbortSignal,
  resolveProvider: (id: ProviderId) => EnrichmentProvider = providerFor,
  personBudgetMs: number = PERSON_PROBE_MS,
): Promise<Result<TestProviderOutcome, AppError>> {
  signal.throwIfAborted();

  // Reuses the decrypt path rather than a second one, and deliberately ignores `enabled`: the
  // point of a test is to check a key BEFORE switching the provider on.
  const usable = await listUsableProviders(db, now, signal, { ignoreEnabled: true });
  const match = usable.find((u) => u.provider === provider);
  if (match === undefined) {
    return err(new AppError(ERROR_IDS.ENRICH_NO_KEY, "no usable key stored", { provider }));
  }

  // Both endpoints a run uses, in parallel so the test costs one wait rather than two.
  const client = resolveProvider(provider);
  const [organization, personOutcome] = await Promise.all([
    client.matchOrganization({ domain: PROBE_DOMAIN, name: PROBE_NAME }, match.apiKey, signal),
    probePerson(client, match.apiKey, signal, personBudgetMs),
  ]);

  const answers = personOutcome === undefined ? [organization] : [organization, personOutcome];
  const reported = verdict(answers, organization);

  // The probe teaches us the same things a real call does, so the cooldown and the rejected badge
  // are recorded from it too. The verdict goes last, so the row ends up describing it rather than
  // whichever endpoint happened to answer second.
  for (const answer of [...answers.filter((a) => a !== reported), reported]) {
    await recordOutcome(db, { ...answer, provider }, match.credential, now, signal);
  }

  // The freshest counts win: both probes read the same allowance, and the later one saw less of it.
  const quotaRemaining = personOutcome?.quotaRemaining ?? organization.quotaRemaining;
  const notEntitled: EnrichEntity[] = [];
  if (organization.kind === "not_entitled") notEntitled.push("organization");
  if (personOutcome?.kind === "not_entitled") notEntitled.push("person");
  return ok({
    kind: reported.kind,
    ...(quotaRemaining === undefined ? {} : { quotaRemaining }),
    ...(notEntitled.length === 0 ? {} : { notEntitled }),
  });
}
