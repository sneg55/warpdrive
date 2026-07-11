import { notFound, redirect } from "next/navigation";
import type React from "react";
import { toContactActor } from "@/features/contacts/actorAdapters";
import { getContactFollowers } from "@/features/contacts/followers";
import { getOrg } from "@/features/contacts/orgsRepo";
import { getPerson } from "@/features/contacts/personsRepo";
import { listDefs } from "@/features/custom-fields/defsRepo";
import { listHiddenBuiltins } from "@/features/custom-fields/hiddenBuiltinsRepo";
import { cachedDetailLoad } from "@/features/navigation/cachedDetailLoad";
import { can } from "@/features/permissions/can";
import type { VisiblePersonOrOrg } from "@/features/permissions/types";
import { readBaseCurrency } from "@/features/settings/readBaseCurrency";
import { PersonDetailClient } from "./PersonDetailClient";

// Shared person-detail loader. Exported so both the full page ([personId]/page.tsx) and the
// intercepted slide-over drawer (@modal/(.)[personId]/page.tsx) render identical content from one
// source, and generateMetadata can reuse the cached load.
export const loadPerson = cachedDetailLoad((ctx, actor, personId) =>
  getPerson(ctx.db, toContactActor(actor), personId, AbortSignal.timeout(10_000)),
);

// The person detail body (header + sidebar + timeline), independent of whether it renders as a
// full page or inside the drawer. notFound()/redirect() work in both contexts (server components).
export async function PersonDetailView({
  personId,
}: {
  personId: string;
}): Promise<React.ReactNode> {
  const loaded = await loadPerson(personId);
  if (loaded.kind === "unauth") {
    redirect("/login");
  }
  if (loaded.kind === "notfound") {
    notFound();
  }
  const { ctx, actor, value: person } = loaded;
  const contactActor = toContactActor(actor);

  // All four reads need only the already-loaded person, so they are issued together instead of
  // one round trip at a time.
  const [org, defs, baseCurrency, { followers, isFollowedBySelf }, hidden] = await Promise.all([
    person.orgId !== null
      ? getOrg(ctx.db, contactActor, person.orgId, AbortSignal.timeout(10_000))
      : null,
    listDefs(ctx.db, "person", {}, AbortSignal.timeout(10_000)),
    readBaseCurrency(ctx.db, AbortSignal.timeout(8000)),
    getContactFollowers(ctx.db, actor, "person", person.id, AbortSignal.timeout(10_000)),
    listHiddenBuiltins(ctx.db, AbortSignal.timeout(10_000)),
  ]);
  const orgName = org !== null && org.ok === true ? org.value.name : null;

  const record: VisiblePersonOrOrg = {
    kind: "person",
    ownerId: person.ownerId,
    visibilityLevel: person.visibilityLevel,
    visibilityGroupId: person.visibilityGroupId,
    visibleToUserIds: person.visibleToUserIds,
  };
  const canMerge = can(actor, "contact.merge", record);
  const canDelete = can(actor, "contact.delete", record);

  return (
    <PersonDetailClient
      person={person}
      orgName={orgName}
      defs={defs}
      hiddenBuiltins={hidden.person}
      canMerge={canMerge}
      canDelete={canDelete}
      baseCurrency={baseCurrency}
      followers={followers}
      isFollowedBySelf={isFollowedBySelf}
    />
  );
}
