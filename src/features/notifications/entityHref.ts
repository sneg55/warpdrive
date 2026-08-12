// Single source of truth for "where does a notification's entity ref open?".
//
// Notification rows are polymorphic (entityType names a table, entityId a row), and the ref does
// NOT always name a routable record: reminders carry their activity's parent, email notifications
// carry the message. Deriving a URL from the entity type by string manipulation is what produced
// /activitys/<id> and /deals/<activityId>, both of which render Not found. Callers get null for a
// ref with no detail page and choose their own fallback.
export function entityHref(entityType: string | null, entityId: string | null): string | null {
  if (entityType === null || entityId === null) return null;
  switch (entityType) {
    case "deal":
      return `/deals/${entityId}`;
    case "person":
      return `/contacts/people/${entityId}`;
    case "organization":
      return `/contacts/orgs/${entityId}`;
    case "lead":
      return `/leads/${entityId}`;
    // "activity" and "email_message" are deliberately absent: neither has a detail route.
    default:
      return null;
  }
}
