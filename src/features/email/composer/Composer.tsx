"use client";

import { useRef, useState } from "react";
import { useInterfacePrefs } from "@/features/identity/InterfacePrefsProvider";
import { trpc } from "@/lib/trpc-client";
import { AttachButton } from "./AttachButton";
import type { AttachedFile } from "./AttachmentList";
import { AttachmentList } from "./AttachmentList";
import { ComposerFooter } from "./ComposerFooter";
import { ComposerHeader } from "./ComposerHeader";
import type { ComposerContext } from "./composer.types";
import { dealDefaultRecipients } from "./dealRecipients";
import { FromPicker } from "./FromPicker";
import { InsertToolbar } from "./InsertToolbar";
import { RecipientsRow } from "./RecipientsRow";
import { RichTextBody } from "./RichTextBodyLazy";
import { resolveComposerThreadId } from "./resolveThreadId";
import { SaveAsTemplateDialog } from "./SaveAsTemplateDialog";
import { SubjectRow } from "./SubjectRow";
import { buildSendHandlers } from "./useComposerSend";
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
  draft,
  prefill,
  onSent,
  onClose,
}: ComposerProps): React.ReactNode {
  const resolvedThreadId = resolveComposerThreadId(threadId, draft?.threadId, context);
  const { prefillParticipantsAsRecipients } = useInterfacePrefs();

  const defaultToList: string[] =
    context?.kind === "deal" ? dealDefaultRecipients(context, prefillParticipantsAsRecipients) : [];

  const isDealContext = context?.kind === "deal";

  const [toList, setToList] = useState<string[]>(draft?.to ?? prefill?.to ?? defaultToList);
  const [ccList, setCcList] = useState<string[]>(draft?.cc ?? prefill?.cc ?? []);
  const [bccList, setBccList] = useState<string[]>([]);
  const [subject, setSubject] = useState(draft?.subject ?? prefill?.subject ?? "");
  const [body, setBody] = useState(draft?.bodyHtml ?? prefill?.bodyHtml ?? "");
  const [trackOpens, setTrackOpens] = useState(false);
  const [trackLinks, setTrackLinks] = useState(false);
  const [signatureId, setSignatureId] = useState("");
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

  // Activity types: needed to resolve the email typeId for add-as-activity.
  // Only queried when in deal context (toggle can only appear there).
  const { data: activityTypes = [] } = trpc.activities.listTypes.useQuery(undefined, {
    enabled: isDealContext,
  });

  // Preselect the default signature exactly once on first load. A ref guards against
  // re-applying after the user explicitly chooses "None" (which also sets signatureId
  // to "") or after a background refetch fires the effect again (item 4).
  const defaultSigId = signatures.find((s) => s.isDefault)?.id;
  // Apply the default signature once, the first render where the query has produced one. Adjusting
  // during render rather than in an effect keeps the empty signature off the screen for a frame,
  // and the `applied` flag is state (not a ref) so it survives a concurrent re-render correctly.
  const [sigDefaultApplied, setSigDefaultApplied] = useState(false);
  if (!sigDefaultApplied && defaultSigId !== undefined) {
    setSigDefaultApplied(true);
    setSignatureId(defaultSigId);
  }

  function resetDraft(): void {
    setToList(defaultToList);
    setCcList([]);
    setBccList([]);
    setSubject("");
    setBody("");
    setTrackOpens(false);
    setTrackLinks(false);
    setSignatureId(defaultSigId ?? "");
    setAddAsActivity(false);
    // Clear insertToken so the remounted RichTextBody does not re-insert the last field.
    setInsertToken(undefined);
    // Remount RecipientsRow so showCcBcc collapses to false.
    setRecipientsNonce((n) => n + 1);
    // Clear confirmed attachments so a discarded draft does not leak files into the next send.
    setAttachments([]);
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
    initialDraftId: draft?.id,
    draftIdRef,
    inFlightRef: draftInFlightRef,
  });

  // buildSendHandlers only dereferences draftIdRef/inFlightRef inside the click handlers it
  // returns (useComposerSend.ts), which run at event time, never during this render. The rule
  // cannot see through the call, so it reports a false positive here.
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
    signatureId,
    attachments: attachments.map((a) => ({ fileId: a.fileId })),
    context,
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
    <section aria-label="compose email" className="border-t border-border p-3 flex flex-col gap-2">
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
      {error !== null && (
        <div
          role="alert"
          className="flex items-start justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <span>{error}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setError(null)}
            className="shrink-0 font-medium hover:opacity-70"
          >
            &times;
          </button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <InsertToolbar
          key={`toolbar-${recipientsNonce}`}
          onSubjectChange={setSubject}
          onBodyChange={setBody}
          context={context}
          onInsertField={(text) => setInsertToken((prev) => ({ text, seq: (prev?.seq ?? 0) + 1 }))}
        />
        <SaveAsTemplateDialog subject={subject} bodyHtml={body} />
      </div>
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
      <RichTextBody
        key={`body-${recipientsNonce}`}
        html={body}
        onChange={setBody}
        insertToken={insertToken}
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
            showAddAsActivity={isDealContext}
            addAsActivity={addAsActivity}
            onAddAsActivityChange={setAddAsActivity}
            onSendLater={(scheduledAt) => void handleSendLater(scheduledAt)}
            signatures={signatures.map((s) => ({ id: s.id, name: s.name }))}
            signatureId={signatureId}
            onSignatureChange={setSignatureId}
          />
        </div>
      </div>
    </section>
  );
}
