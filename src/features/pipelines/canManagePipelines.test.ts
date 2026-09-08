import { describe, expect, it } from "vitest";
import { PERMISSION_FLAGS } from "@/constants/permissionFlags";
import { canManagePipelines } from "./canManagePipelines";

describe("canManagePipelines", () => {
  it("allows admins regardless of flags", () => {
    expect(canManagePipelines({ type: "admin", flags: new Set() })).toBe(true);
  });

  it("allows regular users holding pipeline.manage", () => {
    const flags = new Set([PERMISSION_FLAGS.PIPELINE_MANAGE]);
    expect(canManagePipelines({ type: "regular", flags })).toBe(true);
  });

  it("denies regular users without the flag", () => {
    expect(canManagePipelines({ type: "regular", flags: new Set(["deal.edit_own"]) })).toBe(false);
  });
});
