import type { ComposerContext } from "@/features/email/composer/composer.types";
import type { EntityType } from "@/types/entityRef";

// Entity scope for the shared composer. Wave 1 mounted it on the deal only;
// Wave 2 mounts the same component on lead/person/org by passing a different
// scope. The helpers below derive each tab's entity mapping and enabled state
// from the scope, so SharedComposeBar never hardcodes "deal".
export interface ComposeScope {
  entityType: "deal" | "lead" | "person" | "org";
  entityId: string;
  personId?: string;
  orgId?: string;
  personName?: string;
  personEmail?: string;
  // Deal-scope display values threaded into the email composer's "Insert field"
  // menu (see dealComposerContext). Populated by the deal workspace; other scopes
  // omit them (the email tab is deal-only).
  orgName?: string;
  dealTitle?: string;
  dealValue?: string;
  // Every deal participant's email, prefilled into the email composer's To field when the
  // "prefill all participants" preference is on (deal scope only).
  participantEmails?: string[];
}

// Split a full display name into first/last for the Insert-field menu: the first
// whitespace-separated token is the first name, the remainder (if any) the last.
function splitPersonName(name: string | undefined): { first?: string; last?: string } {
  const parts = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  if (parts.length === 0) return {};
  const [first, ...rest] = parts;
  return { first, last: rest.length > 0 ? rest.join(" ") : undefined };
}

// Build the deal-scoped email ComposerContext, threading the deal/person/org
// display values so the composer's "Insert field" menu has data. insertFields()
// drops undefined values, so omitting these (the previous behavior) left the menu
// empty and therefore hidden (BUG EMAIL-21).
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

// Notes are keyed by the collaboration EntityType (ENTITY_TYPES: deal/person/
// organization/lead), which spells "org" as "organization". Every ComposeScope
// entity type now has a notes home, so this never returns null.
export function noteEntityType(scope: ComposeScope): EntityType {
  return scope.entityType === "org" ? "organization" : scope.entityType;
}

// Files are keyed by FileEntityType, which has no "lead" member: lead has no
// file entity yet, so this returns null for a lead scope.
export function fileEntityType(scope: ComposeScope): "deal" | "person" | "organization" | null {
  if (scope.entityType === "lead") return null;
  return scope.entityType === "org" ? "organization" : scope.entityType;
}

// The Files tab is hidden for lead scope (no file entity to attach to yet).
export function fileTabEnabled(scope: ComposeScope): boolean {
  return scope.entityType !== "lead";
}

// The Email tab assumes a deal underneath (Composer's context.kind only
// supports "deal" | "inbox"), so it is only enabled for deal scope.
export function emailTabEnabled(scope: ComposeScope): boolean {
  return scope.entityType === "deal";
}

// ActivityComposerInline anchors an activity to at most one primary parent
// (deal XOR lead), plus optional person/org participants context. This maps
// a ComposeScope to that anchor shape regardless of which entity is in scope.
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
