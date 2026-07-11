// User status classification + filter for the Manage users table (S-U3). Pure so it is unit-
// testable. Status is derived, not stored: deactivation (isActive === false) takes precedence
// over a still-pending invite (invitedAt !== null).

export type UserStatus = "active" | "invited" | "deactivated";
export type UserStatusFilter = "all" | UserStatus;

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
