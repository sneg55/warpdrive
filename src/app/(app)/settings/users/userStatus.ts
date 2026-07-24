// User status classification + filter for the Manage users table (S-U3). Pure so it is unit-
// testable. Status is derived, not stored: deactivation (isActive === false) takes precedence
// over a still-pending invite (invitedAt !== null).

export type UserStatus = "active" | "invited" | "deactivated";
export type UserStatusFilter = "all" | UserStatus;

const USER_STATUS_FILTERS: ReadonlySet<string> = new Set([
  "all",
  "active",
  "invited",
  "deactivated",
]);

export function parseUserStatusFilter(value: string | null): UserStatusFilter {
  return value !== null && USER_STATUS_FILTERS.has(value) ? (value as UserStatusFilter) : "all";
}

export function userStatus(row: { isActive: boolean; invitedAt: string | null }): UserStatus {
  if (!row.isActive) return "deactivated";
  if (row.invitedAt !== null) return "invited";
  return "active";
}

export function filterUsersByStatus<T extends { isActive: boolean; invitedAt: string | null }>(
  rows: T[],
  filter: UserStatusFilter,
): T[] {
  if (filter === "all") return rows;
  return rows.filter((r) => userStatus(r) === filter);
}
