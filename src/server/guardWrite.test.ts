import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { ok } from "@/types/result";

vi.mock("@/features/observability/server", () => ({ captureServerError: vi.fn() }));

import { guardWrite } from "./guardWrite";

describe("guardWrite", () => {
  it("passes a returned Result through untouched", async () => {
    await expect(guardWrite("t", "u1", () => Promise.resolve(ok(1)))).resolves.toEqual(ok(1));
  });

  it("turns a thrown database error into DB_WRITE_FAILED", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await guardWrite("t", "u1", () => Promise.reject(new Error("check constraint")));
    expect(r.ok === false && r.error.id).toBe(ERROR_IDS.DB_WRITE_FAILED);
  });

  it("keeps the id of a thrown AppError", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const thrown = new AppError(ERROR_IDS.DB_INSERT_FAILED, "no rows");
    const r = await guardWrite("t", "u1", () => Promise.reject(thrown));
    expect(r.ok === false && r.error.id).toBe(ERROR_IDS.DB_INSERT_FAILED);
  });

  it("rethrows an abort so cancellation is never swallowed", async () => {
    const abort = new DOMException("timed out", "TimeoutError");
    await expect(guardWrite("t", "u1", () => Promise.reject(abort))).rejects.toBe(abort);
  });

  it("rethrows a validation error instead of reporting it as a failed write", async () => {
    const zodError = new z.ZodError([]);
    await expect(guardWrite("t", "u1", () => Promise.reject(zodError))).rejects.toBe(zodError);
  });
});
