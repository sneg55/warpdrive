import type { ContactPoint } from "@/features/deals/AddDealPersonColumn";

export interface Option {
  id: string;
  name: string;
}

export interface EntityCreateState {
  personMode: "existing" | "new";
  personId: string;
  newPersonName: string;
  orgMode: "existing" | "new";
  orgId: string;
  newOrgName: string;
  title: string;
  value: string;
  labels: string[];
  expectedCloseDate: string;
  ownerId: string;
  sourceChannel: string;
  sourceChannelId: string;
  visibilityGroupId: string;
  phones: ContactPoint[];
  emails: ContactPoint[];
  personCustomFields: Record<string, unknown>;
  orgCustomFields: Record<string, unknown>;
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
    personCustomFields: {},
    orgCustomFields: {},
  };
}
