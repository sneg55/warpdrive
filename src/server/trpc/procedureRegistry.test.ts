import { expect, it } from "vitest";
import { isRegisteredProcedure } from "./procedureRegistry";

it("recognizes a nested procedure the app router registers", () => {
  expect(isRegisteredProcedure("email.inbox.unreadCount")).toBe(true);
});

it("rejects a path the router does not register, including inherited object keys", () => {
  expect(isRegisteredProcedure("jane@acme.com")).toBe(false);
  expect(isRegisteredProcedure("email.inbox")).toBe(false);
  expect(isRegisteredProcedure("toString")).toBe(false);
});
