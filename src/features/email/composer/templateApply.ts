export interface AppliedTemplate {
  subject: string | null;
  body: string;
}

// Whether the merge-resolved template should be pushed into the composer. A new selection always
// applies. A recipient change re-resolves the same template only while what was applied is still
// in the composer verbatim: an author's own edits are never overwritten, and text that already
// matches is not re-pushed (a background refetch must not re-fire the change handlers).
export function shouldApplyTemplate(args: {
  isNewSelection: boolean;
  applied: AppliedTemplate | null;
  next: AppliedTemplate;
  currentSubject: string;
  currentBody: string;
}): boolean {
  if (args.isNewSelection) return true;
  const applied = args.applied;
  if (applied === null) return false;
  if (applied.body !== args.currentBody) return false;
  if (applied.subject !== null && applied.subject !== args.currentSubject) return false;
  return applied.body !== args.next.body || applied.subject !== args.next.subject;
}
