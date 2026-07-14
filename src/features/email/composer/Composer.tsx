"use client";

import { useRef, useState } from "react";
import { useInterfacePrefs } from "@/features/identity/InterfacePrefsProvider";
import { trpc } from "@/lib/trpc-client";
import type { EmailVisibility } from "../threadVisibility";
import { AttachButton } from "./AttachButton";
import type { AttachedFile } from "./AttachmentList";
import { AttachmentList } from "./AttachmentList";
import { ComposerErrorAlert } from "./ComposerErrorAlert";
import { ComposerFooter } from "./ComposerFooter";
import { ComposerHeader } from "./ComposerHeader";
import type { ComposerContext } from "./composer.types";
import { dealDefaultRecipients } from "./dealRecipients";
import { FromPicker } from "./FromPicker";
import { InsertToolbar } from "./InsertToolbar";
import { RecipientsRow } from "./RecipientsRow";
import { RichTextBody } from "./RichTextBodyLazy";
import { resolveComposerThreadId } from "./resolveThreadId";
import { SignatureDropdown } from "./SignatureDropdown";
import { SubjectRow } from "./SubjectRow";
import { buildSendHandlers } from "./useComposerSend";
import { useComposerSignature } from "./useComposerSignature";
import { useDraftAutosave } from "./useDraftAutosave";

interface ComposerProps {
  // accountId comes from the server (ThreadView.accountId) - never fabricated client-side.
  accountId: string;
  // fromAddress is the sender mailbox address shown in the From row.
  fromAddress?: string;
  // context drives deal-specific behaviours (prefill recipient, add-as-activity, etc.).
  context?: ComposerContext;
  // threadId present when replying to an existing thread (inbox context).
  threadId?: string;
  // linkDealId comes from the inbox compose's ComposeLinkSidebar (a picked/created deal held in
  // page state, not the deal-workspace `context`). Forwarded into the send deps so the new
  // outbound thread links to that deal; see useComposerSend.ts buildInput.
  linkDealId?: string;
  // draft present when resuming a saved draft: seeds initial state. Autosave then continues
  // into the same draft id, and the draft is deleted on send. threadId preserves a reply
  // draft's thread linkage (omitting it forks a new thread on send).
  draft?: {
    id: string;
    subject: string;
    bodyHtml: string;
    to: string[];
    cc: string[];
    threadId?: string | null;
    visibility?: EmailVisibility;
  };
  // prefill seeds initial state (reader Reply / Reply all / Forward). Only used when no
  // `draft` is present; draft (a saved autosave) always takes precedence.
  prefill?: { to?: string[]; cc?: string[]; subject?: string; bodyHtml?: string };
  onSent?: () => void;
  // Email-tab close: resets the draft then returns to the host's default view.
  onClose?: () => void;
}

