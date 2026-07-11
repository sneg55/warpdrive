import type { Db } from "@/db/client";
import type { PermSetUser } from "@/features/permissions/effective";
import { createCaller } from "@/server/trpc/root";

// Build a tRPC caller for integration tests: supplies a real test-DB and a
// fully-formed actor so procedures run with exactly the permissions the test
// wants. Session fields are synthetic but sufficient for protectedProcedure.
export function makeCaller(db: Db, actor: PermSetUser) {
  return createCaller({
    db,
    session: { userId: actor.id, sessionId: "test-session" },
    actor,
  });
}
