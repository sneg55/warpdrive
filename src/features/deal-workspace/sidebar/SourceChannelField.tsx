"use client";
import { useRouter } from "next/navigation";
import type { SelectOption } from "@/components/ui/Select";
import {
  isSourceChannelKey,
  SOURCE_CHANNELS,
  type SourceChannelKey,
} from "@/constants/sourceChannels";
import { updateDealAction } from "@/features/deals/updateAction";
import { InlineSelectField } from "@/features/inline-edit/InlineSelectField";
import { err, ok, type Result } from "@/types/result";
import { readCsrfToken } from "@/utils/csrfCookie";
import { FieldRow } from "./FieldRow";

const SOURCE_CHANNEL_OPTIONS: SelectOption[] = [
  { value: "", label: "None" },
  ...Object.entries(SOURCE_CHANNELS).map(([value, channel]) => ({
    value,
    label: channel.name,
  })),
];

interface SourceChannelFieldProps {
  dealId: string;
  updatedAt: string | Date;
  sourceChannel: string | null;
}

export function SourceChannelField({ dealId, updatedAt, sourceChannel }: SourceChannelFieldProps) {
  const router = useRouter();
  const expectedUpdatedAt = new Date(updatedAt).toISOString();
  const channelValue =
    sourceChannel !== null && isSourceChannelKey(sourceChannel) ? sourceChannel : "";

  async function save(value: string): Promise<Result<unknown, string>> {
    const next = value === "" ? null : (value as SourceChannelKey);
    const r = await updateDealAction(
      { dealId, expectedUpdatedAt, sourceChannel: next },
      readCsrfToken(),
    );
    router.refresh();
    return r.ok ? ok(r.deal) : err(r.error.id);
  }

  return (
    <FieldRow label="Channel">
      <InlineSelectField
        label="Channel"
        value={channelValue}
        options={SOURCE_CHANNEL_OPTIONS}
        onSave={save}
      />
    </FieldRow>
  );
}
