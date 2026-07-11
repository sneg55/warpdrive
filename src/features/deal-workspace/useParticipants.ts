"use client";
import { useRouter } from "next/navigation";
import type { ComboboxOption } from "@/components/ui/Combobox";
import type { DealParticipant } from "@/features/deal-workspace/participantsList";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import { addParticipantAction, removeParticipantAction } from "./actions";

// Shared data + mutations for every participants surface (Summary count-link, sidebar section,
// participants dialog): one tRPC cache key, so an add/remove anywhere updates all three.
export function useParticipants(
  dealId: string,
  person: { id: string; name: string } | null,
  orgId: string | null,
): {
  participants: DealParticipant[];
  options: ComboboxOption[];
  add: (personId: string) => Promise<void>;
  remove: (personId: string) => Promise<void>;
} {
  const router = useRouter();
  const utils = trpc.useUtils();
  const participantsQ = trpc.deal.participants.useQuery({ dealId });
  const orgPeopleQ = trpc.contacts.listPeopleForOrg.useQuery(
    { orgId: orgId ?? "" },
    { enabled: orgId !== null },
  );
  const participants = participantsQ.data ?? [];

  // Candidates: the linked org's people plus the deal's own contact, minus current participants.
  const current = new Set(participants.map((p) => p.personId));
  const candidates = new Map<string, string>();
  if (person !== null) candidates.set(person.id, person.name);
  for (const p of orgPeopleQ.data ?? []) candidates.set(p.id, p.name);
  const options = [...candidates]
    .filter(([id]) => !current.has(id))
    .map<ComboboxOption>(([id, name]) => ({ value: id, label: name }));

  async function refresh(): Promise<void> {
    await utils.deal.participants.invalidate({ dealId });
    router.refresh();
  }

  return {
    participants,
    options,
    add: async (personId: string) => {
      await addParticipantAction({ dealId, personId, role: null }, readCsrfToken());
      await refresh();
    },
    remove: async (personId: string) => {
      await removeParticipantAction({ dealId, personId }, readCsrfToken());
      await refresh();
    },
  };
}
