import { classifyStatus, pickNumber, pickString } from "./http";
import { type Node, nodeOf, sourceId } from "./rocketreachFields";
import type {
  PeopleSearchInput,
  PeopleSearchOutcome,
  ProspectProfile,
  ProviderId,
  ProviderOutcome,
} from "./types";

const PROVIDER: ProviderId = "rocketreach";
const SEARCH_URL = "https://api.rocketreach.co/api/v2/person/search";
const API_KEY_HEADER = "Api-Key";

const MESSAGE_BAD_BODY = "Provider returned an unreadable response";
const MESSAGE_TIMEOUT = "Provider timed out";
const MESSAGE_UNREACHABLE = "Provider was unreachable";

const MANAGEMENT_LEVELS: Record<string, string> = {
  owner: "cxo",
  founder: "cxo",
  c_suite: "cxo",
  partner: "cxo",
  vp: "vp",
  head: "director",
  director: "director",
  manager: "manager",
  senior: "non_manager",
  entry: "non_manager",
  intern: "non_manager",
};

const TEASER_EMAIL_KEYS = ["emails", "professional_emails", "personal_emails", "preview"];
const TEASER_PHONE_KEYS = ["phones", "office_phones"];
const PREMIUM_PHONE_KEY = "is_premium_phone_available";

type SearchQuery = Record<string, string[]>;
type Fetched = { body: unknown } | { outcome: ProviderOutcome };

function defined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function cleaned(values: readonly string[] | undefined): string[] {
  return (values ?? []).map(pickString).filter(defined);
}

function filled(node: Node, keys: readonly string[]): boolean {
  return keys.some((key) => Array.isArray(node[key]) && (node[key] as unknown[]).length > 0);
}

export function startForPage(page: number, perPage: number): number {
  return (page - 1) * perPage + 1;
}

export function toProspectProfile(value: unknown): ProspectProfile | undefined {
  const node = nodeOf(value);
  if (node === undefined) return undefined;
  const providerRef = sourceId(node);
  const fullName = pickString(node.name);
  if (providerRef === undefined || fullName === undefined) return undefined;

  const teaser = nodeOf(node.teaser) ?? {};
  const profile: ProspectProfile = {
    providerRef,
    fullName,
    hasEmail: filled(teaser, TEASER_EMAIL_KEYS),
    hasPhone: filled(teaser, TEASER_PHONE_KEYS) || teaser[PREMIUM_PHONE_KEY] === true,
  };
  const title = pickString(node.current_title);
  if (title !== undefined) profile.title = title;
  const linkedinUrl = pickString(node.linkedin_url);
  if (linkedinUrl !== undefined) profile.linkedinUrl = linkedinUrl;
  const city = pickString(node.city);
  if (city !== undefined) profile.city = city;
  const country = pickString(node.country) ?? pickString(node.country_code);
  if (country !== undefined) profile.country = country;
  return profile;
}

function queryOf(input: PeopleSearchInput): SearchQuery {
  const query: SearchQuery = { company_domain: [input.companyDomain] };
  const titles = cleaned(input.titles);
  if (titles.length > 0) query.current_title = titles;
  const levels = cleaned(input.seniorities)
    .map((value) => MANAGEMENT_LEVELS[value])
    .filter(defined);
  const unique = [...new Set(levels)];
  if (unique.length > 0) query.management_levels = unique;
  return query;
}

function empty(kind: ProviderOutcome["kind"], message?: string): PeopleSearchOutcome {
  const base: ProviderOutcome =
    message === undefined ? { provider: PROVIDER, kind } : { provider: PROVIDER, kind, message };
  return { ...base, profiles: [], hasMore: false };
}

async function post(payload: unknown, apiKey: string, signal: AbortSignal): Promise<Fetched> {
  try {
    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        [API_KEY_HEADER]: apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
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
  const res = await post(
    {
      query: queryOf(input),
      start: startForPage(input.page, input.perPage),
      page_size: input.perPage,
    },
    apiKey,
    signal,
  );
  if ("outcome" in res) return { ...res.outcome, profiles: [], hasMore: false };

  const root = nodeOf(res.body);
  const list = root?.profiles;
  if (!Array.isArray(list)) return empty("provider_error", MESSAGE_BAD_BODY);
  const profiles = list.map(toProspectProfile).filter(defined);
  if (profiles.length === 0) return empty("no_match");

  const pagination = nodeOf(root?.pagination) ?? {};
  const next = pickNumber(pagination.next);
  const total = pickNumber(pagination.total);
  return {
    provider: PROVIDER,
    kind: "ok",
    profiles,
    hasMore: next !== undefined && total !== undefined && next <= total,
  };
}
