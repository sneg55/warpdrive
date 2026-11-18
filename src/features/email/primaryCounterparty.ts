interface CounterpartyMessage {
  direction: string;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
}

export function primaryCounterparty(
  messages: CounterpartyMessage[],
  ownerEmail: string | null,
): { email: string; name: string | null } | null {
  const owner = ownerEmail?.toLowerCase() ?? null;
  const isOwner = (email: string): boolean => owner !== null && email.toLowerCase() === owner;

  for (const m of messages) {
    if (m.direction === "inbound" && m.fromEmail !== "" && !isOwner(m.fromEmail)) {
      return { email: m.fromEmail, name: m.fromName };
    }
  }
  for (const m of messages) {
    const to = m.toEmails.find((e) => e !== "" && !isOwner(e));
    if (to !== undefined) return { email: to, name: null };
  }
  return null;
}
