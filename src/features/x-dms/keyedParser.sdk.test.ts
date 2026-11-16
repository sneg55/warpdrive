import type * as Sdk from "@xdevplatform/chat-xdk-server";
import { ChatXdkError } from "@xdevplatform/chat-xdk-server";
import { expect, it, vi } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { createChatKeyring } from "./keyedParser";

vi.mock("@xdevplatform/chat-xdk-server", async (importOriginal) => ({
  ...(await importOriginal<typeof Sdk>()),
  createChat: () => Promise.reject(new ChatXdkError("internal", "sdk detail")),
}));

it("returns an error value when the SDK cannot create a chat", async () => {
  const r = await createChatKeyring({
    xUserId: "1000000000000000001",
    keys: [{ keyVersion: "1700000000000", blob: new Uint8Array([1]) }],
  });
  expect(r.ok ? null : [r.error.id, r.error.context]).toEqual([
    ERROR_IDS.X_CHAT_SDK_FAILED,
    { kind: "internal" },
  ]);
});
