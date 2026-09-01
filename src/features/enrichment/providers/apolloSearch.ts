import { quotaRemainingFrom, selfThrottleUntil } from "./apolloHeaders";
import { classifyStatus, pickNumber, pickString } from "./http";
import type {
  OutcomeKind,
  PeopleSearchInput,
  PeopleSearchOutcome,
  ProspectProfile,
  ProviderId,
} from "./types";

const PROVIDER: ProviderId = "apollo";
const SEARCH_URL = "https://api.apollo.io/api/v1/mixed_people/api_search";
const KEY_HEADER = "x-api-key";

const MESSAGE_BAD_BODY = "Provider response was not readable";
const MESSAGE_TIMEOUT = "Provider timed out";
const MESSAGE_UNREACHABLE = "Provider was unreachable";

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Json;
}

function parseJson(text: string): Json | undefined {
  try {
    return asObject(JSON.parse(text) as unknown);
  } catch {
    return undefined;
  }
}

function surnameOf(person: Json): string | undefined {
  return pickString(person.last_name) ?? pickString(person.last_name_obfuscated);
}

function nameOf(person: Json): string | undefined {
  const full = pickString(person.name);
  if (full !== undefined) return full;
  const parts = [pickString(person.first_name), surnameOf(person)].filter(
    (part): part is string => part !== undefined,
  );
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function affirmative(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return pickString(value)?.toLowerCase() === "yes";
}

function hasPhoneOn(person: Json): boolean {
  if (affirmative(person.has_direct_phone)) return true;
  if (pickString(person.sanitized_phone) !== undefined) return true;
  return Array.isArray(person.phone_numbers) && person.phone_numbers.length > 0;
}

function hasEmailOn(person: Json): boolean {
  return affirmative(person.has_email) || pickString(person.email) !== undefined;
}

function optional(key: string, value: string | undefined): Record<string, string> {
  return value === undefined ? {} : { [key]: value };
}

export function toProspectProfile(person: Json): ProspectProfile | undefined {
  const providerRef = pickString(person.id);
  const fullName = nameOf(person);
  if (providerRef === undefined || fullName === undefined) return undefined;
  const departments = Array.isArray(person.departments) ? person.departments : [];
  return {
    providerRef,
    fullName,
    ...optional("firstName", pickString(person.first_name)),
    ...optional("lastName", surnameOf(person)),
    ...optional("title", pickString(person.title)),
    ...optional("seniority", pickString(person.seniority)),
    ...optional("department", pickString(departments[0])),
    ...optional("linkedinUrl", pickString(person.linkedin_url)),
    ...optional("city", pickString(person.city)),
    ...optional("country", pickString(person.country)),
    hasEmail: hasEmailOn(person),
    hasPhone: hasPhoneOn(person),
  };
}

function emptyOutcome(kind: OutcomeKind, message: string): PeopleSearchOutcome {
  return { provider: PROVIDER, kind, message, profiles: [], hasMore: false };
}

function filterList(values: string[] | undefined): string[] | undefined {
  if (values === undefined) return undefined;
  const cleaned = values
    .map((value) => pickString(value))
    .filter((value): value is string => value !== undefined);
  return cleaned.length > 0 ? cleaned : undefined;
}

function requestBody(input: PeopleSearchInput): Json {
  const titles = filterList(input.titles);
  const seniorities = filterList(input.seniorities);
  return {
    q_organization_domains_list: [input.companyDomain],
    ...(titles === undefined ? {} : { person_titles: titles }),
    ...(seniorities === undefined ? {} : { person_seniorities: seniorities }),
    page: input.page,
    per_page: input.perPage,
  };
}

function profilesOf(body: Json): ProspectProfile[] {
  const people = Array.isArray(body.people) ? body.people : [];
  const profiles: ProspectProfile[] = [];
  for (const entry of people) {
    const person = asObject(entry);
    if (person === undefined) continue;
    const profile = toProspectProfile(person);
    if (profile !== undefined) profiles.push(profile);
  }
  return profiles;
}

function hasMoreOf(body: Json, input: PeopleSearchInput): boolean {
  const total = pickNumber(body.total_entries);
  if (total === undefined) return false;
  return input.page * input.perPage < total;
}

export async function searchPeople(
  input: PeopleSearchInput,
  apiKey: string,
  signal: AbortSignal,
): Promise<PeopleSearchOutcome> {
  let text: string;
  let response: Response;
  try {
    response = await fetch(SEARCH_URL, {
      signal,
      method: "POST",
      headers: {
        [KEY_HEADER]: apiKey,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody(input)),
    });
    text = await response.text();
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    return timedOut
      ? emptyOutcome("timeout", MESSAGE_TIMEOUT)
      : emptyOutcome("provider_error", MESSAGE_UNREACHABLE);
  }

  const status = classifyStatus(response.status, text, response.headers);
  if (status.kind !== "ok") {
    return { provider: PROVIDER, ...status, profiles: [], hasMore: false };
  }
  const parsed = parseJson(text);
  if (parsed === undefined) return emptyOutcome("provider_error", MESSAGE_BAD_BODY);

  const profiles = profilesOf(parsed);
  const retryAfterIso = selfThrottleUntil(response.headers);
  const quotaRemaining = quotaRemainingFrom(response.headers);
  return {
    provider: PROVIDER,
    kind: profiles.length > 0 ? "ok" : "no_match",
    ...(retryAfterIso === undefined ? {} : { retryAfterIso }),
    ...(quotaRemaining === undefined ? {} : { quotaRemaining }),
    profiles,
    hasMore: hasMoreOf(parsed, input),
  };
}
