import { classifyStatus, pickNumber, pickString } from "./http";
import type {
  PeopleSearchInput,
  PeopleSearchOutcome,
  ProspectProfile,
  ProviderId,
  ProviderOutcome,
} from "./types";

const PROVIDER: ProviderId = "getprospect";
const SEARCH_URL = "https://api.getprospect.com/public/v1/insights/contacts";
const LINKEDIN_PROFILE_BASE = "https://www.linkedin.com/in/";
const COMMON_HANDLE = "common";

const MESSAGE_BAD_BODY = "Provider returned an unreadable response";
const MESSAGE_TIMEOUT = "Provider timed out";
const MESSAGE_UNREACHABLE = "Provider was unreachable";

const SENIORITY_BANDS_THE_VENDOR_ACCEPTS: Record<string, string> = {
  owner: "Owner",
  founder: "Owner",
  c_suite: "Chief Officer",
  partner: "Partner",
  vp: "VP",
  head: "Director",
  director: "Director",
  manager: "Manager",
  senior: "Senior",
  intern: "Intern",
};

type Json = Record<string, unknown>;
type Fetched = { body: unknown } | { outcome: ProviderOutcome };

function defined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function asObject(value: unknown): Json | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Json;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function cleaned(values: readonly string[] | undefined): string[] {
  return (values ?? []).map(pickString).filter(defined);
}

function employerAt(row: Json, companyDomain: string): Json | undefined {
  const employers = asArray(row.companies).map(asObject).filter(defined);
  const matched = employers.find(
    (entry) => pickString(asObject(entry.company)?.domain)?.toLowerCase() === companyDomain,
  );
  return matched ?? employers[0];
}

function handleUrl(row: Json): string | undefined {
  const handle = asArray(row.linkedin)
    .map(asObject)
    .filter(defined)
    .find((entry) => pickString(entry.type) === COMMON_HANDLE);
  const id = pickString(handle?.id);
  return id === undefined ? undefined : `${LINKEDIN_PROFILE_BASE}${id}`;
}

function placeOf(row: Json): { city?: string; country?: string } {
  const parts = (pickString(row.geolocation) ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { country: parts[0] };
  const city = parts[0];
  const country = parts.length > 2 ? parts[parts.length - 1] : undefined;
  return country === undefined ? { city } : { city, country };
}

function optional(key: string, value: string | undefined): Record<string, string> {
  return value === undefined ? {} : { [key]: value };
}

const EVERY_SEARCHED_CONTACT_HOLDS_AN_EMAIL = true;

export function toProspectProfile(
  value: unknown,
  companyDomain: string,
): ProspectProfile | undefined {
  const row = asObject(value);
  if (row === undefined) return undefined;
  const providerRef = pickString(row.getProspectId);
  const firstName = pickString(row.firstName);
  const lastName = pickString(row.lastName);
  const fullName = [firstName, lastName].filter(defined).join(" ");
  if (providerRef === undefined || fullName.length === 0) return undefined;

  const place = placeOf(row);
  return {
    providerRef,
    fullName,
    ...optional("firstName", firstName),
    ...optional("lastName", lastName),
    ...optional("title", pickString(employerAt(row, companyDomain)?.position)),
    ...optional("linkedinUrl", handleUrl(row)),
    ...optional("city", place.city),
    ...optional("country", place.country),
    hasEmail: EVERY_SEARCHED_CONTACT_HOLDS_AN_EMAIL,
    hasPhone: false,
  };
}

function filtersOf(input: PeopleSearchInput): Json {
  const filters: Json = { domain: { included: [input.companyDomain] } };
  const titles = cleaned(input.titles);
  if (titles.length > 0) filters.jobTitle = { included: titles };
  const bands = [
    ...new Set(
      cleaned(input.seniorities)
        .map((value) => SENIORITY_BANDS_THE_VENDOR_ACCEPTS[value])
        .filter(defined),
    ),
  ];
  if (bands.length > 0) filters.seniority = { included: bands };
  return filters;
}

function empty(kind: ProviderOutcome["kind"], message?: string): PeopleSearchOutcome {
  const base: ProviderOutcome =
    message === undefined ? { provider: PROVIDER, kind } : { provider: PROVIDER, kind, message };
  return { ...base, profiles: [], hasMore: false };
}

async function post(
  input: PeopleSearchInput,
  apiKey: string,
  signal: AbortSignal,
): Promise<Fetched> {
  const query = new URLSearchParams({
    pageSize: String(input.perPage),
    pageNumber: String(input.page),
  });
  try {
    const res = await fetch(`${SEARCH_URL}?${query.toString()}`, {
      method: "POST",
      headers: {
        apiKey,
        "X-API-Key": apiKey,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(filtersOf(input)),
      signal,
    });
    const text = await res.text();
    const classified = classifyStatus(res.status, text, res.headers);
    if (classified.kind !== "ok") return { outcome: { provider: PROVIDER, ...classified } };
    try {
      return { body: JSON.parse(text) as unknown };
    } catch {
      return { outcome: { provider: PROVIDER, kind: "provider_error", message: MESSAGE_BAD_BODY } };
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return {
      outcome: {
        provider: PROVIDER,
        kind: timedOut ? "timeout" : "provider_error",
        message: timedOut ? MESSAGE_TIMEOUT : MESSAGE_UNREACHABLE,
      },
    };
  }
}

export async function searchPeople(
  input: PeopleSearchInput,
  apiKey: string,
  signal: AbortSignal,
): Promise<PeopleSearchOutcome> {
  signal.throwIfAborted();
  const res = await post(input, apiKey, signal);
  if ("outcome" in res) return { ...res.outcome, profiles: [], hasMore: false };

  const root = asObject(res.body);
  if (root === undefined || !Array.isArray(root.data))
    return empty("provider_error", MESSAGE_BAD_BODY);

  const domain = input.companyDomain.toLowerCase();
  const profiles = root.data.map((row) => toProspectProfile(row, domain)).filter(defined);
  if (profiles.length === 0) return empty("no_match");

  const meta = asObject(root.meta) ?? {};
  const page = pickNumber(meta.page);
  const totalPages = pickNumber(meta.totalPages);
  return {
    provider: PROVIDER,
    kind: "ok",
    profiles,
    hasMore: page !== undefined && totalPages !== undefined && page < totalPages,
  };
}
