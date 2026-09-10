import { ENTITY_TYPES } from "./entityTypes";

export const COMMENTABLE_ENTITY_TYPES = ENTITY_TYPES.filter((t) => t !== "lead");

export type CommentableEntityType = (typeof COMMENTABLE_ENTITY_TYPES)[number];

export function isCommentableEntityType(
  entityType: string | undefined,
): entityType is CommentableEntityType {
  return COMMENTABLE_ENTITY_TYPES.some((t) => t === entityType);
}
