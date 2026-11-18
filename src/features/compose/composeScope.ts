import type { ComposerContext } from "@/features/email/composer/composer.types";
import type { EntityType } from "@/types/entityRef";

export interface ComposeScope {
  entityType: "deal" | "lead" | "person" | "org";
  entityId: string;
  personId?: string;
  orgId?: string;
  personName?: string;
  personEmail?: string;
  orgName?: string;
  dealTitle?: string;
  dealValue?: string;
  participantEmails?: string[];
}

function splitPersonName(name: string | undefined): { first?: string; last?: string } {
  const parts = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  if (parts.length === 0) return {};
  const [first, ...rest] = parts;
  return { first, last: rest.length > 0 ? rest.join(" ") : undefined };
}

export function dealComposerContext(scope: ComposeScope): ComposerContext {
  const { first, last } = splitPersonName(scope.personName);
  return {
    kind: "deal",
    dealId: scope.entityId,
    defaultTo: scope.personEmail,
    participantEmails: scope.participantEmails,
    personId: scope.personId,
    orgId: scope.orgId,
    dealTitle: scope.dealTitle,
    dealValue: scope.dealValue,
    personFirstName: first,
    personLastName: last,
    personEmail: scope.personEmail,
    orgName: scope.orgName,
  };
}

export function noteEntityType(scope: ComposeScope): EntityType {
  return scope.entityType === "org" ? "organization" : scope.entityType;
}

export function fileEntityType(scope: ComposeScope): "deal" | "person" | "organization" | null {
  if (scope.entityType === "lead") return null;
  return scope.entityType === "org" ? "organization" : scope.entityType;
}

export function fileTabEnabled(scope: ComposeScope): boolean {
  return scope.entityType !== "lead";
}

export function emailTabEnabled(scope: ComposeScope): boolean {
  return scope.entityType === "deal";
}

export function activityAnchor(scope: ComposeScope): {
  dealId: string | null;
  leadId: string | null;
  personId: string | null;
  orgId: string | null;
} {
  const dealId = scope.entityType === "deal" ? scope.entityId : null;
  const leadId = scope.entityType === "lead" ? scope.entityId : null;
  const personId = scope.entityType === "person" ? scope.entityId : (scope.personId ?? null);
  const orgId = scope.entityType === "org" ? scope.entityId : (scope.orgId ?? null);
  return { dealId, leadId, personId, orgId };
}
