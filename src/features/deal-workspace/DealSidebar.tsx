"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import type { DealBlockId } from "@/constants/dealBlocks";
import {
  type DealSidebarSectionId,
  type DealSidebarSectionPreference,
  normalizeDealSidebarSections,
} from "@/constants/dealSidebarSections";
import { STRINGS } from "@/constants/strings";
import { useDealActionError } from "@/features/deal-workspace/DealActionErrorProvider";
import { updateDealAction } from "@/features/deals/updateAction";
import { readCsrfToken } from "@/utils/csrfCookie";
import { CollapsibleSection } from "./CollapsibleSection";
import { DealSummaryActionList } from "./DealSummaryActionList";
import { dealOverview } from "./dealOverview";
import { DealOrganizationSection } from "./sidebar/DealOrganizationSection";
import { FieldRow } from "./sidebar/FieldRow";
import { ManageSectionsDialog } from "./sidebar/ManageSectionsDialogLazy";
import { OrgSwitchDialog } from "./sidebar/OrgSwitchDialog";
import { ParticipantsSection } from "./sidebar/ParticipantsSection";
import { PersonSection } from "./sidebar/PersonSection";
import { SectionHeaderMenu, type SectionHeaderMenuItem } from "./sidebar/SectionHeaderMenu";
import { SourceBlock } from "./sidebar/SourceBlock";
import type { DealWorkspace } from "./summaryRepo";

const FIELD_SETTINGS_PATH = "/settings/fields";

const NONE: ReadonlySet<string> = new Set();

function fieldsPath(entity: "deal" | "person" | "organization"): string {
  return `${FIELD_SETTINGS_PATH}?entity=${entity}`;
}

