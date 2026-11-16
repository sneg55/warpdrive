import { ChatXdkError } from "@xdevplatform/chat-xdk-server";
import { describe, expect, it } from "vitest";
import { mapFailure } from "./juicebox";

describe("mapFailure", () => {
  it("maps invalidPin to E_X_013 with guessesRemaining", () => {
    const e = mapFailure("acc", new ChatXdkError("invalidPin", "x", 3));
    expect(e.id).toBe("E_X_013");
    expect(e.context).toEqual({ accountId: "acc", guessesRemaining: 3 });
  });

  it("maps other ChatXdkError kinds to E_X_015 with the kind", () => {
    const e = mapFailure("acc", new ChatXdkError("juicebox", "secret detail"));
    expect(e.id).toBe("E_X_015");
    expect(e.context).toEqual({ accountId: "acc", reason: "juicebox" });
  });

  it("maps a plain Error to E_X_015 with only the constructor name", () => {
    const e = mapFailure("acc", new TypeError("secret detail"));
    expect(e.id).toBe("E_X_015");
    expect(e.context).toEqual({ accountId: "acc", reason: "TypeError" });
  });
});
