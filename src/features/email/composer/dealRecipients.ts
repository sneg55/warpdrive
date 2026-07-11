// Compute the email composer's default "To" list for a deal. By default only the deal's primary
// linked contact is prefilled. When the "Prefill all deal participants as email recipients"
// personal preference is on, every participant email is unioned in (primary first), deduped, with
// empties dropped.
export function dealDefaultRecipients(
  ctx: { defaultTo?: string; participantEmails?: readonly string[] },
  prefillAllParticipants: boolean,
): string[] {
  const primary = ctx.defaultTo !== undefined && ctx.defaultTo !== "" ? [ctx.defaultTo] : [];
  if (!prefillAllParticipants) return primary;
  const all = [...primary, ...(ctx.participantEmails ?? [])].filter((e) => e !== "");
  return [...new Set(all)];
}
