// Change-log `field` discriminants that the deal-history timeline special-cases.
// moveDeal/changeStage write stage transitions as `field: "stageId"` with stage-ID
// values in old/new; the read layer resolves those ids to names before rendering.
export const CHANGE_FIELD_STAGE_ID = "stageId";

// updateDeal writes these when the corresponding deal column changes (data-model
// deal-history parity). `status` is intentionally absent: won/lost/open transitions
// are logged by the won/lost flow, not here, to avoid double-logging.
export const CHANGE_FIELD_TITLE = "title";
export const CHANGE_FIELD_VALUE = "value";
export const CHANGE_FIELD_EXPECTED_CLOSE = "expected_close_date";

// Unit E (deal-history parity): mutations PD records that WD did not previously log.
// The primary person/organization link on the deal, deal participants, and followers.
export const CHANGE_FIELD_SOURCE_CHANNEL_ID = "source_channel_id";
export const CHANGE_FIELD_PERSON = "person_id";
export const CHANGE_FIELD_ORG = "org_id";
export const CHANGE_FIELD_PARTICIPANT = "participant";
export const CHANGE_FIELD_FOLLOWER = "follower";

// Custom-field edits log one row per changed key under this prefix (the raw def key is
// dynamic, so the render layer matches on the prefix rather than an enumerated field name).
export const CHANGE_FIELD_CUSTOM_PREFIX = "custom_field:";

// Build the change-log `field` for a custom-field edit from its def key.
export function customFieldChangeField(key: string): string {
  return `${CHANGE_FIELD_CUSTOM_PREFIX}${key}`;
}

// Human labels for the Unit E fields (render layer, no magic strings). Person/org and
// participant/follower use directional phrasing chosen from the add-vs-remove direction.
export const CHANGE_LABEL_CUSTOM_FIELD = "Custom field";
export const CHANGE_LABEL_PERSON_LINKED = "Linked a person";
export const CHANGE_LABEL_PERSON_UNLINKED = "Unlinked the person";
export const CHANGE_LABEL_PERSON_CHANGED = "Changed the linked person";
export const CHANGE_LABEL_ORG_LINKED = "Linked an organization";
export const CHANGE_LABEL_ORG_UNLINKED = "Unlinked the organization";
export const CHANGE_LABEL_ORG_CHANGED = "Changed the linked organization";
export const CHANGE_LABEL_PARTICIPANT_ADDED = "Added a participant";
export const CHANGE_LABEL_PARTICIPANT_REMOVED = "Removed a participant";
export const CHANGE_LABEL_FOLLOWER_ADDED = "Started following";
export const CHANGE_LABEL_FOLLOWER_REMOVED = "Stopped following";
