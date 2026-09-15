import type { OwnerScope } from "@/types/stats";

const ME_TOKEN = "me";
const ALL_TOKEN = "all";
const USER_PREFIX = "user:";
const TEAM_PREFIX = "team:";

export function toToken(scope: OwnerScope): string {
  switch (scope.kind) {
    case "me":
      return ME_TOKEN;
    case "all":
      return ALL_TOKEN;
    case "user":
      return `${USER_PREFIX}${scope.userId}`;
    case "team":
      return `${TEAM_PREFIX}${scope.teamId}`;
  }
}

export function fromToken(token: string): OwnerScope {
  if (token === ALL_TOKEN) return { kind: "all" };
  if (token.startsWith(USER_PREFIX)) {
    const userId = token.slice(USER_PREFIX.length);
    return userId === "" ? { kind: "me" } : { kind: "user", userId };
  }
  if (token.startsWith(TEAM_PREFIX)) {
    const teamId = token.slice(TEAM_PREFIX.length);
    return teamId === "" ? { kind: "me" } : { kind: "team", teamId };
  }
  return { kind: "me" };
}
