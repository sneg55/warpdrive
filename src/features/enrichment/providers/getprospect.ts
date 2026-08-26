import { err, ok, type Result } from "@/types/result";
import { classifyStatus, pickNumber, pickString } from "./http";
import type {
  EnrichmentProvider,
  OrgLookup,
  PersonLookup,
  ProviderCandidate,
  ProviderOutcome,
} from "./types";

const PROVIDER_ID = "getprospect" as const;

// Confirmed against https://getprospect.readme.io/llms.txt on 2026-08-24.
const BASE_URL = "https://api.getprospect.com";
const EMAIL_FINDER_PATH = "/v2/email-finder";
const EMAIL_LOOKUP_PATH = "/public/v1/email/lookup";
const LINKEDIN_CONTACT_PATH = "/public/v1/insights/contact";
const COMPANY_SEARCH_PATH = "/public/v1/insights/companies";
const COMPANY_PAGE_SIZE = "1";
const EMAIL_MISS = "GetProspect does not hold that address";
const LINKEDIN_MISS = "No contact for that LinkedIn profile";
const MESSAGE_TIMEOUT = "Provider timed out";
const MESSAGE_UNREACHABLE = "Provider was unreachable";
// Documented as "entity not found" on the insights and lookup endpoints, so a miss, not an outage.
const NOT_FOUND = 404;

// Not confirmed against a live key. Correct these here rather than hunting through the file.
// Both key header names go on every request: the OpenAPI securitySchemes names `apiKey` while the
// vendor guide uses `X-API-Key`. An unread header costs nothing, whereas sending only the wrong
// one 401s on a valid key and reads back as a rejected credential.
// The email status vocabulary is documented on the insights DTO and assumed to hold on the v2
// finder and the v1 lookup, neither of which enumerates the values its `status` can take.
const UNVERIFIED: { apiKeyHeaders: readonly string[]; rejectedEmailStatuses: readonly string[] } = {
  apiKeyHeaders: ["apiKey", "X-API-Key"],
  rejectedEmailStatuses: ["not found", "not_found", "invalid", "blocked"],
};

type Fields = Record<string, string | number>;
type Json = Record<string, unknown>;

function outcome(kind: ProviderOutcome["kind"], message: string): ProviderOutcome {
  return { provider: PROVIDER_ID, kind, message };
}

function asObject(value: unknown): Json | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Json;
}

// The v2 finder is documented both flat and wrapped in { success, data, errors }, and the company
// search always wraps. Accepting either shape keeps one parser for all three endpoints.
function unwrap(body: unknown): unknown {
  const root = asObject(body);
  if (root === undefined) return body;
  return "data" in root ? root.data : root;
}

function put(fields: Fields, key: string, value: string | number | undefined): void {
  if (value !== undefined) fields[key] = value;
}

function candidate(fields: Fields, sourceId: string | undefined): ProviderCandidate | undefined {
  if (Object.keys(fields).length === 0) return undefined;
  return sourceId === undefined ? { fields } : { fields, sourceId };
}

// A miss on either email endpoint is a 200 carrying a status and no usable address.
function acceptedEmail(payload: Json): string | undefined {
  const email = pickString(payload.email);
  if (email === undefined) return undefined;
  const status = pickString(payload.status)?.toLowerCase();
  if (status !== undefined && UNVERIFIED.rejectedEmailStatuses.includes(status)) return undefined;
  return email;
}

function personFromContact(body: unknown): ProviderCandidate | undefined {
  const contact = asObject(unwrap(body));
  if (contact === undefined) return undefined;
  const fields: Fields = {};
  const first = pickString(contact.firstName);
  const last = pickString(contact.lastName);
  put(fields, "person.firstName", first);
  put(fields, "person.lastName", last);
  if (first !== undefined && last !== undefined) fields["person.fullName"] = `${first} ${last}`;
  put(fields, "person.email", acceptedEmail(contact));
  const employer = asObject(Array.isArray(contact.company) ? contact.company[0] : undefined);
  put(fields, "person.companyName", pickString(employer?.name));
  put(fields, "person.companyDomain", pickString(employer?.domain));
  const geo = asObject(contact.geolocation);
  put(fields, "person.city", pickString(geo?.location));
  put(fields, "person.state", pickString(geo?.region));
  put(fields, "person.country", pickString(geo?.countryCode));
  return candidate(fields, pickString(contact.getProspectId));
}

function personFromEmail(body: unknown): ProviderCandidate | undefined {
  const found = asObject(unwrap(body));
  if (found === undefined) return undefined;
  const email = acceptedEmail(found);
  if (email === undefined) return undefined;
  const fields: Fields = { "person.email": email };
  put(fields, "person.companyDomain", pickString(found.domain));
  return candidate(fields, undefined);
}

function orgFromCompany(body: unknown): ProviderCandidate | undefined {
  const page = unwrap(body);
  const org = asObject(Array.isArray(page) ? page[0] : page);
  if (org === undefined) return undefined;
  const fields: Fields = {};
  put(fields, "org.name", pickString(org.name));
  put(fields, "org.domain", pickString(org.domain));
  put(fields, "org.description", pickString(org.description));
  put(fields, "org.industry", pickString(org.industry));
  put(fields, "org.employeeCount", pickNumber(org.size));
  put(fields, "org.postalCode", pickString(org.postalCode));
  const geo = asObject(org.location);
  put(fields, "org.city", pickString(geo?.location));
  put(fields, "org.state", pickString(geo?.region));
  put(fields, "org.country", pickString(geo?.countryCode));
  return candidate(fields, pickString(org.getProspectId));
}

