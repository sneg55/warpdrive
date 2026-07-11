import { describe, expect, it } from "vitest";
import { extractAttachments } from "./attachmentParse";

describe("extractAttachments", () => {
  it("collects parts that have a filename + attachmentId", () => {
    const payload = {
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "text/html", body: { data: "x" } },
        {
          mimeType: "application/pdf",
          filename: "invoice.pdf",
          body: { attachmentId: "a1", size: 88190 },
        },
      ],
    };
    expect(extractAttachments(payload)).toEqual([
      {
        filename: "invoice.pdf",
        mimeType: "application/pdf",
        sizeBytes: 88190,
        gmailAttachmentId: "a1",
      },
    ]);
  });
  it("recurses nested parts and ignores inline parts without a filename", () => {
    const payload = { parts: [{ parts: [{ filename: "", body: { attachmentId: "z" } }] }] };
    expect(extractAttachments(payload)).toEqual([]);
  });
  it("returns [] for an undefined payload", () => {
    expect(extractAttachments(undefined)).toEqual([]);
  });
});
