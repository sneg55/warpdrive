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
    // The context actor now also carries display name + avatar (used only by the app shell, not by
    // procedures); tests supply placeholders so the permission-relevant fields stay the focus.
    actor: { ...actor, name: "Test User", avatarUrl: null },
  });
}
