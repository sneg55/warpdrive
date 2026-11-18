import type { PgBoss } from "pg-boss";

export type StartAppBossDeps = {
  createBoss: () => PgBoss;
  setBoss: (boss: PgBoss) => void;
};

export async function startAppBoss(deps: StartAppBossDeps): Promise<PgBoss> {
  const boss = deps.createBoss();
  await boss.start();
  deps.setBoss(boss);
  return boss;
}
