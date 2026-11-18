import type { PgBoss } from "pg-boss";
import { env } from "@/config/env";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { getBoss } from "./boss";

export function requireBoss(): PgBoss | null {
  const boss = getBoss();
  if (boss !== null) return boss;
  if (env.NODE_ENV === "production") {
    throw new AppError(
      ERROR_IDS.JOBS_BOSS_MISSING,
      "no pg-boss in this process; the job would be silently dropped",
      {},
    );
  }
  return null;
}
