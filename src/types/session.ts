// Viewer context passed to dealVisibilityClause for SQL predicate construction.
// Maps to VisibilityCtx in src/features/permissions/sql.ts (field names differ by design:
// visibilityGroupIds here vs groupIds there, to match the session/API boundary naming).
export interface DealVisibilitySession {
  userId: string;
  isActive: boolean;
  sessionLive: boolean;
  isAdmin: boolean;
  visibilityGroupIds: string[];
  // Team members this viewer manages (team.viewMembers-gated). Records they own become visible.
  // Optional/fail-closed: absent means no team-scoped visibility.
  managedUserIds?: string[];
}
