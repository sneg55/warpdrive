import { describe, expect, it } from "vitest";
import { isCanonicalKey } from "../canonical";
import personComplete from "./__fixtures__/rocketreach-person-complete.json";
import personEmailsInvalid from "./__fixtures__/rocketreach-person-emails-invalid.json";
import personEmailsMixed from "./__fixtures__/rocketreach-person-emails-mixed.json";
import personEmailsUnverified from "./__fixtures__/rocketreach-person-emails-unverified.json";
import { type Node, personFields } from "./rocketreachFields";

function emailOf(person: unknown): string | number | undefined {
  return personFields(person as Node)["person.email"];
}

describe("personFields email selection", () => {
  it("returns no email at all when every address is marked invalid", () => {
    const fields = personFields(personEmailsInvalid);
    expect(fields["person.email"]).toBeUndefined();
    expect("person.email" in fields).toBe(false);
    expect(Object.keys(fields).every(isCanonicalKey)).toBe(true);
  });

  it("prefers a valid address over earlier invalid and unknown ones", () => {
    expect(emailOf(personEmailsMixed)).toBe("ada@analyticalengines.com");
    expect(emailOf(personComplete)).toBe("ada@analyticalengines.com");
  });

  it("falls back to an unknown-validity address when no address is marked valid", () => {
    expect(emailOf(personEmailsUnverified)).toBe("ada@guessed.example.com");
    expect(emailOf({ emails: [{ email: "ada@nostatus.example.com" }] })).toBe(
      "ada@nostatus.example.com",
    );
  });
});
