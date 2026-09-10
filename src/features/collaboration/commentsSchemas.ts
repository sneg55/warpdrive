import { z } from "zod";

export const commentCreateInput = z.object({
  noteId: z.string().uuid(),
  body: z.string().min(1).max(10_000),
});
export type CommentCreateInput = z.infer<typeof commentCreateInput>;

export const commentUpdateInput = z.object({
  commentId: z.string().uuid(),
  body: z.string().min(1).max(10_000),
});
export type CommentUpdateInput = z.infer<typeof commentUpdateInput>;

export const commentDeleteInput = commentUpdateInput.pick({ commentId: true });
export type CommentDeleteInput = z.infer<typeof commentDeleteInput>;
