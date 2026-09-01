import { classifyStatus, pickString } from "./http";
import {
  type Fields,
  type Node,
  nodeOf,
  orgFields,
  personFields,
  sourceId,
} from "./rocketreachFields";
import { searchPeople } from "./rocketreachSearch";
import type {
  EnrichmentProvider,
  OrgLookup,
  OutcomeKind,
  PersonLookup,
  ProviderId,
  ProviderOutcome,
} from "./types";

const PROVIDER: ProviderId = "rocketreach";
const BASE_URL = "https://api.rocketreach.co/api/v2";
const PERSON_LOOKUP_PATH = "/person/lookup";
const CHECK_STATUS_PATH = "/person/checkStatus";
const COMPANY_LOOKUP_PATH = "/company/lookup";
const API_KEY_HEADER = "Api-Key";
// Only a running search is worth polling on. Every other status is terminal ("complete", and the
// "not queued" RocketReach documents for a search that never started), so it is classified at once.
const IN_PROGRESS_STATUSES: readonly string[] = ["progress", "searching"];

// The default flips to false on 2026-09-01, so it is sent explicitly on every call.
const CACHED_EMAILS_PARAM = "return_cached_emails";

export const ROCKETREACH_POLL_BUDGET_MS = 15_000;
// Shorter than the poll budget, so one request that never answers cannot swallow the whole of it.
const REQUEST_TIMEOUT_MS = 5_000;
const FIRST_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 2_000;

const NO_IDENTIFIER = "No usable lookup identifier";
const REQUEST_TIMED_OUT = "Provider did not answer in time";
const NETWORK_FAILURE = "Provider request failed";
const UNREADABLE_BODY = "Provider returned an unreadable response";

type SleepFn = (ms: number, signal: AbortSignal) => Promise<void>;

export interface RocketReachPollOptions {
  budgetMs?: number;
  requestTimeoutMs?: number;
  sleep?: SleepFn;
  now?: () => number;
}

type Fetched = { ok: true; body: unknown } | { ok: false; outcome: ProviderOutcome };

function realSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason as Error);
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal.reason as Error);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function outcome(kind: ProviderOutcome["kind"], message?: string): ProviderOutcome {
  return message === undefined
    ? { provider: PROVIDER, kind }
    : { provider: PROVIDER, kind, message };
}

async function get(
  url: URL,
  apiKey: string,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<Fetched> {
  // The poll budget bounds the loop; this bounds the one request in flight inside it.
  const request = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
  let status: number;
  let headers: Headers;
  let text: string;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { [API_KEY_HEADER]: apiKey },
      signal: request,
    });
    status = res.status;
    headers = res.headers;
    text = await res.text();
  } catch (error) {
    if (signal.aborted) throw error;
    if (request.aborted) return { ok: false, outcome: outcome("timeout", REQUEST_TIMED_OUT) };
    return { ok: false, outcome: outcome("provider_error", NETWORK_FAILURE) };
  }
  signal.throwIfAborted();

  const classified = classifyStatus(status, text, headers);
  if (classified.kind !== "ok")
    return { ok: false, outcome: { provider: PROVIDER, ...classified } };
  try {
    return { ok: true, body: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, outcome: outcome("provider_error", UNREADABLE_BODY) };
  }
}

function found(node: Node, fields: Fields, kind: "no_match" | "timeout"): ProviderOutcome {
  if (Object.keys(fields).length === 0) return outcome(kind);
  const id = sourceId(node);
  const candidate = id === undefined ? { fields } : { fields, sourceId: id };
  return { provider: PROVIDER, kind: "ok", candidate };
}

const DURABLE_FAILURES: readonly OutcomeKind[] = ["auth", "throttled", "quota", "not_entitled"];

function pollFailure(failure: ProviderOutcome, node: Node): ProviderOutcome {
  const partial = found(node, personFields(node), "timeout");
  if (partial.candidate === undefined) return failure;
  if (!DURABLE_FAILURES.includes(failure.kind)) return partial;
  return { ...failure, candidate: partial.candidate };
}

function inProgress(node: Node): boolean {
  const status = pickString(node.status);
  return status !== undefined && IN_PROGRESS_STATUSES.includes(status);
}

