import { describe, expect, it } from "vitest";
import { buildParticipantOptions } from "./participantOptions";

describe("buildParticipantOptions", () => {
  it("always includes the deal's contact person, even when the deal has an org", () => {
    const orgPeople = [{ id: "kai", name: "Kai Carter" }];
    const options = buildParticipantOptions(orgPeople, "mia", "Mia Silva");

    expect(options).toEqual([
      { id: "mia", name: "Mia Silva" },
      { id: "kai", name: "Kai Carter" },
    ]);
  });

  it("lists the deal's contact person first", () => {
    const options = buildParticipantOptions(
      [{ id: "kai", name: "Kai Carter" }],
      "mia",
      "Mia Silva",
    );
    expect(options[0]?.id).toBe("mia");
  });

  it("de-dupes when the deal's person is also an org member", () => {
    const orgPeople = [
      { id: "mia", name: "Mia Silva" },
      { id: "kai", name: "Kai Carter" },
    ];
    const options = buildParticipantOptions(orgPeople, "mia", "Mia Silva");

    expect(options).toEqual([
      { id: "mia", name: "Mia Silva" },
      { id: "kai", name: "Kai Carter" },
    ]);
  });

  it("falls back to a placeholder name when the deal's person name is unknown", () => {
    const options = buildParticipantOptions([], "mia", undefined);
    expect(options).toEqual([{ id: "mia", name: "Deal contact" }]);
  });

  it("returns just the org people when there is no deal person", () => {
    const orgPeople = [{ id: "kai", name: "Kai Carter" }];
    expect(buildParticipantOptions(orgPeople, null, undefined)).toEqual(orgPeople);
  });

  it("returns an empty list when there is neither a deal person nor org people", () => {
    expect(buildParticipantOptions([], null, undefined)).toEqual([]);
  });
});
