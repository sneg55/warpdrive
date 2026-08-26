import { describe, expect, it } from "vitest";
import { orgDomainTerm } from "./domainTerm";

describe("orgDomainTerm", () => {
  it("strips scheme, www and path down to the indexed host", () => {
    expect(orgDomainTerm("https://www.PVTA.com/routes")).toBe("pvta.com");
    expect(orgDomainTerm("http://pvta.com")).toBe("pvta.com");
    expect(orgDomainTerm("www.pvta.com")).toBe("pvta.com");
  });

  it("takes the domain out of an email address", () => {
    expect(orgDomainTerm("jane@pvta.com")).toBe("pvta.com");
    expect(orgDomainTerm("Jane.Doe@PVTA.com")).toBe("pvta.com");
  });

  it("adds nothing when the query is already the bare host", () => {
    expect(orgDomainTerm("pvta.com")).toBeNull();
  });

  it("adds nothing for an ordinary name query", () => {
    expect(orgDomainTerm("Pioneer Valley")).toBeNull();
    expect(orgDomainTerm("pvta")).toBeNull();
    expect(orgDomainTerm("")).toBeNull();
    expect(orgDomainTerm("   ")).toBeNull();
  });

  it("keeps a subdomain rather than guessing the registrable domain", () => {
    expect(orgDomainTerm("https://mail.pvta.com")).toBe("mail.pvta.com");
  });
});