// Left sidebar of the deal detail page: collapsible Summary / Source / Person / Organization /
// Overview sections built from the workspace aggregate. Purely presentational.
export function DealSidebar({
  workspace,
  now,
  isHidden,
  baseCurrency,
  orgOptions = [],
  sidebarSections,
  onSidebarSectionsChange,
  hiddenOrgFields = NONE,
  hiddenPersonFields = NONE,
}: {
  workspace: DealWorkspace;
  now: Date;
  isHidden: (id: DealBlockId) => boolean;
  baseCurrency: string;
  orgOptions?: Array<{ id: string; name: string }>;
  sidebarSections?: DealSidebarSectionPreference[];
  onSidebarSectionsChange?: (sections: DealSidebarSectionPreference[]) => void;
  // Built-in field keys hidden in Settings > Data fields, per entity, so the Organization/Person
  // sidebar sections drop the same rows the standalone detail pages do.
  hiddenOrgFields?: ReadonlySet<string>;
  hiddenPersonFields?: ReadonlySet<string>;
}): React.ReactNode {
  const {
    deal,
    person,
    org,
    customFieldDefs,
    personCustomFieldDefs = [],
    organizationCustomFieldDefs = [],
  } = workspace;
  const router = useRouter();
  const reportError = useDealActionError();
  const [orgDialogOpen, setOrgDialogOpen] = useState(false);
  const [manageSectionsOpen, setManageSectionsOpen] = useState(false);
  // Which section (if any) is in bulk-edit mode: the header pencil opens every field in that
  // section at once behind a single Save, rather than the old reveal-empties no-op.
  const [bulkSection, setBulkSection] = useState<DealSidebarSectionId | null>(null);
  const exitBulk = (): void => setBulkSection(null);
  const expectedUpdatedAt = new Date(deal.updatedAt).toISOString();
  const overview = dealOverview(deal.createdAt, deal.lastActivityAt, now);
  const sectionPrefs = normalizeDealSidebarSections(sidebarSections);
  const sections = STRINGS.dealSidebar.sections;
  const menu = STRINGS.dealSidebar.menu;

  async function saveOrgLink(orgId: string | null): Promise<void> {
    const r = await updateDealAction(
      { dealId: deal.id, expectedUpdatedAt, orgId },
      readCsrfToken(),
    );
    // On failure keep the switch dialog open and surface why, rather than closing/refreshing as
    // if the link changed (a permission/CAS denial otherwise looked like a silent success).
    if (r.ok) {
      setOrgDialogOpen(false);
      router.refresh();
    } else {
      reportError(r.error.id);
    }
  }

  function sectionActions(
    label: string,
    menuItems: SectionHeaderMenuItem[],
    opts: { fillGaps?: boolean; bulkSectionId?: DealSidebarSectionId; noEdit?: boolean } = {},
  ): (ctx: { hideEmpty: boolean; showEmptyFields: () => void }) => React.ReactNode {
    // Sections with editable fields (bulkSectionId set) turn the pencil into a section bulk-edit;
    // sections without (e.g. Overview) keep the pencil as the reveal-empties toggle.
    return ({ hideEmpty, showEmptyFields }) => (
      <SectionHeaderMenu
        sectionLabel={label}
        onEdit={
          opts.noEdit === true
            ? undefined
            : opts.bulkSectionId !== undefined
              ? () => setBulkSection(opts.bulkSectionId ?? null)
              : showEmptyFields
        }
        menuItems={menuItems}
        fillGapsPressed={!hideEmpty}
        onToggleFillGaps={opts.fillGaps === true ? showEmptyFields : undefined}
      />
    );
  }

  const dealFieldsItem = {
    label: menu.customizeFields,
    onSelect: () => router.push(fieldsPath("deal")),
  };
  const orgMenuItems: SectionHeaderMenuItem[] = [
    {
      label: menu.switchOrganization,
      disabled: orgOptions.length === 0,
      onSelect: () => setOrgDialogOpen(true),
    },
    { label: menu.unlinkOrganization, onSelect: () => void saveOrgLink(null), destructive: true },
    { label: menu.customizeFields, onSelect: () => router.push(fieldsPath("organization")) },
  ];

  const renderedSections: Record<DealSidebarSectionId, React.ReactNode> = {
    summary: !isHidden("summary") ? (
      <CollapsibleSection
        key="summary"
        title={sections.summary}
        // PD's Summary header carries ONLY the kebab: no hide-empty funnel (the action list has
        // no empty rows) and no reveal-empties pencil.
        showFilter={false}
        headerActions={() => (
          <SectionHeaderMenu
            sectionLabel={sections.summary}
            menuItems={[
              { label: menu.customizeSummary, onSelect: () => router.push(fieldsPath("deal")) },
              { label: menu.manageSections, onSelect: () => setManageSectionsOpen(true) },
            ]}
          />
        )}
      >
        <DealSummaryActionList
          deal={{
            id: deal.id,
            updatedAt: deal.updatedAt,
            value: deal.value !== null ? Number(deal.value) : null,
            expectedCloseDate: deal.expectedCloseDate,
            labels: deal.labels,
          }}
          person={person !== null ? { id: person.id, name: person.name } : null}
          org={org !== null ? { id: org.id, name: org.name } : null}
          orgOptions={orgOptions}
          baseCurrency={baseCurrency}
        />
      </CollapsibleSection>
    ) : null,

    source: (
      <CollapsibleSection
        key="source"
        title={sections.source}
        headerActions={sectionActions(sections.source, [dealFieldsItem], {
          bulkSectionId: "source",
        })}
      >
        <SourceBlock
          dealId={deal.id}
          updatedAt={deal.updatedAt}
          sourceChannel={deal.sourceChannel}
          sourceChannelId={deal.sourceChannelId}
          bulkEditing={bulkSection === "source"}
          onExitBulk={exitBulk}
        />
      </CollapsibleSection>
    ),

    person:
      !isHidden("person") && person !== null ? (
        <PersonSection
          key="person"
          person={person}
          menuItems={[
            { label: menu.customizeFields, onSelect: () => router.push(fieldsPath("person")) },
          ]}
          bulkEditing={bulkSection === "person"}
          onStartBulk={() => setBulkSection("person")}
          onExitBulk={exitBulk}
          hidden={hiddenPersonFields}
          customFieldDefs={personCustomFieldDefs}
          currency={baseCurrency}
          showLabels
        />
      ) : null,

    participants: (
      <ParticipantsSection
        key="participants"
        title={sections.participants}
        dealId={deal.id}
        person={person !== null ? { id: person.id, name: person.name } : null}
        orgId={org?.id ?? null}
        orgName={org?.name ?? null}
      />
    ),

    organization: (
      <DealOrganizationSection
        key="organization"
        hidden={isHidden("organization")}
        org={org}
        orgMenuItems={orgMenuItems}
        bulkEditing={bulkSection === "organization"}
        onStartBulk={() => setBulkSection("organization")}
        onExitBulk={exitBulk}
        hiddenOrgFields={hiddenOrgFields}
        organizationCustomFieldDefs={organizationCustomFieldDefs}
        currency={baseCurrency}
        dealId={deal.id}
        dealCustomFields={deal.customFields as Record<string, unknown>}
        dealCustomFieldDefs={customFieldDefs}
        expectedUpdatedAt={expectedUpdatedAt}
        title={sections.organization}
      />
    ),

    overview: (
      <CollapsibleSection
        key="overview"
        title={sections.overview}
        headerActions={sectionActions(sections.overview, [dealFieldsItem])}
      >
        <FieldRow label="Deal age">
          <span className="tabular-nums">{overview.ageDays}</span> days
        </FieldRow>
        <FieldRow label="Inactive">
          <span className="tabular-nums">{overview.inactiveDays}</span> days
        </FieldRow>
        <FieldRow label="Created">
          <span className="tabular-nums">{deal.createdAt.toLocaleDateString()}</span>
        </FieldRow>
      </CollapsibleSection>
    ),
  };

  return (
    <aside className="min-w-0 space-y-2">
      <ManageSectionsDialog
        open={manageSectionsOpen}
        sections={sectionPrefs}
        onOpenChange={setManageSectionsOpen}
        onSaved={(next) => onSidebarSectionsChange?.(next)}
      />
      <OrgSwitchDialog
        open={orgDialogOpen}
        currentOrgId={org?.id ?? null}
        options={orgOptions}
        onOpenChange={setOrgDialogOpen}
        onSave={saveOrgLink}
      />
      {sectionPrefs.map((section) => (section.visible ? renderedSections[section.id] : null))}
    </aside>
  );
}
