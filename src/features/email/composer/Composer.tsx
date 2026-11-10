"use client";
import { AttachButton } from "./AttachButton";
import { AttachmentList } from "./AttachmentList";
import { ComposerErrorAlert } from "./ComposerErrorAlert";
import { ComposerFooter } from "./ComposerFooter";
import { ComposerHeader } from "./ComposerHeader";
import type { ComposerProps } from "./ComposerProps";
import { mergeRecipientEmail } from "./composerLinks";
import { InsertToolbar } from "./InsertToolbar";
import { RecipientsRow } from "./RecipientsRow";
import { RichTextBody } from "./RichTextBodyLazy";
import { SignatureDropdown } from "./SignatureDropdown";
import { SubjectRow } from "./SubjectRow";
import { useComposerState } from "./useComposerState";

export function Composer(props: ComposerProps): React.ReactNode {
  const { fromAddress, senderPicker, onClose, context } = props;
  const {
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
  } = useComposerState(props);
  return (
    <section
      aria-label="compose email"
      className="rounded-md border border-border bg-background p-3 flex flex-col gap-2 text-sm"
    >
      <ComposerHeader
        fromAddress={fromAddress}
        senderPicker={senderPicker}
        onClose={
          onClose === undefined
            ? undefined
            : () => {
                resetDraft();
                onClose();
              }
        }
      />
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

      <div className="flex items-center gap-2">
        <InsertToolbar
          key={`toolbar-${recipientsNonce}`}
          onSubjectChange={setSubject}
          subjectLocked={resolvedThreadId !== undefined}
          onBodyChange={setBody}
          context={context}
          onInsertField={(text) => setInsertToken((prev) => ({ text, seq: (prev?.seq ?? 0) + 1 }))}
          subject={subject}
          bodyHtml={body}
          recipientEmail={mergeRecipientEmail(toList, ccList, bccList)}
          personId={links.linkPersonId ?? null}
          dealId={links.linkDealId ?? null}
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
        frameClassName="rounded-md border border-border bg-background text-sm"
        contentClassName="min-h-40 [&_.ProseMirror]:min-h-40"
      />

      <AttachmentList
        attachments={attachments}
        onRemove={(fileId) => setAttachments((prev) => prev.filter((a) => a.fileId !== fileId))}
      />
      <div className="flex items-center gap-2">
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
            showVisibility={resolvedThreadId === undefined}
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
