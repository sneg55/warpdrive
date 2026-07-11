import { expect, test } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import type { PermSetUser } from "@/features/permissions/effective";
import { requireManage } from "./adminGate";

const admin: PermSetUser = {
  id: "admin-1",
  type: "admin",
  isActive: true,
  groupIds: new Set<string>(),
  flags: new Set(),
};
const regular: PermSetUser = {
  id: "reg-1",
  type: "regular",
  isActive: true,
  groupIds: new Set<string>(),
  flags: new Set(),
};

test("null actor is rejected with the session-dead id", () => {
  const r = requireManage(null);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.id).toBe(ERROR_IDS.AUTH_SESSION_DEAD);
});

test("a non-admin without permissions.manage is blocked with E_PERM_001", () => {
  const r = requireManage(regular);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.id).toBe(ERROR_IDS.PERM_DENIED);
});

test("an admin passes", () => {
  const r = requireManage(admin);
  expect(r.ok).toBe(true);
});

test("a regular user with permissions.manage passes", () => {
  const withFlag: PermSetUser = { ...regular, flags: new Set(["permissions.manage"]) };
  const r = requireManage(withFlag);
  expect(r.ok).toBe(true);
});