export function Composer({
  accountId,
  fromAddress,
  context,
  threadId,
  linkDealId,
  draft,
  prefill,
  onSent,
  onClose,
}: ComposerProps): React.ReactNode {
  const resolvedThreadId = resolveComposerThreadId(threadId, draft?.threadId, context);
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
  // C1: compose privacy, restored from a resumed draft or defaulting to "shared". Threaded into the
  // send payload so a private compose lands a private thread across all send paths, and persisted by
  // autosave so a private selection survives resume (codex P1).
  const [visibility, setVisibility] = useState<EmailVisibility>(draft?.visibility ?? "shared");
  const [addAsActivity, setAddAsActivity] = useState(false);
  const [sending, setSending] = useState(false);
  // True while AttachButton has an upload batch in flight: blocks Send to prevent a
  // race where the user clicks Send before the fileId is confirmed and returned.
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // insertToken drives RichTextBody.insertContent imperatively.
  // seq increments on each insert so the useEffect always fires.
  const [insertToken, setInsertToken] = useState<{ text: string; seq: number } | undefined>(
    undefined,
  );
  // Incrementing nonce remounts RecipientsRow on reset, collapsing its internal
  // showCcBcc state back to false without lifting that state into Composer.
  const [recipientsNonce, setRecipientsNonce] = useState(0);
  // Confirmed uploaded attachments; cleared on resetDraft so Discard starts fresh.
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);

  const { data: signatures = [] } = trpc.email.signatures.list.useQuery();

  // Activity types resolve the email typeId for add-as-activity (available in deal + inbox context).
  const { data: activityTypes = [] } = trpc.activities.listTypes.useQuery();

  // Signature: embeds the default into the body on a fresh compose (C3), else carries the id for the
  // server to append on a reply/forward/legacy draft. See useComposerSignature.
  const { signatureId, sendSignatureId, applySignature, resetSignature } = useComposerSignature({
    signatures,
    setBody,
    // Decided from the initial props (not the live body) so a fast typist cannot flip a fresh
    // compose into the prefill branch before the signatures query resolves.
    startedWithBody: (draft?.bodyHtml ?? prefill?.bodyHtml ?? "") !== "",
    resumingDraft: draft !== undefined,
  });

  function resetDraft(): void {
    setToList(defaultToList);
    setCcList([]);
    setBccList([]);
    setSubject("");
    // Re-seed the default signature into the body so a discarded draft matches a fresh open (C3).
    resetSignature();
    setTrackOpens(false);
    setTrackLinks(false);
    setVisibility("shared");
    setAddAsActivity(false);
    setInsertToken(undefined); // stop the remounted RichTextBody re-inserting the last field
    setRecipientsNonce((n) => n + 1); // remount RecipientsRow so showCcBcc collapses to false
    setAttachments([]); // discarded draft must not leak files into the next send
  }

  // Shared with the autosave hook so delete-on-send targets the id autosave created/resumed.
  const draftIdRef = useRef<string | undefined>(draft?.id);
  // Shared in-flight save promise: lets send await a racing autosave before deleting the draft.
  const draftInFlightRef = useRef<Promise<void> | null>(null);
  useDraftAutosave({
    accountId,
    threadId: resolvedThreadId ?? null,
    subject,
    body,
    toList,
    ccList,
    visibility,
    initialDraftId: draft?.id,
    draftIdRef,
    inFlightRef: draftInFlightRef,
  });

  // buildSendHandlers reads draftIdRef/inFlightRef only inside the click handlers it returns (at
  // event time, not this render), so the rule's warning here is a false positive.
  // eslint-disable-next-line react-hooks/refs -- refs are read inside the returned handlers, not now
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
    // C3: when the signature is embedded in `body`, sendSignatureId is "" (no server re-append);
    // for a forward/reply/legacy draft it is the selected id so the server appends it.
    signatureId: sendSignatureId,
    attachments: attachments.map((a) => ({ fileId: a.fileId })),
    context,
    linkDealId,
    activityTypes,
    addAsActivity,
    setSending,
    setError,
    resetDraft,
    onSent,
    draftIdRef,
    inFlightRef: draftInFlightRef,
  });

  // AttachButton needs an entityId for the upload; use dealId in deal context,
  // otherwise fall back to accountId as a stable entity anchor.
  const attachEntityId = context?.kind === "deal" ? context.dealId : accountId;
  const attachEntityType =
    context?.kind === "deal" ? ("deal" as const) : ("email_message" as const);

  return (
    <section
      aria-label="compose email"
      className="rounded-md border border-border bg-background p-3 flex flex-col gap-2 text-sm"
    >
      <ComposerHeader
        onClose={
          onClose === undefined
            ? undefined
            : () => {
                resetDraft();
                onClose();
              }
        }
      />
      {fromAddress !== undefined && <FromPicker address={fromAddress} />}
      <ComposerErrorAlert error={error} onDismiss={() => setError(null)} />
      <RecipientsRow
        key={recipientsNonce}
        to={toList}
        onToChange={setToList}
        cc={ccList}
        onCcChange={setCcList}
        bcc={bccList}
        onBccChange={setBccList}
      />
      <SubjectRow value={subject} onChange={setSubject} />
      {/* PD places the template / insert-field / signature row directly above the body, not at the
          top of the composer. */}
      <div className="flex items-center gap-2">
        <InsertToolbar
          key={`toolbar-${recipientsNonce}`}
          onSubjectChange={setSubject}
          onBodyChange={setBody}
          context={context}
          onInsertField={(text) => setInsertToken((prev) => ({ text, seq: (prev?.seq ?? 0) + 1 }))}
          subject={subject}
          bodyHtml={body}
        />
        <SignatureDropdown
          signatures={signatures.map((s) => ({ id: s.id, name: s.name }))}
          value={signatureId}
          onChange={applySignature}
        />
      </div>
      <RichTextBody
        key={`body-${recipientsNonce}`}
        html={body}
        onChange={setBody}
        insertToken={insertToken}
        // Frame the editor as a white rounded 14px card to match PD's composer body.
        frameClassName="rounded-md border border-border bg-background text-sm"
        // PD keeps the composer compact and top-anchored: the editor is a fixed writing area with the
        // format toolbar docked right below it near the top of the page, NOT a full-viewport box that
        // pushes the toolbar to the bottom. A modest min-height gives room to write without stretching.
        contentClassName="min-h-40 [&_.ProseMirror]:min-h-40"
      />
      {/* Confirmed attachments list above the footer action row. */}
      <AttachmentList
        attachments={attachments}
        onRemove={(fileId) => setAttachments((prev) => prev.filter((a) => a.fileId !== fileId))}
      />
      <div className="flex items-center gap-2">
        {/* Paperclip attach button sits in the left slot of the footer row. */}
        <AttachButton
          entityType={attachEntityType}
          entityId={attachEntityId}
          onAttached={(file) => setAttachments((prev) => [...prev, file])}
          onUploadingChange={setUploading}
        />
        <div className="flex-1">
          <ComposerFooter
            canSend={toList.length > 0 && !uploading}
            sending={sending}
            onSend={() => void handleSend()}
            onDiscard={() => {
              resetDraft();
              setError(null);
            }}
            trackOpens={trackOpens}
            onTrackOpensChange={setTrackOpens}
            trackLinks={trackLinks}
            onTrackLinksChange={setTrackLinks}
            visibility={visibility}
            onVisibilityChange={setVisibility}
            // Show the privacy picker only for a NEW compose. On a reply (existing thread) the send
            // path preserves that thread's visibility, so the picker would be inert (codex P2); the
            // reader's thread-privacy toggle governs an existing thread instead.
            showVisibility={resolvedThreadId === undefined}
            // Available from both deal and inbox context; a non-deal send logs a
            // standalone activity (see fireActivity in useComposerSend.ts).
            showAddAsActivity={true}
            addAsActivity={addAsActivity}
            onAddAsActivityChange={setAddAsActivity}
            onSendLater={(scheduledAt) => void handleSendLater(scheduledAt)}
          />
        </div>
      </div>
    </section>
  );
}
