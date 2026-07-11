import { expect, it } from "vitest";
import { parseFolder } from "./inboxFolders";

it("parseFolder returns a valid folder and defaults to inbox otherwise (D3)", () => {
  expect(parseFolder("sent")).toBe("sent");
  expect(parseFolder("archive")).toBe("archive");
  expect(parseFolder("drafts")).toBe("drafts");
  expect(parseFolder("outbox")).toBe("outbox");
  expect(parseFolder(undefined)).toBe("inbox");
  expect(parseFolder(null)).toBe("inbox");
  expect(parseFolder("bogus")).toBe("inbox");
});
