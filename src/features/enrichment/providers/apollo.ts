import { isCanonicalKey } from "../canonical";
import { quotaRemainingFrom, selfThrottleUntil } from "./apolloHeaders";
import { searchPeople } from "./apolloSearch";
import { classifyStatus, pickNumber, pickString } from "./http";
import type {
  EnrichmentProvider,
  OrgLookup,
  OutcomeKind,
  PersonLookup,
  ProviderCandidate,
  ProviderId,
  ProviderOutcome,
} from "./types";

const PROVIDER: ProviderId = "apollo";
const PERSON_URL = "https://api.apollo.io/api/v1/people/match";
const ORG_URL = "https://api.apollo.io/api/v1/organizations/enrich";
const KEY_HEADER = "x-api-key";

const MESSAGE_BAD_BODY = "Provider response was not readable";
const MESSAGE_TIMEOUT = "Provider timed out";
const MESSAGE_UNREACHABLE = "Provider was unreachable";

type Fields = Record<string, string | number>;
type Json = Record<string, unknown>;
type Fetched = { body: Json; headers: Headers } | { outcome: ProviderOutcome };

function asObject(value: unknown): Json | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Json;
}
function firstOf(value: unknown): unknown {
  return Array.isArray(value) ? (value as unknown[])[0] : undefined;
}
function parseJson(text: string): Json | undefined {
  try {
    return asObject(JSON.parse(text) as unknown);
  } catch {
    return undefined;
  }
}

function compact(input: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    const cleaned = pickString(value);
    if (cleaned !== undefined) out[key] = cleaned;
  }
  return out;
}

function put(fields: Fields, key: string, value: string | number | undefined): void {
  if (value !== undefined && isCanonicalKey(key)) fields[key] = value;
}

