import { describe, expect, it } from "vitest";
import { snowflakeToDate } from "./snowflake";

describe("snowflakeToDate", () => {
  it("decodes the timestamp bits of a synthetic snowflake", () => {
    expect(snowflakeToDate("2006515713438650369").toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("matches the shift and epoch formula", () => {
    expect(snowflakeToDate("2006515713438650369")).toEqual(
      new Date(Number(2006515713438650369n >> 22n) + 1288834974657),
    );
  });
});
