import { expect, test } from "vitest";
import { permissionSets, visibilityGroups } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { hydrateActor } from "@/server/hydrateActor";
import {
  buildAppContext,
  buildContactActor,
  buildEntityCreateSession,
  toAuthUser,
} from "./actorContext";

test("adapts a hydrated actor to MCP domain contexts", async () => {
  await withTestDb(async (db) => {
    const [permissionSet] = await db
      .insert(permissionSets)
      .values({ name: "MCP deal creator", flags: { "deal.create": true } })
      .returning();
    const [group] = await db
      .insert(visibilityGroups)
      .values({ name: "MCP primary group" })
      .returning();
    expect(permissionSet).toBeDefined();
    expect(group).toBeDefined();
    if (permissionSet === undefined || group === undefined) return;

    const user = await seedUser(db, {
      permissionSetId: permissionSet.id,
      primaryVisibilityGroupId: group.id,
    });
    const signal = AbortSignal.timeout(5_000);
    const actor = await hydrateActor(db, user.id, signal);
    expect(actor).not.toBeNull();
    if (actor === null) return;

    const session = await buildEntityCreateSession(db, actor, signal);
    expect(session.flags["deal.create"]).toBe(true);
    expect(session.primaryVisibilityGroupId).toBe(group.id);

    const appContext = buildAppContext(db, actor);
    expect(appContext.actor?.id).toBe(user.id);
    expect(appContext.session?.sessionId).toBe(`mcp:${user.id}`);

    const contactActor = await buildContactActor(db, actor, signal);
    expect(contactActor.primaryVisibilityGroupId).toBe(group.id);
    expect(toAuthUser(actor).id).toBe(user.id);
  });
});
