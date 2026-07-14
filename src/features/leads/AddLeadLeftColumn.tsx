"use client";
import type React from "react";
import { useId } from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { DatePicker } from "@/components/ui/DatePicker";
import { Input } from "@/components/ui/Input";
import { Select, type SelectOption } from "@/components/ui/Select";
import { TITLE_MAX_LEN } from "@/constants/fieldLimits";
import { SOURCE_CHANNEL_KEYS, SOURCE_CHANNELS } from "@/constants/sourceChannels";
import { STRINGS } from "@/constants/strings";
import { LabelField } from "@/features/labels/LabelField";

const L = STRINGS.leads;

import { EntityCombobox } from "@/features/entity-create/EntityCombobox";
import type { AddLeadState } from "./addLeadState";

interface Option {
  id: string;
  name: string;
}

interface AddLeadLeftColumnProps {
  state: AddLeadState;
  set: (patch: Partial<AddLeadState>) => void;
  // Title edits go through this (not set) so the modal can stop autofilling once the user types.
  // Optional: falls back to a plain title patch when a caller does not need the edit signal.
  onTitleChange?: (value: string) => void;
  people: Option[];
  orgs: Option[];
  owners: Option[] | null;
  groups: Option[] | null;
  baseCurrency: string;
}

// Left column of the Add lead dialog (Pipedrive): contact/org, title, value, label, owner, close
// date, source, visibility. No pipeline/stage (leads live outside pipelines). Presentational.
export function AddLeadLeftColumn(props: AddLeadLeftColumnProps): React.ReactNode {
  const { state, set, onTitleChange, people, orgs, owners, groups, baseCurrency } = props;
  const titleId = useId();
  const sourceChannelIdId = useId();
  return (
    <div className="flex flex-col gap-3 text-sm">
      <EntityCombobox
        label={L.contactPerson}
        options={people}
        placeholder={L.searchAddPerson}
        createLabel={(q) => L.addAsNewPerson(q)}
        similarWarning={L.similarContact}
        onSelectExisting={(id) => set({ personMode: "existing", personId: id })}
        onCreateNew={(name) => set({ personMode: "new", personId: "", newPersonName: name })}
        onClear={() => set({ personMode: "existing", personId: "", newPersonName: "" })}
      />

      <EntityCombobox
        label={L.organization}
        options={orgs}
        placeholder={L.searchAddOrg}
        createLabel={(q) => L.addAsNewOrg(q)}
        similarWarning={L.similarOrg}
        onSelectExisting={(id) => set({ orgMode: "existing", orgId: id })}
        onCreateNew={(name) => set({ orgMode: "new", orgId: "", newOrgName: name })}
        onClear={() => set({ orgMode: "existing", orgId: "", newOrgName: "" })}
      />

      <label className="block" htmlFor={titleId}>
        <span className="mb-1 block font-medium">{L.titleLabel}</span>
        <Input
          id={titleId}
          aria-label={L.leadTitle}
          value={state.title}
          onChange={(e) =>
            onTitleChange ? onTitleChange(e.target.value) : set({ title: e.target.value })
          }
          placeholder={L.leadTitle}
          maxLength={TITLE_MAX_LEN}
        />
        <span className="mt-0.5 block text-right text-xs tabular-nums text-muted-foreground">
          {state.title.length}/{TITLE_MAX_LEN}
        </span>
      </label>

      <div>
        <span className="mb-1 block font-medium">{L.valueLabel}</span>
        <div className="flex gap-2">
          <Input
            aria-label={L.leadValue}
            inputMode="decimal"
            value={state.value}
            onChange={(e) => set({ value: e.target.value })}
            placeholder={L.valuePlaceholder}
          />
          <span className="flex items-center rounded-md border bg-muted px-2.5 text-sm text-muted-foreground">
            {baseCurrency}
          </span>
        </div>
      </div>

      <div>
        <span className="mb-1 block font-medium">{L.labelsLabel}</span>
        <LabelField target="lead" value={state.labels} onChange={(labels) => set({ labels })} />
      </div>

      {owners !== null && (
        <div className="block">
          <span className="mb-1 block font-medium">{L.ownerLabel}</span>
          <Combobox
            ariaLabel={L.ownerLabel}
            value={state.ownerId}
            onChange={(id) => set({ ownerId: id })}
            options={[
              { value: "", label: L.ownerMe },
              ...owners.map<ComboboxOption>((u) => ({
                value: u.id,
                label: u.name,
                avatarName: u.name,
              })),
            ]}
          />
        </div>
      )}

      <div className="block">
        <span className="mb-1 block font-medium">{L.expectedCloseDate}</span>
        <DatePicker
          ariaLabel={L.expectedCloseDate}
          value={state.expectedCloseDate === "" ? null : state.expectedCloseDate}
          onChange={(v) => set({ expectedCloseDate: v ?? "" })}
        />
      </div>

      <div>
        <span className="mb-1 block font-medium">{L.sourceChannel}</span>
        <Select
          ariaLabel={L.sourceChannel}
          value={state.sourceChannel}
          onChange={(v) => set({ sourceChannel: v })}
          placeholder={L.noSourceChannel}
          options={[
            { value: "", label: L.noSourceChannel },
            ...SOURCE_CHANNEL_KEYS.map<SelectOption>((k) => ({
              value: k,
              label: SOURCE_CHANNELS[k].name,
            })),
          ]}
        />
      </div>

      <label className="block" htmlFor={sourceChannelIdId}>
        <span className="mb-1 block font-medium">{L.sourceChannelId}</span>
        <Input
          id={sourceChannelIdId}
          aria-label={L.sourceChannelId}
          value={state.sourceChannelId}
          onChange={(e) => set({ sourceChannelId: e.target.value })}
          placeholder={L.sourceChannelIdPlaceholder}
        />
      </label>

      {groups !== null && (
        <div className="block">
          <span className="mb-1 block font-medium">{L.visibleTo}</span>
          <Select
            ariaLabel={L.visibleTo}
            value={state.visibilityGroupId}
            onChange={(v) => set({ visibilityGroupId: v })}
            placeholder={L.visibleToDefault}
            options={[
              { value: "", label: L.visibleToDefault },
              ...groups.map<SelectOption>((g) => ({ value: g.id, label: g.name })),
            ]}
          />
        </div>
      )}
    </div>
  );
}