function twitterHandle(value: unknown): string | undefined {
  const raw = pickString(value);
  if (raw === undefined) return undefined;
  const path = raw.split(/[?#]/)[0] ?? "";
  const last = path.replace(/\/+$/, "").split("/").pop() ?? "";
  const handle = last.replace(/^@+/, "");
  return handle.length > 0 && !handle.includes(".") ? handle : undefined;
}

function domainOf(value: unknown): string | undefined {
  const raw = pickString(value);
  if (raw === undefined) return undefined;
  const host = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split("/")[0] ?? "";
  return pickString(host.replace(/^www\./i, ""));
}

function personFields(person: Json): Fields {
  const fields: Fields = {};
  const employer = asObject(person.organization) ?? {};
  put(fields, "person.firstName", pickString(person.first_name));
  put(fields, "person.lastName", pickString(person.last_name));
  put(fields, "person.fullName", pickString(person.name));
  put(fields, "person.email", pickString(person.email));
  put(fields, "person.title", pickString(person.title));
  put(fields, "person.seniority", pickString(person.seniority));
  put(fields, "person.department", pickString(firstOf(person.departments)));
  put(fields, "person.linkedinUrl", pickString(person.linkedin_url));
  put(fields, "person.twitterHandle", twitterHandle(person.twitter_url));
  put(fields, "person.githubUrl", pickString(person.github_url));
  put(fields, "person.photoUrl", pickString(person.photo_url));
  put(fields, "person.city", pickString(person.city));
  put(fields, "person.state", pickString(person.state));
  put(fields, "person.country", pickString(person.country));
  put(fields, "person.companyName", pickString(employer.name));
  const domain = pickString(employer.primary_domain) ?? domainOf(employer.website_url);
  put(fields, "person.companyDomain", domain);
  return fields;
}

function organizationFields(org: Json): Fields {
  const fields: Fields = {};
  put(fields, "org.name", pickString(org.name));
  put(fields, "org.domain", pickString(org.primary_domain) ?? domainOf(org.website_url));
  put(fields, "org.website", pickString(org.website_url));
  put(fields, "org.industry", pickString(org.industry));
  put(fields, "org.employeeCount", pickNumber(org.estimated_num_employees));
  put(fields, "org.annualRevenue", pickNumber(org.annual_revenue));
  put(fields, "org.linkedinUrl", pickString(org.linkedin_url));
  put(fields, "org.twitterHandle", twitterHandle(org.twitter_url));
  put(fields, "org.description", pickString(org.short_description));
  put(fields, "org.foundedYear", pickNumber(org.founded_year));
  put(fields, "org.street", pickString(org.street_address));
  put(fields, "org.city", pickString(org.city));
  put(fields, "org.state", pickString(org.state));
  put(fields, "org.postalCode", pickString(org.postal_code));
  put(fields, "org.country", pickString(org.country));
  return fields;
}

function failure(kind: OutcomeKind, message: string): ProviderOutcome {
  return { provider: PROVIDER, kind, message };
}
function outcomeOf(fields: Fields, sourceId: unknown, headers: Headers): ProviderOutcome {
  const retryAfterIso = selfThrottleUntil(headers);
  const quotaRemaining = quotaRemainingFrom(headers);
  const reported = {
    ...(retryAfterIso === undefined ? {} : { retryAfterIso }),
    ...(quotaRemaining === undefined ? {} : { quotaRemaining }),
  };
  if (Object.keys(fields).length === 0) {
    return { provider: PROVIDER, kind: "no_match", ...reported };
  }
  const candidate: ProviderCandidate = { fields };
  const id = pickString(sourceId);
  if (id !== undefined) candidate.sourceId = id;
  return { provider: PROVIDER, kind: "ok", candidate, ...reported };
}

async function call(
  url: string,
  apiKey: string,
  signal: AbortSignal,
  method: "GET" | "POST" = "GET",
): Promise<Fetched> {
  const headers: Record<string, string> = { [KEY_HEADER]: apiKey, accept: "application/json" };
  if (method === "POST") headers["content-type"] = "application/json";
  try {
    const res = await fetch(url, { signal, method, headers });
    const text = await res.text();
    const status = classifyStatus(res.status, text, res.headers);
    if (status.kind !== "ok") return { outcome: { provider: PROVIDER, ...status } };
    const parsed = parseJson(text);
    if (parsed === undefined) return { outcome: failure("provider_error", MESSAGE_BAD_BODY) };
    return { body: parsed, headers: res.headers };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    return {
      outcome: timedOut
        ? failure("timeout", MESSAGE_TIMEOUT)
        : failure("provider_error", MESSAGE_UNREACHABLE),
    };
  }
}

async function matchPerson(
  input: PersonLookup,
  apiKey: string,
  signal: AbortSignal,
): Promise<ProviderOutcome> {
  const query = new URLSearchParams({
    ...compact({
      id: input.providerRef,
      email: input.email,
      linkedin_url: input.linkedinUrl,
      name: input.fullName,
      first_name: input.firstName,
      last_name: input.lastName,
      organization_name: input.companyName,
      domain: input.companyDomain,
    }),
    reveal_personal_emails: "true",
  });
  const res = await call(`${PERSON_URL}?${query.toString()}`, apiKey, signal, "POST");
  if ("outcome" in res) return res.outcome;
  const person = asObject(res.body.person);
  return outcomeOf(person === undefined ? {} : personFields(person), person?.id, res.headers);
}

async function matchOrganization(
  input: OrgLookup,
  apiKey: string,
  signal: AbortSignal,
): Promise<ProviderOutcome> {
  const query = new URLSearchParams(
    compact({ domain: input.domain, linkedin_url: input.linkedinUrl, name: input.name }),
  );
  const res = await call(`${ORG_URL}?${query.toString()}`, apiKey, signal);
  if ("outcome" in res) return res.outcome;
  const org = asObject(res.body.organization);
  return outcomeOf(org === undefined ? {} : organizationFields(org), org?.id, res.headers);
}

export const apolloProvider: EnrichmentProvider = {
  id: PROVIDER,
  matchPerson,
  matchOrganization,
  searchPeople,
};