function personQuery(input: PersonLookup): URLSearchParams | undefined {
  const params = new URLSearchParams();
  const profileId = pickString(input.providerRef);
  if (profileId !== undefined) params.set("id", profileId);
  const email = pickString(input.email);
  if (email !== undefined) params.set("email", email);
  const linkedin = pickString(input.linkedinUrl);
  if (linkedin !== undefined) params.set("linkedin_url", linkedin);
  const name =
    pickString(input.fullName) ??
    pickString([pickString(input.firstName), pickString(input.lastName)].join(" "));
  // A bare name is not an identifier here: RocketReach has no domain parameter, so a name with only
  // a company domain beside it would go out as a name alone and can return a different person
  // entirely. It needs an employer to disambiguate, or an email or LinkedIn URL instead.
  const employer = pickString(input.companyName);
  if (name !== undefined && employer !== undefined) {
    params.set("name", name);
    params.set("current_employer", employer);
  }
  if ([...params.keys()].length === 0) return undefined;
  params.set(CACHED_EMAILS_PARAM, "true");
  return params;
}

function url(path: string, params: URLSearchParams): URL {
  return new URL(`${BASE_URL}${path}?${params.toString()}`);
}

export async function matchPerson(
  input: PersonLookup,
  apiKey: string,
  signal: AbortSignal,
  options: RocketReachPollOptions = {},
): Promise<ProviderOutcome> {
  signal.throwIfAborted();
  const query = personQuery(input);
  if (query === undefined) return outcome("unsupported", NO_IDENTIFIER);

  const budgetMs = options.budgetMs ?? ROCKETREACH_POLL_BUDGET_MS;
  const requestMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  const sleep = options.sleep ?? realSleep;
  const now = options.now ?? Date.now;
  const startedAt = now();

  let fetched = await get(url(PERSON_LOOKUP_PATH, query), apiKey, signal, requestMs);
  if (!fetched.ok) return fetched.outcome;
  let latest = nodeOf(fetched.body);
  if (latest === undefined) return outcome("provider_error", UNREADABLE_BODY);

  for (let attempt = 0; inProgress(latest); attempt += 1) {
    const delay = Math.min(FIRST_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
    const id = sourceId(latest);
    if (id === undefined || now() - startedAt + delay >= budgetMs) break;
    await sleep(delay, signal);
    signal.throwIfAborted();
    // The request gets whatever is left of the budget, so a late poll ends inside it rather than
    // holding the fan-out open until the outer cancellation throws the partial candidate away.
    const remainingMs = budgetMs - (now() - startedAt);
    if (remainingMs <= 0) break;
    fetched = await get(
      url(CHECK_STATUS_PATH, new URLSearchParams({ id })),
      apiKey,
      signal,
      Math.min(requestMs, remainingMs),
    );
    if (!fetched.ok) return pollFailure(fetched.outcome, latest);
    latest = nodeOf(fetched.body) ?? latest;
  }

  // Still searching here means the budget ran out; anything else is the provider's last word.
  return found(latest, personFields(latest), inProgress(latest) ? "timeout" : "no_match");
}

export async function matchOrganization(
  input: OrgLookup,
  apiKey: string,
  signal: AbortSignal,
): Promise<ProviderOutcome> {
  signal.throwIfAborted();
  const domain = pickString(input.domain);
  const name = pickString(input.name);
  const params = new URLSearchParams();
  if (domain !== undefined) params.set("domain", domain);
  else if (name !== undefined) params.set("name", name);
  else return outcome("unsupported", NO_IDENTIFIER);

  const fetched = await get(url(COMPANY_LOOKUP_PATH, params), apiKey, signal, REQUEST_TIMEOUT_MS);
  if (!fetched.ok) return fetched.outcome;
  const company = nodeOf(fetched.body);
  if (company === undefined) return outcome("provider_error", UNREADABLE_BODY);
  return found(company, orgFields(company), "no_match");
}

export const rocketreachProvider: EnrichmentProvider = {
  id: PROVIDER,
  matchPerson,
  matchOrganization,
  searchPeople,
};
