export const CHANGE_FIELD_STAGE_ID = "stageId";

export const CHANGE_FIELD_STATUS = "status";

export const CHANGE_FIELD_OWNER_ID = "ownerId";
export const CHANGE_FIELD_MERGED_DEAL = "mergedDealId";
export const CHANGE_FIELD_DUPLICATED_FROM_DEAL = "duplicatedFromDealId";
export const CHANGE_FIELD_CONVERTED_TO_LEAD = "convertedToLeadId";
export const CHANGE_FIELD_CREATED_FROM_DEAL = "createdFromDealId";
export const CHANGE_FIELD_CONVERTED_DEAL = "convertedDealId";
export const CHANGE_FIELD_MERGE = "__merge__";

export const REMOVED_USER_LABEL = "(removed user)";
export const UNAVAILABLE_RECORD_LABEL = "(not available)";

export const CHANGE_LABEL_OWNER = "Owner";
export const CHANGE_LABEL_MERGED_WITH = "Merged with";
export const CHANGE_LABEL_MERGED_DEAL = "Merged deal";
export const CHANGE_LABEL_DUPLICATED_FROM_DEAL = "Duplicated from deal";
export const CHANGE_LABEL_CONVERTED_TO_LEAD = "Converted to lead";
export const CHANGE_LABEL_CREATED_FROM_DEAL = "Created from deal";
export const CHANGE_LABEL_CONVERTED_DEAL = "Converted to deal";

export const CHANGE_FIELD_TITLE = "title";
export const CHANGE_FIELD_VALUE = "value";
export const CHANGE_FIELD_EXPECTED_CLOSE = "expected_close_date";

export const CHANGE_FIELD_SOURCE_CHANNEL_ID = "source_channel_id";
export const CHANGE_FIELD_PERSON = "person_id";
export const CHANGE_FIELD_ORG = "org_id";
export const CHANGE_FIELD_PARTICIPANT = "participant";
export const CHANGE_FIELD_FOLLOWER = "follower";

export const CHANGE_FIELD_CUSTOM_PREFIX = "custom_field:";

export function customFieldChangeField(key: string): string {
  return `${CHANGE_FIELD_CUSTOM_PREFIX}${key}`;
}

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
