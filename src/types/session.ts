export interface DealVisibilitySession {
  userId: string;
  isActive: boolean;
  sessionLive: boolean;
  isAdmin: boolean;
  visibilityGroupIds: string[];
  managedUserIds?: string[];
}
