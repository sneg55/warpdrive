"use client";
import { useRef, useState } from "react";
import { useInterfacePrefs } from "@/features/identity/InterfacePrefsProvider";
import { trpc } from "@/lib/trpc-client";
import type { EmailVisibility } from "../threadVisibility";
import type { AttachedFile } from "./AttachmentList";
import type { ComposerProps } from "./ComposerProps";
import { resolveComposerLinks } from "./composerLinks";
import { dealDefaultRecipients } from "./dealRecipients";
import { resolveComposerThreadId } from "./resolveThreadId";
import { buildSendHandlers } from "./useComposerSend";
import { useComposerSignature } from "./useComposerSignature";
import { useDraftAutosave } from "./useDraftAutosave";
export function useComposerState({
  accountId,
  context,
  threadId,
  linkDealId,
  draft,
  prefill,
  onSent,
}: ComposerProps) {
  const resolvedThreadId = resolveComposerThreadId(threadId, draft?.threadId, context);
  const links = resolveComposerLinks({ context, linkDealId, draft });
  const { prefillParticipantsAsRecipients } = useInterfacePrefs();

  const defaultToList: string[] =
    context?.kind === "deal" ? dealDefaultRecipients(context, prefillParticipantsAsRecipients) : [];

  const [toList, setToList] = useState<string[]>(draft?.to ?? prefill?.to ?? defaultToList);
  const [ccList, setCcList] = useState<string[]>(draft?.cc ?? prefill?.cc ?? []);
  const [bccList, setBccList] = useState<string[]>([]);
  const [subject, setSubject] = useState(draft?.subject ?? prefill?.subject ?? "");
  const [body, setBody] = useState(draft?.bodyHtml ?? prefill?.bodyHtml ?? "");
  const [trackOpens, setTrackOpens] = useState(false);
  const [trackLinks, setTrackLinks] = useState(false);
  const [visibility, setVisibility] = useState<EmailVisibility>(draft?.visibility ?? "shared");
  const [addAsActivity, setAddAsActivity] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insertToken, setInsertToken] = useState<{ text: string; seq: number } | undefined>(
    undefined,
  );
  const [recipientsNonce, setRecipientsNonce] = useState(0);
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);

  const { data: signatures = [] } = trpc.email.signatures.list.useQuery();

  const { data: activityTypes = [] } = trpc.activities.listTypes.useQuery();

  const { signatureId, sendSignatureId, applySignature, resetSignature } = useComposerSignature({
    signatures,
    setBody,
    startedWithBody: (draft?.bodyHtml ?? prefill?.bodyHtml ?? "") !== "",
    resumingDraft: draft !== undefined,
  });

  function resetDraft(): void {
    setToList(defaultToList);
    setCcList([]);
    setBccList([]);
    setSubject("");
    resetSignature();
    setTrackOpens(false);
    setTrackLinks(false);
    setVisibility("shared");
    setAddAsActivity(false);
    setInsertToken(undefined);
    setRecipientsNonce((n) => n + 1);
    setAttachments([]);
  }

  const draftIdRef = useRef<string | undefined>(draft?.id);
  const draftInFlightRef = useRef<Promise<void> | null>(null);
  useDraftAutosave({
    accountId,
    threadId: resolvedThreadId ?? null,
    subject,
    body,
    toList,
    ccList,
    visibility,
    linkDealId: links.linkDealId,
    linkPersonId: links.linkPersonId,
    initialDraftId: draft?.id,
    draftIdRef,
    inFlightRef: draftInFlightRef,
  });

  // eslint-disable-next-line react-hooks/refs
  const { handleSend, handleSendLater } = buildSendHandlers({
    accountId,
    resolvedThreadId,
    toList,
    ccList,
    bccList,
    subject,
    body,
    trackOpens,
    trackLinks,
    visibility,
    signatureId: sendSignatureId,
    attachments: attachments.map((a) => ({ fileId: a.fileId })),
    context,
    linkDealId: links.linkDealId,
    linkPersonId: links.linkPersonId,
    activityTypes,
    addAsActivity,
    setSending,
    setError,
    resetDraft,
    onSent,
    draftIdRef,
    inFlightRef: draftInFlightRef,
  });

  const attachEntityId = context?.kind === "deal" ? context.dealId : accountId;
  const attachEntityType =
    context?.kind === "deal" ? ("deal" as const) : ("email_message" as const);

  return {
    resolvedThreadId,
    links,
    toList,
    setToList,
    ccList,
    setCcList,
    bccList,
    setBccList,
    subject,
    setSubject,
    body,
    setBody,
    trackOpens,
    setTrackOpens,
    trackLinks,
    setTrackLinks,
    visibility,
    setVisibility,
    addAsActivity,
    setAddAsActivity,
    sending,
    uploading,
    setUploading,
    error,
    setError,
    insertToken,
    setInsertToken,
    recipientsNonce,
    attachments,
    setAttachments,
    signatures,
    signatureId,
    applySignature,
    resetDraft,
    handleSend,
    handleSendLater,
    attachEntityId,
    attachEntityType,
  };
}
