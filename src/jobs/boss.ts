import type { PgBoss } from "pg-boss";

const KEY = Symbol.for("warpdrive.jobs.boss");

type BossGlobal = { [KEY]?: PgBoss | null };

export function setBoss(boss: PgBoss): void {
  (globalThis as BossGlobal)[KEY] = boss;
}

export function getBoss(): PgBoss | null {
  return (globalThis as BossGlobal)[KEY] ?? null;
}
