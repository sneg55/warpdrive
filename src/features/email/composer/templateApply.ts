export interface AppliedTemplate {
  subject: string | null;
  body: string;
}

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
