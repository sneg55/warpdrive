"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { Select } from "@/components/ui/Select";
import {
  isSourceChannelKey,
  SOURCE_CHANNELS,
  type SourceChannelKey,
} from "@/constants/sourceChannels";
import { updateDealAction } from "@/features/deals/updateAction";
import { InlineEditFooter } from "@/features/inline-edit/InlineEditFooter";
import { saveErrorMessage } from "@/features/inline-edit/saveError";
import { readCsrfToken } from "@/utils/csrfCookie";
import { BulkEditRow } from "./BulkEditRow";
import { SourceChannelField } from "./SourceChannelField";
import { SourceChannelIdField } from "./SourceChannelIdField";

const CHANNEL_OPTIONS = [
  { value: "", label: "None" },
  ...Object.entries(SOURCE_CHANNELS).map(([value, channel]) => ({ value, label: channel.name })),
];

interface SourceBlockProps {
  dealId: string;
  updatedAt: string | Date;
  sourceChannel: string | null;
  sourceChannelId: string | null;
  bulkEditing?: boolean;
  onExitBulk?: () => void;
}

// Source section: Channel (enum) + Channel ID (free text). Per-field inline editing normally; the
// section pencil opens both at once behind a single Save, committing one updateDealAction with
// just the changed fields under the deal CAS precondition.
export function SourceBlock({
  dealId,
  updatedAt,
  sourceChannel,
  sourceChannelId,
  bulkEditing = false,
  onExitBulk,
}: SourceBlockProps): React.ReactNode {
  if (bulkEditing) {
    return (
      <SourceBulkEditor
        dealId={dealId}
        updatedAt={updatedAt}
        sourceChannel={sourceChannel}
        sourceChannelId={sourceChannelId}
        onExit={onExitBulk ?? (() => {})}
      />
    );
  }
  return (
    <>
      <SourceChannelField dealId={dealId} updatedAt={updatedAt} sourceChannel={sourceChannel} />
      <SourceChannelIdField
        dealId={dealId}
        updatedAt={updatedAt}
        sourceChannelId={sourceChannelId}
      />
    </>
  );
}

function SourceBulkEditor({
  dealId,
  updatedAt,
  sourceChannel,
  sourceChannelId,
  onExit,
}: {
  dealId: string;
  updatedAt: string | Date;
  sourceChannel: string | null;
  sourceChannelId: string | null;
  onExit: () => void;
}): React.ReactNode {
  const router = useRouter();
  const expectedUpdatedAt = new Date(updatedAt).toISOString();
  const initialChannel =
    sourceChannel !== null && isSourceChannelKey(sourceChannel) ? sourceChannel : "";
  const [channel, setChannel] = useState<string>(initialChannel);
  const [channelId, setChannelId] = useState(sourceChannelId ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSave(): void {
    const patch: {
      dealId: string;
      expectedUpdatedAt: string;
      sourceChannel?: SourceChannelKey | null;
      sourceChannelId?: string | null;
    } = { dealId, expectedUpdatedAt };
    if (channel !== initialChannel)
      patch.sourceChannel = channel === "" ? null : (channel as SourceChannelKey);
    if (channelId.trim() !== (sourceChannelId ?? "")) {
      patch.sourceChannelId = channelId.trim() === "" ? null : channelId.trim();
    }
    if (patch.sourceChannel === undefined && patch.sourceChannelId === undefined) {
      onExit();
      return;
    }
    setPending(true);
    setError(null);
    updateDealAction(patch, readCsrfToken())
      .then((r) => {
        setPending(false);
        if (r.ok) {
          router.refresh();
          onExit();
        } else {
          setError(saveErrorMessage(r.error.id));
        }
      })
      .catch(() => {
        setPending(false);
        setError(saveErrorMessage());
      });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5 text-muted-foreground text-xs">
        <span>Channel</span>
        <Select
          ariaLabel="Channel"
          value={channel}
          onChange={setChannel}
          options={CHANNEL_OPTIONS}
        />
      </div>
      <BulkEditRow
        label="Channel ID"
        value={channelId}
        onChange={setChannelId}
        disabled={pending}
      />
      {error !== null ? (
        <span role="alert" className="text-destructive text-xs">
          {error}
        </span>
      ) : null}
      <InlineEditFooter onCancel={onExit} onSave={onSave} saveDisabled={false} pending={pending} />
    </div>
  );
}
