import type { ContactPoint } from "@/features/deals/AddDealPersonColumn";

export interface Option {
  id: string;
  name: string;
}

// Fields shared by the Add deal and Add lead dialogs. Deals extend this with pipeline/stage; leads
// use it as-is. One shape so a new create field is added once and both dialogs stay in step.
export interface EntityCreateState {
  personMode: "existing" | "new";
  personId: string; // selected existing person (personMode === "existing")
  newPersonName: string; // name for a person created inline (personMode === "new")
  orgMode: "existing" | "new";
  orgId: string; // selected existing org (orgMode === "existing")
  newOrgName: string; // name for an org created inline (orgMode === "new")
  title: string;
  value: string;
  labels: string[]; // DEAL_LABELS keys (multi-select)
  expectedCloseDate: string; // yyyy-mm-dd or ""
  ownerId: string; // "" = self
  sourceChannel: string;
  sourceChannelId: string;
  visibilityGroupId: string; // "" = server default
  phones: ContactPoint[];
  emails: ContactPoint[];
}

export function initialEntityCreateState(): EntityCreateState {
  return {
    personMode: "existing",
    personId: "",
    newPersonName: "",
    orgMode: "existing",
    orgId: "",
    newOrgName: "",
    title: "",
    value: "",
    labels: [],
    expectedCloseDate: "",
    ownerId: "",
    sourceChannel: "",
    sourceChannelId: "",
    visibilityGroupId: "",
    phones: [{ label: "Work", value: "" }],
    emails: [{ label: "Work", value: "" }],
  };
}
