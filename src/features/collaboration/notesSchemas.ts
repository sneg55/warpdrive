import { z } from "zod";
import { ENTITY_TYPES } from "@/constants/entityTypes";

// CLIENT input: authorId is derived server-side (actor.id), never accepted here.
export const noteCreateInput = z.object({
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.string().uuid(),
  body: z.string().min(1).max(50_000),
  pinned: z.boolean().default(false),
});
export type NoteCreateInput = z.infer<typeof noteCreateInput>;

// CLIENT input for an in-place body edit; the note is located by id, authorId is never changed.
export const noteUpdateInput = z.object({
  noteId: z.string().uuid(),
  body: z.string().min(1).max(50_000),
});
export type NoteUpdateInput = z.infer<typeof noteUpdateInput>;
