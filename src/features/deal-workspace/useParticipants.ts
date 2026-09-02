"use client";
import { useRouter } from "next/navigation";
import { ERROR_IDS } from "@/constants/errorIds";
import { createPersonAction } from "@/features/contacts/actions";
import type { DealParticipant } from "@/features/deal-workspace/participantsList";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import { addParticipantAction, removeParticipantAction } from "./actions";

export type ParticipantMutation = (personId: string) => Promise<string | null>;

function createFailureMessage(errorId: string): string {
  if (errorId === ERROR_IDS.CF_VALUE_INVALID) {
    return "This workspace requires more person fields; add the person under Contacts first.";
  }
  return `Could not create person (${errorId})`;
}

export function useParticipants(
  dealId: string,
  orgId: string | null,
): {
  participants: DealParticipant[];
  add: ParticipantMutation;
  remove: ParticipantMutation;
  createAndAdd: (name: string) => Promise<string | null>;
} {
  const router = useRouter();
  const utils = trpc.useUtils();
  const participantsQ = trpc.deal.participants.useQuery({ dealId });
  const participants = participantsQ.data ?? [];

  async function refresh(): Promise<void> {
    await utils.deal.participants.invalidate({ dealId });
    router.refresh();
  }

  async function link(personId: string): Promise<string | null> {
    const r = await addParticipantAction({ dealId, personId, role: null }, readCsrfToken());
    if (!r.ok) return r.error.id;
    await refresh();
    return null;
  }

  async function add(personId: string): Promise<string | null> {
    const failure = await link(personId);
    return failure === null ? null : `Could not link participant (${failure})`;
  }

  async function remove(personId: string): Promise<string | null> {
    const r = await removeParticipantAction({ dealId, personId }, readCsrfToken());
    if (!r.ok) return `Could not remove participant (${r.error.id})`;
    await refresh();
    return null;
  }

  async function createAndAdd(name: string): Promise<string | null> {
    const r = await createPersonAction(
      { name, orgId, emails: [], phones: [], customFields: {} },
      readCsrfToken(),
    );
    if (!r.ok) return createFailureMessage(r.error.id);
    await Promise.all([
      utils.contacts.personOptions.invalidate(),
      orgId !== null ? utils.contacts.listPeopleForOrg.invalidate({ orgId }) : undefined,
    ]);
    const linkError = await link(r.value.id);
    if (linkError !== null) return `${name} was created but could not be linked (${linkError})`;
    return null;
  }

  return { participants, add, remove, createAndAdd };
}
