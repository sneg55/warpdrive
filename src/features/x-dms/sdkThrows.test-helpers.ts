import { ChatXdkError, ServerChat } from "@xdevplatform/chat-xdk-server";
import { vi } from "vitest";

export const SDK_SECRET = "sdk message that carries secret detail";

export function throwingDecryptFor(encoded: string | null) {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const real = ServerChat.prototype.decryptEvents;
  return vi.spyOn(ServerChat.prototype, "decryptEvents").mockImplementation(function (
    this: ServerChat,
    p,
  ) {
    if (encoded === null || p.events.includes(encoded))
      throw new ChatXdkError("invalidInput", SDK_SECRET);
    return real.call(this, p);
  });
}

export function throwingSdkCall(name: "encryptMessage" | "prepareConversationKeyChange") {
  return vi.spyOn(ServerChat.prototype, name).mockImplementation(() => {
    throw new ChatXdkError("invalidInput", SDK_SECRET);
  });
}