async function call(
  url: string,
  apiKey: string,
  signal: AbortSignal,
  payload?: unknown,
): Promise<Result<unknown, ProviderOutcome>> {
  const headers: Record<string, string> = { accept: "application/json" };
  for (const name of UNVERIFIED.apiKeyHeaders) headers[name] = apiKey;
  if (payload !== undefined) headers["content-type"] = "application/json";
  try {
    const response = await fetch(url, {
      method: payload === undefined ? "GET" : "POST",
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal,
    });
    // Hand the normalisers an empty body so each reports its own no-match message.
    if (response.status === NOT_FOUND) return ok(undefined);
    const text = await response.text();
    const classified = classifyStatus(response.status, text, response.headers);
    if (classified.kind !== "ok") return err({ provider: PROVIDER_ID, ...classified });
    try {
      return ok(JSON.parse(text) as unknown);
    } catch {
      return err(outcome("provider_error", "Response was not readable"));
    }
  } catch (error) {
    // An abort is the caller cancelling and is rethrown. AbortSignal.timeout rejects with a
    // TimeoutError instead, which is a slow provider, not a dead one.
    if (error instanceof Error && error.name === "AbortError") throw error;
    if (error instanceof Error && error.name === "TimeoutError") {
      return err(outcome("timeout", MESSAGE_TIMEOUT));
    }
    return err(outcome("provider_error", MESSAGE_UNREACHABLE));
  }
}

function found(match: ProviderCandidate | undefined, missed: string): ProviderOutcome {
  if (match === undefined) return outcome("no_match", missed);
  return { provider: PROVIDER_ID, kind: "ok", candidate: match };
}

// The finder is an email lookup, not a directory: without a name AND either a domain or a company
// there is nothing to send, so say what is missing rather than spend a call that cannot match.
function emailFinderParams(input: PersonLookup): Result<URLSearchParams, string> {
  const params = new URLSearchParams();
  const full = pickString(input.fullName);
  const first = pickString(input.firstName);
  const last = pickString(input.lastName);
  if (full !== undefined) params.set("full_name", full);
  else if (first !== undefined && last !== undefined) {
    params.set("first_name", first);
    params.set("last_name", last);
  } else return err("a full name");

  const domain = pickString(input.companyDomain);
  const name = pickString(input.companyName);
  if (domain !== undefined) params.set("domain", domain);
  else if (name !== undefined) params.set("company", name);
  else return err("a company domain or company name");
  return ok(params);
}

async function matchPerson(
  input: PersonLookup,
  apiKey: string,
  signal: AbortSignal,
): Promise<ProviderOutcome> {
  // Email is the strongest identifier we hold, so it is spent first; the lookup confirms an
  // address the finder can only guess at. A miss here still leaves the other two routes.
  const email = pickString(input.email);
  let missed: string | undefined;
  if (email !== undefined) {
    const query = new URLSearchParams({ email }).toString();
    const res = await call(`${BASE_URL}${EMAIL_LOOKUP_PATH}?${query}`, apiKey, signal);
    if (!res.ok) return res.error;
    const byEmail = found(personFromEmail(res.value), EMAIL_MISS);
    if (byEmail.kind === "ok") return byEmail;
    missed = byEmail.message;
  }
  const linkedinUrl = pickString(input.linkedinUrl);
  if (linkedinUrl !== undefined) {
    const query = new URLSearchParams({ linkedinUrl }).toString();
    const res = await call(`${BASE_URL}${LINKEDIN_CONTACT_PATH}?${query}`, apiKey, signal);
    if (!res.ok) return res.error;
    const byLinkedin = found(personFromContact(res.value), LINKEDIN_MISS);
    if (byLinkedin.kind === "ok") return byLinkedin;
    // Vanity URLs go stale, so a miss here is weaker evidence than an email miss and never
    // displaces one already recorded.
    missed ??= byLinkedin.message;
  }
  const params = emailFinderParams(input);
  if (!params.ok) {
    return outcome("no_match", missed ?? `GetProspect needs ${params.error} to find an email`);
  }
  const query = params.value.toString();
  const res = await call(`${BASE_URL}${EMAIL_FINDER_PATH}?${query}`, apiKey, signal);
  if (!res.ok) return res.error;
  return found(personFromEmail(res.value), "No email found for that name and company");
}

async function matchOrganization(
  input: OrgLookup,
  apiKey: string,
  signal: AbortSignal,
): Promise<ProviderOutcome> {
  const domain = pickString(input.domain);
  const name = pickString(input.name);
  const filter =
    domain !== undefined
      ? { domain: { included: [domain] } }
      : name !== undefined
        ? { name: { included: [name] } }
        : undefined;
  if (filter === undefined) {
    return outcome("no_match", "GetProspect needs a company domain or name to search");
  }
  const query = new URLSearchParams({ pageSize: COMPANY_PAGE_SIZE }).toString();
  const res = await call(`${BASE_URL}${COMPANY_SEARCH_PATH}?${query}`, apiKey, signal, filter);
  if (!res.ok) return res.error;
  return found(orgFromCompany(res.value), "No company matched");
}

export const getprospectProvider: EnrichmentProvider = {
  id: PROVIDER_ID,
  matchPerson,
  matchOrganization,
};
