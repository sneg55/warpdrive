import { expect, it } from "vitest";
import { parseChannel, wsChannel } from "./wsChannels";

it("builds and parses an import channel", () => {
  expect(wsChannel.importBatch("abc")).toBe("import:abc");
  expect(parseChannel("import:abc")).toEqual({ family: "import", id: "abc" });
});
