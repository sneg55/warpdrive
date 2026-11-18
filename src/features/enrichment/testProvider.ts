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

export interface TestProviderOutcome {
  kind: OutcomeKind;
  quotaRemaining?: QuotaRemaining;
  notEntitled?: EnrichEntity[];
}

const PROBE_DOMAIN = "apollo.io";
const PROBE_NAME = "Apollo";

const PROBE_PERSON = {
  fullName: PROBE_NAME,
  companyName: PROBE_NAME,
  companyDomain: PROBE_DOMAIN,
};

const PERSON_PROBE_MS = 3_000;

const ANSWERED: readonly OutcomeKind[] = ["ok", "no_match", "unsupported", "not_entitled"];

function verdict(outcomes: readonly ProviderOutcome[], fallback: ProviderOutcome): ProviderOutcome {
  return (
    outcomes.find((o) => !ANSWERED.includes(o.kind)) ??
    outcomes.find((o) => o.kind !== "not_entitled") ??
    fallback
  );
}

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

  const usable = await listUsableProviders(db, now, signal, { ignoreEnabled: true });
  const match = usable.find((u) => u.provider === provider);
  if (match === undefined) {
    return err(new AppError(ERROR_IDS.ENRICH_NO_KEY, "no usable key stored", { provider }));
  }

  const client = resolveProvider(provider);
  const [organization, personOutcome] = await Promise.all([
    client.matchOrganization({ domain: PROBE_DOMAIN, name: PROBE_NAME }, match.apiKey, signal),
    probePerson(client, match.apiKey, signal, personBudgetMs),
  ]);

  const answers = personOutcome === undefined ? [organization] : [organization, personOutcome];
  const reported = verdict(answers, organization);

  for (const answer of [...answers.filter((a) => a !== reported), reported]) {
    await recordOutcome(db, { ...answer, provider }, match.credential, now, signal);
  }

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
