import { describe, expect, test } from "vitest";
import { safeLoginReturnPath } from "./loginReturn";

describe("safeLoginReturnPath", () => {
  test("keeps a local OAuth authorization path", () => {
    expect(
      safeLoginReturnPath(
        "/oauth/authorize?client_id=client&redirect_uri=https%3A%2F%2Fclient.example%2Fcb",
      ),
    ).toBe("/oauth/authorize?client_id=client&redirect_uri=https%3A%2F%2Fclient.example%2Fcb");
  });

  test("rejects absolute, protocol-relative, and backslash paths", () => {
    expect(safeLoginReturnPath("https://evil.example/path")).toBe("/");
    expect(safeLoginReturnPath("//evil.example/path")).toBe("/");
    expect(safeLoginReturnPath("/\\evil.example/path")).toBe("/");
  });
});
