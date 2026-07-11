import { expect, it } from "vitest";
import { dealCreateInput } from "./schemas";

const base = {
  title: "Deal",
  pipelineId: "11111111-1111-4111-8111-111111111111",
  stageId: "22222222-2222-4222-8222-222222222222",
};

it("labels accepts valid keys and dedupes", () => {
  const r = dealCreateInput.parse({ ...base, labels: ["hot", "hot", "warm"] });
  expect(r.labels).toEqual(["hot", "warm"]);
});

it("labels defaults to an empty array and accepts any catalog name (validated by the UI catalog)", () => {
  // Labels are user-managed in Settings > Company > Labels, so the schema no longer rejects by a
  // fixed enum; it validates shape only. An arbitrary catalog name passes.
  expect(dealCreateInput.parse(base).labels).toEqual([]);
  expect(dealCreateInput.parse({ ...base, labels: ["Enterprise"] }).labels).toEqual(["Enterprise"]);
  // Shape is still enforced: an empty name is rejected.
  expect(dealCreateInput.safeParse({ ...base, labels: [""] }).success).toBe(false);
});

it("sourceChannel accepts a known key, rejects unknown, defaults null", () => {
  expect(dealCreateInput.parse({ ...base, sourceChannel: "web_form" }).sourceChannel).toBe(
    "web_form",
  );
  expect(dealCreateInput.safeParse({ ...base, sourceChannel: "nope" }).success).toBe(false);
  expect(dealCreateInput.parse(base).sourceChannel).toBeNull();
});
