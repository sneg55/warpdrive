import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const STORAGE_CLIENTS = ["app", "worker"] as const;
const FSYNC_KEYS = ["metadata_fsync", "data_fsync"] as const;

function service(text: string, name: string): string {
  const match = new RegExp(
    `^ {2}${name}:$([\\s\\S]*?)(?=^ {2}\\w+:$|^\\S|$(?![\\s\\S]))`,
    "m",
  ).exec(text);
  expect(match, `no ${name} service`).not.toBeNull();
  return match?.[1] ?? "";
}

export function describeComposeStorage(composeFile: URL): void {
  const text = readFileSync(composeFile, "utf8");

  describe(`${composeFile.pathname} storage wiring`, () => {
    it.each(
      STORAGE_CLIENTS,
    )("%s signs for the bundled Garage region unless S3_REGION overrides it", (name) => {
      expect(service(text, name)).toMatch(/^ {6}S3_REGION: \$\{S3_REGION:-garage\}$/m);
    });

    it("Garage serves the same region the app signs for", () => {
      expect(text).toMatch(/^ {6}s3_region = "\$\{S3_REGION:-garage\}"$/m);
    });

    it.each(
      FSYNC_KEYS,
    )("single-node Garage sets %s, since there is no replica to recover from", (key) => {
      expect(text).toMatch(new RegExp(`^ {6}${key} = true$`, "m"));
    });
  });
}
