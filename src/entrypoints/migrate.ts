import path from "node:path";
import { runMigrationsCli } from "@/db/migrate";

// Bundled entrypoint for the one-shot compose `migrate` service (esbuild -> dist/migrate.js,
// run with plain node). Applies forward-only migrations, then exits 0 on success / 1 on failure.
//
// Resolve the migration SQL from the working directory (the container sets WORKDIR /app with the
// SQL copied to /app/drizzle) rather than import.meta.url: esbuild rewrites import.meta.url to the
// bundle's own location, which would no longer sit two levels above the drizzle folder.
void runMigrationsCli(path.resolve(process.cwd(), "drizzle"));
