// Stable error-ID registry. Append-only: one ID per distinct cause; retired IDs
// stay searchable (commented) and are never reused or renumbered.
export const ERROR_IDS = {
  // AUTH
  AUTH_LOGIN_REJECTED: "E_AUTH_001", // domain / email_verified / signature check failed
  AUTH_STATE_MISMATCH: "E_AUTH_002", // OAuth state/nonce/PKCE mismatch
  AUTH_SESSION_DEAD: "E_AUTH_003", // session revoked or expired
  AUTH_BOOTSTRAP_NO_SEED: "E_AUTH_004", // first-run with no SEED_ADMIN_EMAIL in prod
  AUTH_EMAIL_TAKEN: "E_AUTH_005", // inviteUser: email already belongs to an existing/placeholder user
  AUTH_INVITE_INPUT_INVALID: "E_AUTH_006", // inviteUserAction input failed Zod validation
  // PERM
  PERM_DENIED: "E_PERM_001", // channel subscribe / action denied: not visible
  PERM_SELF_ESCALATION: "E_PERM_002", // non-admin tried to escalate via permission system
  PERM_GROUP_REQUIRED: "E_PERM_003", // group-level create with no resolvable group
  PERM_SIGNATURE_DENIED: "E_PERM_004", // signature not found or not owned by actor
  PERM_TEMPLATE_DENIED: "E_PERM_005", // template not found or not accessible (not owned, not shared)
  // WS
  WS_TICKET_INVALID: "E_WS_001", // upgrade rejected: invalid/expired/replayed ticket
  WS_PAYLOAD_INVALID: "E_WS_002", // NOTIFY payload failed Zod, dropped
  // DB
  DB_INVARIANT: "E_DB_001", // a DB invariant we believed impossible was violated
  DB_INSERT_FAILED: "E_DB_002", // insert returned no rows (should never happen)
  // DEAL
  DEAL_NOT_FOUND: "E_DEAL_001", // deal not found or not visible (404-on-invisible)
  DEAL_PRECONDITION: "E_DEAL_002", // optimistic precondition failed (stale compare-and-swap on move)
  DEAL_STAGE_MISMATCH: "E_DEAL_003", // stage does not belong to that pipeline
  DEAL_LOST_REASON_REQUIRED: "E_DEAL_004", // RETIRED 2026-07-04: a lost reason is required to mark a deal lost
  DEAL_LOST_REASON_INVALID: "E_DEAL_005", // lost_reason_id does not exist or is archived
  DEAL_ARCHIVED_NO_ACTIVITY: "E_DEAL_006", // cannot link a new activity to an archived deal
  DEAL_SAVED_FILTER_NOT_FOUND: "E_DEAL_007", // saved filter not found or not owned by the actor (delete guard)
  DEAL_FILTER_INVALID: "E_DEAL_008", // saved-filter input failed Zod validation (bad field/op pairing or value)
  DEAL_LOST_INPUT_INVALID: "E_DEAL_009", // markLost action input failed Zod validation
  DEAL_MERGE_SAME: "E_DEAL_010", // mergeDeals: source and target are the same deal
  DEAL_DUPLICATE_INPUT_INVALID: "E_DEAL_011", // duplicateDeal action input failed Zod validation
  DEAL_CONVERT_INPUT_INVALID: "E_DEAL_012", // convertDealToLead action input failed Zod validation
  DEAL_MERGE_INPUT_INVALID: "E_DEAL_013", // mergeDeals action input failed Zod validation
  // LEAD
  LEAD_NOT_FOUND: "E_LEAD_001", // lead not found or not visible (404-on-invisible)
  LEAD_ARCHIVE_FORBIDDEN: "E_LEAD_002", // archive denied: lead not visible/owned by actor
  LEAD_ALREADY_CONVERTED: "E_LEAD_003", // convert called on a lead with a non-null converted_deal_id
  LEAD_CONVERT_NO_PIPELINE: "E_LEAD_004", // convert: no target pipeline resolvable (none passed, no default)
  LEAD_BULK_CONVERT_INPUT_INVALID: "E_LEAD_005", // bulkConvertLeadsAction input failed Zod validation
  LEAD_UPDATE_INPUT_INVALID: "E_LEAD_006", // updateLeadAction input failed Zod validation
  LEAD_PRECONDITION: "E_LEAD_007", // optimistic precondition failed (stale compare-and-swap on updateLead)
  LEAD_FILTER_INVALID: "E_LEAD_008", // leads list filter compiled with a field/op outside the allow-list
  // PIPELINE
  PIPELINE_NOT_FOUND: "E_PIPELINE_001", // pipeline not found or restricted (404-on-invisible)
  // STAGE
  STAGE_NOT_FOUND: "E_STAGE_001", // stage not found (delete/update targeted a missing stage)
  STAGE_HAS_DEALS: "E_STAGE_002", // refuse to delete a stage that still holds deals (move them first)
  STAGE_LAST_ONE: "E_STAGE_003", // refuse to delete the pipeline's final stage (a pipeline needs one)
  // CF
  CF_KEY_EXISTS: "E_CF_001", // custom-field key already exists for target
  CF_DEF_NOT_FOUND: "E_CF_002", // custom-field def not found
  CF_VALUE_INVALID: "E_CF_003", // custom-field value validation failed
  CF_INPUT_INVALID: "E_CF_004", // custom-field create/archive input failed Zod validation
  CF_BUILTIN_LOCKED: "E_CF_005", // attempted to hide a locked (identity) built-in field
  CF_BUILTIN_UNKNOWN: "E_CF_006", // attempted to hide an unknown built-in field key
  // CONTACT
  CONTACT_NOT_FOUND: "E_CONTACT_001", // person/org not found OR not visible (404-shaped)
  CONTACT_ADDRESS_INVALID: "E_CONTACT_002", // structured address failed validation
  CONTACT_MERGE_FORBIDDEN: "E_CONTACT_003", // merge denied: lacks contact.merge on a visible record
  CONTACT_MERGE_SAME: "E_CONTACT_004", // merge survivor and merged are the same id
  CONTACT_RELATION_SELF: "E_CONTACT_005", // addOrgRelation: source and target are the same org
  CONTACT_RELATION_INPUT_INVALID: "E_CONTACT_006", // add/removeOrgRelationAction input failed Zod validation
  CONTACT_FOLLOW_INPUT_INVALID: "E_CONTACT_007", // follow/unfollowContactAction input failed Zod validation
  CONTACT_FILTER_INVALID: "E_CONTACT_009", // contacts list filter compiled with a field/op outside the allow-list
  CONTACT_UPDATE_INPUT_INVALID: "E_CONTACT_008", // updatePersonAction/updateOrgAction input failed Zod validation
  // NOTE
  NOTE_NOT_FOUND: "E_NOTE_001", // note not found or soft-deleted
  // IMPORT
  IMPORT_ROW_GONE: "E_IMPORT_001", // import row vanished before commit could claim it
  IMPORT_BATCH_NOT_FOUND: "E_IMPORT_002", // import batch not found or not owned (404-on-invisible)
  IMPORT_MAPPING_MISSING: "E_IMPORT_003", // validate/commit before a column mapping was set
  IMPORT_UPLOAD_INCOMPLETE: "E_IMPORT_004", // confirm before the object landed, or it exceeds the cap
  IMPORT_PARSE_FAILED: "E_IMPORT_005", // prepare job could not read/parse the uploaded CSV
  IMPORT_NOT_UNDOABLE: "E_IMPORT_006", // undo requested on a batch not in completed/partial
  IMPORT_BAD_STATE: "E_IMPORT_007", // mapping/commit requested on a batch in an illegal status
  IMPORT_MAPPING_ENTITY_INVALID: "E_IMPORT_008", // mapped column targets an entity this import cannot write
  // USER (reference)
  USER_NOT_FOUND: "E_USER_001", // referenced user not found or inactive
  USER_PROFILE_INVALID: "E_USER_002", // profile update input failed Zod validation
  USER_AVATAR_INVALID: "E_USER_003", // avatar upload input/object metadata failed validation
  // ACTIVITY
  ACTIVITY_NOT_FOUND: "E_ACTIVITY_001", // activity not found or not visible (404-on-invisible)
  ACTIVITY_FORBIDDEN: "E_ACTIVITY_002", // visible but action flag missing (403-shape)
  ACTIVITY_TYPE_IN_USE: "E_ACTIVITY_003", // delete blocked: activity type is a system row or still referenced by an activity
  ACTIVITY_TYPE_KEY_EXISTS: "E_ACTIVITY_004", // create blocked: an activity type with that key already exists
  ACTIVITY_UPDATE_INPUT_INVALID: "E_ACTIVITY_005", // edit action input failed Zod validation
  ACTIVITY_TYPE_INVALID: "E_ACTIVITY_006", // patched typeId is missing or archived (activity WAS found)
  ACTIVITY_END_BEFORE_START: "E_ACTIVITY_007", // multi-day endAt is earlier than the start (dueAt)
  // LABEL
  LABEL_NOT_FOUND: "E_LABEL_001", // label not found (rename/recolor/delete targeted a missing label)
  LABEL_IN_USE: "E_LABEL_002", // delete blocked: label still applied to one or more records
  // LOST_REASON
  LOST_REASON_NOT_FOUND: "E_LOSTREASON_001", // lost reason not found (rename/archive targeted a missing row)
  // GMAIL
  GMAIL_API_EXHAUSTED: "E_GMAIL_001", // Gmail API call failed after retries (transient exhausted)
  GMAIL_GRANT_REVOKED: "E_GMAIL_002", // OAuth grant revoked/expired (invalid_grant): account disconnected
  GMAIL_SEND_REJECTED: "E_GMAIL_003", // Send rejected pre-acceptance (4xx validation): safe to retry
  GMAIL_RECONCILE_EXHAUSTED: "E_GMAIL_004", // Reconcile window exhausted, send moved to needs_review
  GMAIL_TOKEN_DECRYPT_FAILED: "E_GMAIL_005", // token decrypt/auth-tag failure (server-side key/data problem, NOT a grant revocation)
  GMAIL_ADDRESS_TAKEN: "E_GMAIL_006", // Gmail address already bound to another user (email_address unique violation)
  GMAIL_RECONCILE_PENDING: "E_GMAIL_007", // reconcile within window: not found yet, retry later (control-flow, not an API failure)
  GMAIL_CLAIM_CONTENDED: "E_GMAIL_008", // outbox claim/stamp race lost to another worker (control-flow, not an API failure)
  GMAIL_SEND_INPUT_INVALID: "E_GMAIL_009", // interactive send input failed Zod validation (bad request)
  GMAIL_AUTHORING_INPUT_INVALID: "E_GMAIL_010", // template/signature input failed Zod validation (bad request)
  GMAIL_THREAD_NOT_FOUND: "E_GMAIL_011", // email thread not found OR not visible to actor (404-on-invisible, mailbox privacy)
  GMAIL_ATTACHMENT_DENIED: "E_GMAIL_012", // attachment file not found or not readable by the actor (authz failure)
  GMAIL_DISCONNECT_INPUT_INVALID: "E_GMAIL_013", // disconnect mailbox action input failed Zod validation (bad request)
  GMAIL_DRAFT_NOT_FOUND: "E_GMAIL_014", // draft not found or not owned by actor (resume/delete guard)
  GMAIL_DRAFT_INPUT_INVALID: "E_GMAIL_015", // save-draft input failed Zod validation (bad request)
  GMAIL_OUTBOX_NOT_FOUND: "E_GMAIL_016", // outbox send-attempt not found or not owned by actor
  GMAIL_OUTBOX_NOT_CANCELABLE: "E_GMAIL_017", // attempt is claimed or already sent: cannot cancel
  GMAIL_FOLDER_INPUT_INVALID: "E_GMAIL_018", // archive/unarchive/cancel input failed Zod validation
  GMAIL_READ_INPUT_INVALID: "E_GMAIL_019", // mark-read/unread action input failed Zod validation
  GMAIL_ATTACHMENT_INPUT_INVALID: "E_GMAIL_020", // download route attachmentId param failed Zod (bad request, not a visibility denial)
  GMAIL_ATTR_INPUT_INVALID: "E_GMAIL_021", // follow-up status / labels action input failed Zod validation
  GMAIL_VISIBILITY_INPUT_INVALID: "E_GMAIL_022", // set-thread-visibility action input failed Zod validation
  GMAIL_TRASH_INPUT_INVALID: "E_GMAIL_023", // trash-thread action input failed Zod validation
  GMAIL_MAIL_LABEL_INPUT_INVALID: "E_GMAIL_024", // create-mail-label action input failed Zod validation (U6)
  GMAIL_MAIL_LABEL_UNKNOWN: "E_GMAIL_025", // thread-labels write referenced a key absent from the mail_labels catalog (integrity: would persist an invisible, unremovable label)
  // SYNC
  SYNC_CURSOR_EXPIRED: "E_SYNC_001", // History cursor expired (404): gap-recovery resync triggered
  // JOBS
  JOBS_BOSS_MISSING: "E_JOBS_001", // producer ran in production with no pg-boss booted: jobs would be dropped
  // FILE
  FILE_PRESIGN_INVALID: "E_FILE_001", // Presign/confirm input validation failed
  FILE_METADATA_MISMATCH: "E_FILE_002", // Object metadata mismatch on confirm (size/content-type)
  // NOTIF
  NOTIF_UNKNOWN_TYPE: "E_NOTIF_001", // unknown/unsupported notification type
  NOTIF_TARGET_NOT_FOUND: "E_NOTIF_002", // mention/notification target user not found
  NOTIF_PRODUCE_FAILED: "E_NOTIF_003", // createNotification failed unexpectedly (DB/internal)
  // SEARCH
  SEARCH_EMPTY_QUERY: "E_SEARCH_001", // empty/blank search query
  // STATS
  STATS_PIPELINE_NOT_VISIBLE: "E_STATS_001", // requested pipeline not visible to user (restricted or archived)
  STATS_NO_PIPELINE: "E_STATS_002", // RETIRED (STATS-08): null pipelineId now aggregates "All pipelines" instead of erroring. Do not reuse E_STATS_002.
} as const;

export type ErrorId = (typeof ERROR_IDS)[keyof typeof ERROR_IDS];

// The ONLY error thrown in app code. Operational failures are Result values, not throws.
export class AppError extends Error {
  readonly id: ErrorId;
  readonly context?: Record<string, unknown>;

  constructor(id: ErrorId, message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.id = id;
    this.context = context;
  }
}
