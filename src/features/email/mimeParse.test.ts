import { describe, expect, it } from "vitest";
import type { GmailMessage } from "./gmailSchemas";
import { parseGmailMessage } from "./mimeParse";

function msgWithHeaders(headers: { name: string; value: string }[]): GmailMessage {
  return {
    id: "m1",
    threadId: "t1",
    snippet: "hi",
    payload: { headers },
  } as GmailMessage;
}

describe("parseGmailMessage From-header parsing", () => {
  it("splits a quoted display-name From into fromName + bare fromEmail", () => {
    const parsed = parseGmailMessage(
      msgWithHeaders([{ name: "From", value: '"Scrape.do Team" <support@scrape.do>' }]),
    );
    expect(parsed.fromName).toBe("Scrape.do Team");
    expect(parsed.fromEmail).toBe("support@scrape.do");
  });

  it("splits an unquoted display-name From into fromName + bare fromEmail", () => {
    const parsed = parseGmailMessage(
      msgWithHeaders([{ name: "From", value: "Nick Sawinyh <nick@gunsnation.com>" }]),
    );
    expect(parsed.fromName).toBe("Nick Sawinyh");
    expect(parsed.fromEmail).toBe("nick@gunsnation.com");
  });

  it("unescapes backslash-escaped quotes inside a quoted display name", () => {
    const parsed = parseGmailMessage(
      msgWithHeaders([{ name: "From", value: '"John \\"JD\\" Doe" <j@x.com>' }]),
    );
    expect(parsed.fromName).toBe('John "JD" Doe');
    expect(parsed.fromEmail).toBe("j@x.com");
  });

  it("returns a null fromName for a bare-address From", () => {
    const parsed = parseGmailMessage(
      msgWithHeaders([{ name: "From", value: "smoke@example.com" }]),
    );
    expect(parsed.fromName).toBeNull();
    expect(parsed.fromEmail).toBe("smoke@example.com");
  });

  it("normalizes participants to bare addresses so contact matching succeeds", () => {
    const parsed = parseGmailMessage(
      msgWithHeaders([
        { name: "From", value: '"Scrape.do Team" <support@scrape.do>' },
        { name: "To", value: "Nick <nick@gunsnation.com>, billing@acme.com" },
      ]),
    );
    expect(parsed.participants).toContain("support@scrape.do");
    expect(parsed.participants).toContain("nick@gunsnation.com");
    expect(parsed.participants).toContain("billing@acme.com");
    expect(parsed.participants.some((p) => p.includes("<"))).toBe(false);
  });

  it("does not split a To/Cc entry on a comma inside a quoted display name", () => {
    const parsed = parseGmailMessage(
      msgWithHeaders([
        { name: "From", value: "sender@x.com" },
        { name: "To", value: '"Doe, John" <john@x.com>, jane@y.com' },
      ]),
    );
    expect(parsed.toEmails).toEqual(["john@x.com", "jane@y.com"]);
    expect(parsed.participants).not.toContain('"Doe');
  });
});
