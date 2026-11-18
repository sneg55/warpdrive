import path from "node:path";
import { runMigrationsCli } from "@/db/migrate";

void runMigrationsCli(path.resolve(process.cwd(), "drizzle"));
