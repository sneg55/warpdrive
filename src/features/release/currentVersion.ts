import { readFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "@/config/env";
import { resolveVersion } from "./resolveVersion";

// Read the `version` field from the bundled package.json. This is a file read (not process.env),
// so it lives outside the env boundary and runs at call time. Returns undefined when the file is
// missing or unparseable, in which case resolveVersion falls through to "dev".
export function readPackageVersion(): string | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    if (typeof parsed === "object" && parsed !== null && "version" in parsed) {
      const v = parsed.version;
      return typeof v === "string" ? v : undefined;
    }
    return undefined;
  } catch {
    // A missing/unreadable package.json is non-fatal: the banner just falls back to "dev".
    return undefined;
  }
}

let cached: string | null = null;

// The running app version shown by the banner: APP_VERSION env stamp -> package.json -> "dev".
// Memoized because the version cannot change during a process lifetime.
export function getCurrentVersion(): string {
  cached ??= resolveVersion({
    appVersionEnv: env.APP_VERSION,
    packageVersion: readPackageVersion(),
  });
  return cached;
}
