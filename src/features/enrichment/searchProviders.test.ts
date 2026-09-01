import { describe, expect, it } from "vitest";
import type { EnrichmentProvider, ProviderId } from "./providers/types";
import type { UsableProvider } from "./providersRepo";
import { searchCapableProviders } from "./searchProviders";

function usable(...ids: ProviderId[]): UsableProvider[] {
  return ids.map((provider) => ({ provider, apiKey: "k", credential: Buffer.from(provider) }));
}

const base: Pick<EnrichmentProvider, "matchPerson" | "matchOrganization"> = {
  matchPerson: () => Promise.resolve({ provider: "apollo", kind: "no_match" }),
  matchOrganization: () => Promise.resolve({ provider: "apollo", kind: "no_match" }),
};

function registry(searchers: ReadonlySet<ProviderId>): (id: ProviderId) => EnrichmentProvider {
  return (id: ProviderId): EnrichmentProvider =>
    searchers.has(id)
      ? {
          id,
          ...base,
          searchPeople: () =>
            Promise.resolve({
              provider: id,
              kind: "no_match" as const,
              profiles: [],
              hasMore: false,
            }),
        }
      : { id, ...base };
}

describe("searchCapableProviders", () => {
  it("omits a provider that does not implement searchPeople", () => {
    const ids = searchCapableProviders(
      usable("apollo", "getprospect"),
      registry(new Set<ProviderId>(["apollo"])),
    );
    expect(ids).toEqual(["apollo"]);
  });

  it("keeps the fixed provider priority order rather than the usable order", () => {
    const ids = searchCapableProviders(
      usable("rocketreach", "apollo"),
      registry(new Set<ProviderId>(["apollo", "rocketreach"])),
    );
    expect(ids).toEqual(["apollo", "rocketreach"]);
  });

  it("returns nothing when no usable provider can search", () => {
    expect(searchCapableProviders(usable("getprospect"), registry(new Set()))).toEqual([]);
  });

  it("returns nothing when there is no usable provider at all", () => {
    expect(searchCapableProviders([], registry(new Set<ProviderId>(["apollo"])))).toEqual([]);
  });
});
