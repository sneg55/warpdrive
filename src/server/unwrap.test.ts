import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { err, ok } from "@/types/result";
import { unwrap } from "./unwrap";

describe("unwrap", () => {
  it("returns the value on ok", async () => {
    const v = await unwrap(Promise.resolve(ok(42)));
    expect(v).toBe(42);
  });

  it("maps a FORBIDDEN id to TRPCError code FORBIDDEN", async () => {
    const p = unwrap(Promise.resolve(err(new AppError(ERROR_IDS.PERM_DENIED, "denied", {}))));
    await expect(p).rejects.toSatisfy(
      (e) => e instanceof TRPCError && e.code === "FORBIDDEN" && e.message === "E_PERM_001",
    );
  });

  it("maps a NOT_FOUND id to TRPCError code NOT_FOUND", async () => {
    const p = unwrap(Promise.resolve(err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "gone", {}))));
    await expect(p).rejects.toSatisfy((e) => e instanceof TRPCError && e.code === "NOT_FOUND");
  });

  it("maps a BAD_REQUEST id to TRPCError code BAD_REQUEST", async () => {
    const p = unwrap(Promise.resolve(err(new AppError(ERROR_IDS.CF_VALUE_INVALID, "bad", {}))));
    await expect(p).rejects.toSatisfy((e) => e instanceof TRPCError && e.code === "BAD_REQUEST");
  });

  it("maps an unmapped (DB) id to INTERNAL_SERVER_ERROR", async () => {
    const p = unwrap(Promise.resolve(err(new AppError(ERROR_IDS.DB_INVARIANT, "boom", {}))));
    await expect(p).rejects.toSatisfy(
      (e) => e instanceof TRPCError && e.code === "INTERNAL_SERVER_ERROR",
    );
  });
});
