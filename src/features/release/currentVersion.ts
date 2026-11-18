import { readFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "@/config/env";
import { resolveVersion } from "./resolveVersion";

export function readPackageVersion(): string | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    if (typeof parsed === "object" && parsed !== null && "version" in parsed) {
      const v = parsed.version;
      return typeof v === "string" ? v : undefined;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

let cached: string | null = null;

export function getCurrentVersion(): string {
  cached ??= resolveVersion({
    appVersionEnv: env.APP_VERSION,
    packageVersion: readPackageVersion(),
  });
  return cached;
}
