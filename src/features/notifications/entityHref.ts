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
    default:
      return null;
  }
}
