export function dealDefaultRecipients(
  ctx: { defaultTo?: string; participantEmails?: readonly string[] },
  prefillAllParticipants: boolean,
): string[] {
  const primary = ctx.defaultTo !== undefined && ctx.defaultTo !== "" ? [ctx.defaultTo] : [];
  if (!prefillAllParticipants) return primary;
  const all = [...primary, ...(ctx.participantEmails ?? [])].filter((e) => e !== "");
  return [...new Set(all)];
}
