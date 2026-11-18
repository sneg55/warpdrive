import type { Db } from "@/db/client";
import type { PermSetUser } from "@/features/permissions/effective";
import { createCaller } from "@/server/trpc/root";

export function makeCaller(db: Db, actor: PermSetUser) {
  return createCaller({
    db,
    session: { userId: actor.id, sessionId: "test-session" },
    actor: { ...actor, name: "Test User", email: "test@example.com", avatarUrl: null },
  });
}
