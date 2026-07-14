"use client";
import type React from "react";
import { useId } from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { DatePicker } from "@/components/ui/DatePicker";
import { Input } from "@/components/ui/Input";
import { Select, type SelectOption } from "@/components/ui/Select";
import { TITLE_MAX_LEN } from "@/constants/fieldLimits";
import { SOURCE_CHANNEL_KEYS, SOURCE_CHANNELS } from "@/constants/sourceChannels";
import { EntityCombobox } from "@/features/entity-create/EntityCombobox";
import { LabelField } from "@/features/labels/LabelField";
import { formatMediumDate } from "@/lib/formatDate";
import type { AddDealState } from "./addDealState";
import { StageChevron } from "./StageChevron";

const NO_CHANNEL_LABEL = "No channel";
const DEFAULT_VISIBILITY_LABEL = "Default";

interface Option {
  id: string;
  name: string;
}
interface PipelineOption extends Option {
  stages: Option[];
}

interface AddDealLeftColumnProps {
  state: AddDealState;
  set: (patch: Partial<AddDealState>) => void;
  // Title edits go through this (not set) so the modal can stop autofilling once the user types.
  // Optional: falls back to a plain title patch when a caller does not need the edit signal.
  onTitleChange?: (value: string) => void;
  people: Option[];
  orgs: Option[];
  pipelines: PipelineOption[];
  stages: Option[]; // stages of the currently selected pipeline
  owners: Option[] | null; // null hides the owner select (actor cannot reassign)
  groups: Option[] | null; // null hides the visible-to select
  baseCurrency: string;
}

// Left column of the Add deal dialog (Pipedrive field order): contact/org, title, value, pipeline,
// stage, label, close date, owner, source, visibility. Purely presentational.
export function AddDealLeftColumn(props: AddDealLeftColumnProps): React.ReactNode {
  const {
    state,
    set,
    onTitleChange,
    people,
    orgs,
    pipelines,
    stages,
    owners,
    groups,
    baseCurrency,
  } = props;
  const titleId = useId();
  const sourceChannelIdId = useId();
  return (
    <div className="flex flex-col gap-3 text-sm">
      <EntityCombobox
        label="Contact person"
        options={people}
        placeholder="Search or add a person"
        createLabel={(q) => `Add '${q}' as new person`}
        similarWarning="Similar contact already exists."
        onSelectExisting={(id) => set({ personMode: "existing", personId: id })}
        onCreateNew={(name) => set({ personMode: "new", personId: "", newPersonName: name })}
        onClear={() => set({ personMode: "existing", personId: "", newPersonName: "" })}
      />

      <EntityCombobox
        label="Organization"
        options={orgs}
        placeholder="Search or add an organization"
        createLabel={(q) => `Add '${q}' as new organization`}
        similarWarning="Similar organization already exists."
        onSelectExisting={(id) => set({ orgMode: "existing", orgId: id })}
        onCreateNew={(name) => set({ orgMode: "new", orgId: "", newOrgName: name })}
        onClear={() => set({ orgMode: "existing", orgId: "", newOrgName: "" })}
      />

      <label className="block" htmlFor={titleId}>
        <span className="mb-1 block font-medium">Title</span>
        <Input
          id={titleId}
          aria-label="Deal title"
          value={state.title}
          onChange={(e) =>
            onTitleChange ? onTitleChange(e.target.value) : set({ title: e.target.value })
          }
          placeholder="Deal title"
          maxLength={TITLE_MAX_LEN}
        />
        <span className="mt-0.5 block text-right text-xs tabular-nums text-muted-foreground">
          {state.title.length}/{TITLE_MAX_LEN}
        </span>
      </label>

      <div>
        <span className="mb-1 block font-medium">Value</span>
        <div className="flex gap-2">
          <Input
            aria-label="Deal value"
            inputMode="decimal"
            value={state.value}
            onChange={(e) => set({ value: e.target.value })}
            placeholder="0"
          />
          <span className="flex items-center rounded-md border bg-muted px-2.5 text-sm text-muted-foreground">
            {baseCurrency}
          </span>
        </div>
      </div>

      <div>
        <span className="mb-1 block font-medium">Pipeline</span>
        <Select
          ariaLabel="Pipeline"
          value={state.pipelineId}
          onChange={(v) => {
            const next = pipelines.find((p) => p.id === v);
            set({ pipelineId: v, stageId: next?.stages[0]?.id ?? "" });
          }}
          options={pipelines.map<SelectOption>((p) => ({ value: p.id, label: p.name }))}
        />
      </div>

      <div>
        <span className="mb-1 block font-medium">Pipeline stage</span>
        <StageChevron
          stages={stages}
          selectedId={state.stageId}
          onSelect={(id) => set({ stageId: id })}
        />
      </div>

      <div className="block">
        <span className="mb-1 block font-medium">Labels</span>
        <LabelField target="deal" value={state.labels} onChange={(labels) => set({ labels })} />
      </div>

      <div className="block">
        <span className="mb-1 block font-medium">Expected close date</span>
        <DatePicker
          ariaLabel="Expected close date"
          value={state.expectedCloseDate === "" ? null : state.expectedCloseDate}
          placeholder="Set date"
          triggerClassName="flex h-8 w-full items-center rounded border border-field-border bg-card px-2 text-left text-sm"
          formatLabel={formatMediumDate}
          onChange={(v) => set({ expectedCloseDate: v ?? "" })}
        />
      </div>

      {owners !== null && (
        <div className="block">
          <span className="mb-1 block font-medium">Owner</span>
          <Combobox
            ariaLabel="Owner"
            value={state.ownerId}
            onChange={(id) => set({ ownerId: id })}
            options={[
              { value: "", label: "Me" },
              ...owners.map<ComboboxOption>((u) => ({
                value: u.id,
                label: u.name,
                avatarName: u.name,
              })),
            ]}
          />
        </div>
      )}

      <div>
        <span className="mb-1 block font-medium">Source channel</span>
        <Select
          ariaLabel="Source channel"
          value={state.sourceChannel}
          onChange={(v) => set({ sourceChannel: v })}
          placeholder={NO_CHANNEL_LABEL}
          options={[
            { value: "", label: NO_CHANNEL_LABEL },
            ...SOURCE_CHANNEL_KEYS.map<SelectOption>((k) => ({
              value: k,
              label: SOURCE_CHANNELS[k].name,
            })),
          ]}
        />
      </div>

      <label className="block" htmlFor={sourceChannelIdId}>
        <span className="mb-1 block font-medium">Source channel ID</span>
        <Input
          id={sourceChannelIdId}
          aria-label="Source channel ID"
          value={state.sourceChannelId}
          onChange={(e) => set({ sourceChannelId: e.target.value })}
          placeholder="Reference / campaign id"
        />
      </label>

      {groups !== null && (
        <div className="block">
          <span className="mb-1 block font-medium">Visible to</span>
          <Select
            ariaLabel="Visible to"
            value={state.visibilityGroupId}
            onChange={(v) => set({ visibilityGroupId: v })}
            placeholder={DEFAULT_VISIBILITY_LABEL}
            options={[
              { value: "", label: DEFAULT_VISIBILITY_LABEL },
              ...groups.map<SelectOption>((g) => ({ value: g.id, label: g.name })),
            ]}
          />
        </div>
      )}
    </div>
  );
}
