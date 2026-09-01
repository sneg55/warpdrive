import { describe, expect, it } from "vitest";
import type { UsableProvider } from "./providersRepo";
import { identifiableProviders, nameIsObfuscated } from "./revealIdentifiable";

const USABLE: UsableProvider[] = [
  { provider: "apollo", apiKey: "a", credential: Buffer.from("a") },
  { provider: "getprospect", apiKey: "g", credential: Buffer.from("g") },
];

describe("nameIsObfuscated", () => {
  it("recognises the surname mask Apollo's api_search returns", () => {
    expect(nameIsObfuscated("Manish Ma***i")).toBe(true);
  });

  it("leaves a real name alone", () => {
    expect(nameIsObfuscated("Ada Lovelace")).toBe(false);
  });
});

describe("identifiableProviders", () => {
  it("fans out to everyone when the name is real", () => {
    expect(identifiableProviders(USABLE, "apollo", "Ada Lovelace").map((u) => u.provider)).toEqual([
      "apollo",
      "getprospect",
    ]);
  });

  it("keeps only the provider holding the profile id when the name is masked", () => {
    expect(identifiableProviders(USABLE, "apollo", "Manish Ma***i").map((u) => u.provider)).toEqual(
      ["apollo"],
    );
  });

  it("returns nothing rather than guessing when the searching provider is not usable", () => {
    expect(identifiableProviders([USABLE[1] as UsableProvider], "apollo", "Manish Ma***i")).toEqual(
      [],
    );
  });
});
