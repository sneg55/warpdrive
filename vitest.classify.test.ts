import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { classifyTests } from "./vitest.classify.ts";

const ROOT = fileURLToPath(new URL(".", import.meta.url));

const CONTAINER_IMPORT = `@test${"containers"}/`;

describe("test lane classification", () => {
  it("puts every file that needs a container runtime in the integration lane", () => {
    const { unit } = classifyTests(ROOT);
    const needsContainer = unit.filter((rel) =>
      readFileSync(`${ROOT}${rel}`, "utf8").includes(CONTAINER_IMPORT),
    );
    expect(needsContainer).toEqual([]);
  });

  it("classifies both lanes non-empty, so a broken walk cannot silently pass the above", () => {
    const { unit, integration } = classifyTests(ROOT);
    expect(unit.length).toBeGreaterThan(0);
    expect(integration.length).toBeGreaterThan(0);
  });
});
