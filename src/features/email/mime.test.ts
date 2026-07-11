import { describe, expect, it } from "vitest";
import { buildMime, deriveMessageId, toRawBase64 } from "./mime";

describe("deriveMessageId", () => {
  it("derives a deterministic account-scoped Message-ID", () => {
    const id = deriveMessageId({
      accountId: "acc-1",
      idempotencyKey: "key-1",
      domain: "gunsnation.com",
    });
    expect(id).toBe("<acc-1.key-1@gunsnation.com>");
  });

  it("is stable for the same inputs and distinct for a different idempotencyKey", () => {
    const base = { accountId: "acc-1", domain: "gunsnation.com" };
    const a = deriveMessageId({ ...base, idempotencyKey: "key-1" });
    const b = deriveMessageId({ ...base, idempotencyKey: "key-1" });
    const c = deriveMessageId({ ...base, idempotencyKey: "key-2" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("neutralizes a header-injection attempt in the idempotencyKey (no CRLF leaks)", () => {
    const id = deriveMessageId({
      accountId: "acc-1",
      idempotencyKey: "k\r\nBcc: evil@x.com",
      domain: "gunsnation.com",
    });
    // No CR/LF, no spaces, no colon from the input may leak into the id: without
    // those, the injected "Bcc: ..." can never become a separate header. (Bare
    // letters surviving as inert local-part text is harmless.)
    expect(id).not.toContain("\r");
    expect(id).not.toContain("\n");
    expect(id).not.toContain(" ");
    expect(id).not.toContain("Bcc:");
    // Still a well-formed single-token id.
    expect(id.startsWith("<")).toBe(true);
    expect(id.endsWith(">")).toBe(true);
    expect(id.split("@")).toHaveLength(2);
  });
});

describe("buildMime", () => {
  it("uses CRLF line endings and a MIME-Version header", () => {
    const mime = buildMime({
      from: "me@x.com",
      to: ["you@y.com"],
      subject: "Hi",
      html: "<p>hi</p>",
      messageId: "<acc-1.key-1@gunsnation.com>",
    });
    expect(mime).toContain("\r\n");
    expect(mime).not.toMatch(/[^\r]\n/); // every LF is preceded by CR
    expect(mime).toContain("MIME-Version: 1.0");
  });

  it("includes threading headers and the fixed Message-ID", () => {
    const mime = buildMime({
      from: "me@x.com",
      to: ["you@y.com"],
      subject: "Re: hi",
      html: "<p>hi</p>",
      messageId: "<acc-1.key-1@gunsnation.com>",
      inReplyTo: "<orig@y.com>",
      references: "<orig@y.com>",
    });
    expect(mime).toContain("Message-ID: <acc-1.key-1@gunsnation.com>");
    expect(mime).toContain("In-Reply-To: <orig@y.com>");
    expect(mime).toContain("References: <orig@y.com>");
  });

  it("emits a multipart/alternative with text part before html when both are present", () => {
    const mime = buildMime({
      from: "me@x.com",
      to: ["you@y.com"],
      subject: "Hi",
      html: "<p>hi</p>",
      text: "hi",
      messageId: "<m@x.com>",
    });
    expect(mime).toContain("multipart/alternative");
    const boundaryMatch = mime.match(/boundary="([^"]+)"/);
    expect(boundaryMatch).not.toBeNull();
    const boundary = boundaryMatch?.[1] ?? "";
    expect(boundary.length).toBeGreaterThan(0);
    // The boundary token must not appear inside either body.
    expect("hi".includes(boundary)).toBe(false);
    // text/plain part precedes text/html part.
    const textIdx = mime.indexOf("text/plain");
    const htmlIdx = mime.indexOf("text/html");
    expect(textIdx).toBeGreaterThan(-1);
    expect(htmlIdx).toBeGreaterThan(textIdx);
  });

  it("emits a single text/html part when no text body is given", () => {
    const mime = buildMime({
      from: "me@x.com",
      to: ["you@y.com"],
      subject: "Hi",
      html: "<p>hi</p>",
      messageId: "<m@x.com>",
    });
    expect(mime).toContain("Content-Type: text/html");
    expect(mime).not.toContain("multipart/alternative");
  });

  it("neutralizes header injection in subject, from, to, and cc (no extra header line)", () => {
    const mime = buildMime({
      from: "me@x.com\r\nBcc: evil@x.com",
      to: ["you@y.com\r\nX-Injected: 1"],
      cc: ["c@y.com\r\nX-Cc-Injected: 1"],
      subject: "Hi\r\nX-Subject-Injected: 1",
      html: "<p>hi</p>",
      messageId: "<m@x.com>",
    });
    // The injected text must never begin a line (a header is "Name:" at line start).
    // Inert single-line survival inside a value is harmless; a new header line is not.
    expect(mime).not.toMatch(/\r\nBcc:/);
    expect(mime).not.toMatch(/\r\nX-Injected:/);
    expect(mime).not.toMatch(/\r\nX-Cc-Injected:/);
    expect(mime).not.toMatch(/\r\nX-Subject-Injected:/);
    // The header block (before the first blank line) holds exactly our header names.
    const headerBlock = mime.split("\r\n\r\n")[0] ?? "";
    const names = headerBlock
      .split("\r\n")
      .filter((l) => /^[A-Za-z-]+:/.test(l))
      .map((l) => l.slice(0, l.indexOf(":")));
    expect(names.sort()).toEqual(
      [
        "Cc",
        "Content-Transfer-Encoding",
        "Content-Type",
        "From",
        "MIME-Version",
        "Message-ID",
        "Subject",
        "To",
      ].sort(),
    );
  });

  it("RFC 2047 encodes a subject containing non-ASCII", () => {
    const mime = buildMime({
      from: "me@x.com",
      to: ["you@y.com"],
      subject: "Posprzątać 你好",
      html: "<p>hi</p>",
      messageId: "<m@x.com>",
    });
    // Encoded-word form: =?UTF-8?B?...?= or =?UTF-8?Q?...?= ; no raw non-ASCII in the header.
    const subjectLine = mime.split("\r\n").find((l) => l.startsWith("Subject:")) ?? "";
    expect(subjectLine).toMatch(/=\?UTF-8\?[BQ]\?/i);
    // The header line must be pure ASCII (no raw non-ASCII bytes).
    const allAscii = [...subjectLine].every((ch) => ch.charCodeAt(0) < 128);
    expect(allAscii).toBe(true);
  });
});

describe("buildMime Content-Disposition filename escaping (RFC 2183)", () => {
  function getDispositionLine(mime: string): string {
    return mime.split("\r\n").find((l) => l.startsWith("Content-Disposition:")) ?? "";
  }

  it("passes a plain filename through unchanged", () => {
    const mime = buildMime({
      from: "a@x.com",
      to: ["b@x.com"],
      subject: "s",
      html: "<p>h</p>",
      messageId: "<m@x.com>",
      attachments: [
        { filename: "report.pdf", contentType: "application/pdf", bytes: Buffer.from("x") },
      ],
    });
    const line = getDispositionLine(mime);
    expect(line).toContain('filename="report.pdf"');
  });

  it("backslash-escapes double-quotes inside the filename so the MIME is well-formed", () => {
    // A filename like: evil"name.pdf
    // Must produce:    filename="evil\"name.pdf"   (the quote is backslash-escaped)
    const mime = buildMime({
      from: "a@x.com",
      to: ["b@x.com"],
      subject: "s",
      html: "<p>h</p>",
      messageId: "<m@x.com>",
      attachments: [
        { filename: 'evil"name.pdf', contentType: "application/pdf", bytes: Buffer.from("x") },
      ],
    });
    const line = getDispositionLine(mime);
    // The raw double-quote must NOT appear unescaped after filename=" (that would close the quoted-string early).
    expect(line).not.toMatch(/filename="[^\\]"/); // no unescaped quote terminating early
    expect(line).toContain('\\"'); // the quote is backslash-escaped
  });

  it("strips CR/LF and other control chars from the filename (header-injection defence)", () => {
    const mime = buildMime({
      from: "a@x.com",
      to: ["b@x.com"],
      subject: "s",
      html: "<p>h</p>",
      messageId: "<m@x.com>",
      attachments: [
        {
          filename: "inject\r\nX-Evil: hdr\r\nresume.pdf",
          contentType: "application/pdf",
          bytes: Buffer.from("x"),
        },
      ],
    });
    // No injected header should appear as a new MIME header line.
    expect(mime).not.toMatch(/\r\nX-Evil:/);
    // The disposition line must still be present and not broken.
    const line = getDispositionLine(mime);
    expect(line).toContain("Content-Disposition: attachment");
  });
});

describe("toRawBase64", () => {
  it("round-trips: decoding base64url yields the original mime", () => {
    const original = "Subject: x\r\n\r\nbody";
    const raw = toRawBase64(original);
    // base64url is URL-safe: no +, /, or = padding.
    expect(raw).not.toMatch(/[+/=]/);
    expect(Buffer.from(raw, "base64url").toString("utf8")).toBe(original);
  });
});
