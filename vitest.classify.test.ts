import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { classifyTests } from "./vitest.classify";

const ROOT = fileURLToPath(new URL(".", import.meta.url));

// Built by concatenation on purpose. classifyTests reads file CONTENTS, so spelling this package
// name out as one literal would classify this very file as integration and it would stop running
// in the lane it exists to guard.
const CONTAINER_IMPORT = `@test${"containers"}/`;

describe("test lane classification", () => {
  // The unit lane's whole contract is that it needs no container runtime, which is what lets it run
  // on the self-hosted pool and in the deploy gate. A file that starts its own container without
  // going through the shared harness breaks that contract silently: it passes anywhere Docker
  // happens to exist, and fails everywhere else.
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
