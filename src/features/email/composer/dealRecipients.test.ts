import { describe, expect, it } from "vitest";
import { dealDefaultRecipients } from "./dealRecipients";

describe("dealDefaultRecipients", () => {
  it("returns just the primary contact when the prefill preference is off", () => {
    expect(
      dealDefaultRecipients(
        { defaultTo: "a@x.com", participantEmails: ["b@x.com", "c@x.com"] },
        false,
      ),
    ).toEqual(["a@x.com"]);
  });

  it("returns an empty list when off and there is no primary contact", () => {
    expect(dealDefaultRecipients({ participantEmails: ["b@x.com"] }, false)).toEqual([]);
  });

  it("unions the primary contact with all participants when the preference is on", () => {
    expect(
      dealDefaultRecipients(
        { defaultTo: "a@x.com", participantEmails: ["b@x.com", "c@x.com"] },
        true,
      ),
    ).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
  });

  it("dedupes when the primary contact is also a participant", () => {
    expect(
      dealDefaultRecipients(
        { defaultTo: "a@x.com", participantEmails: ["a@x.com", "b@x.com"] },
        true,
      ),
    ).toEqual(["a@x.com", "b@x.com"]);
  });

  it("drops empty entries", () => {
    expect(
      dealDefaultRecipients({ defaultTo: "", participantEmails: ["b@x.com", ""] }, true),
    ).toEqual(["b@x.com"]);
  });
});
