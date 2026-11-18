# Changelog.

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

### Changed

### Deprecated

### Removed

### Fixed

### Security

## [2.9.0] - 2026-11-17

**Code lines:** 250,343 total, +5,531 vs v2.8.2.

### Added

- Agentic Inbox as a second mail provider alongside Gmail: team mailboxes can be backed by an Agentic Inbox instance (base URL plus encrypted credentials, with connect and reconnect dialogs), including sync, history backfill, folder handling (drafts, spam, and trash stay unimported), idempotent sends, and reply threading. Gated behind `AGENTIC_INBOX_ENABLED`; migration `0083` adds the provider columns, and Agentic accounts are constrained to team mailboxes.
- `list_mailboxes` MCP tool and mailbox selection for email drafts, so an actor can target their personal mailbox or a team mailbox.

### Changed

- Email sending refactored onto a shared `MailProvider` interface implemented by Gmail and Agentic Inbox; the outbox gained a `waiting_for_limit` status with `next_attempt_at` so rate-limited sends retry on schedule instead of failing.

## [2.8.2] - 2026-11-17

**Code lines:** 244,812 total, -930 vs v2.8.1.

### Changed

- Removed dead code across features: the legacy `ActivityList` and `groupActivities`, the hand-rolled markdown renderer, `StageChevrons`, `boardFilterFields`, and the unused `resolveLabelKey` helper.

### Fixed

- A deactivated team mailbox member no longer blocks saving the member list shown on the settings page.
- Email sync re-enqueue now counts only the ticks queued for the requested mailbox.

## [2.8.1] - 2026-11-17

**Code lines:** 245,742 total, +43 vs v2.8.0.

### Fixed

- Legacy browser time zone names (e.g. `Asia/Calcutta`, `Europe/Kiev`, `America/Buenos_Aires`) are mapped to their primary zones, so local-day stats queries no longer fail on Postgres builds without `tzdata-legacy`.

## [2.8.0] - 2026-11-16

**Code lines:** 245,699 total, +6,578 vs v2.7.0.

### Added

- End-to-end encrypted X (Twitter) DM conversations: chat key decision and management backed by the juicebox SDK, with realtime key updates and safety checks on conversation keys.
- X DM conversation history backfill with resumable markers, pacing, and failure gates.

## [2.7.0] - 2026-11-16

**Code lines:** 239,121 total, +310 vs v2.6.1.

### Added

- Contact recipient search for the email composer: matches contacts by name and by any of their email addresses (primary plus additional), respecting record visibility.

### Changed

- Reworked the composer recipient field and reader actions, with test coverage for prefill, reply templates, signatures, attachments, scheduling, and send-failure handling.

## [2.6.1] - 2026-11-16

**Code lines:** 238,811 total, +48 vs v2.6.0.

### Changed

- CI checks (lint, typecheck, unit tests) now run as a parallel matrix that reports every failure instead of stopping at the first, and the gate is skipped on tags.

### Fixed

- X DM sync iterates changed conversations in API order instead of reversed, so events are no longer missed.

## [2.6.0] - 2026-11-13

**Code lines:** 238,763 total, +7,760 vs v2.5.1.

### Added

- X (Twitter) direct messages integration: OAuth connect flow, account administration, event parsing and apply, incremental sync job, and inbox pages under `/inbox/x` with realtime updates.
- Env vars `X_CLIENT_ID` and `X_CLIENT_SECRET` for the X app credentials.
- Team mailbox consent redirect and reconnect handling in the email inbox.

## [2.5.1] - 2026-11-13

**Code lines:** 231,003 total, +31 vs v2.5.0.

### Fixed

- Intercom sync now stops within a wall-clock page budget per run, so a stalled sync releases its slot and continuation resumes cleanly on the next run.

### Changed

- Documentation refresh across the docs site.

## [2.5.0] - 2026-11-12

**Code lines:** 230,972 total, +3,551 vs v2.4.0.

### Added

- Intercom support integration: background sync job with continuation, contact matching and refresh, conversation cards on the contact timeline and deal workspace history, and admin settings behind `INTERCOM_ACCESS_TOKEN` / `INTERCOM_REGION`.

## [2.4.0] - 2026-11-12

**Code lines:** 227,421 total, +557 vs v2.3.0.

### Added

- Range preset rail with a date picker presets UI, shared by the dashboard, activities filters, and inbox.
- Inbox zero state with illustration and copy.

### Changed

- Goal form and dashboard updates to use the shared range presets.

## [2.3.0] - 2026-11-11

**Code lines:** 226,864 total, +2,385 vs v2.2.0.

### Added

- Dashboard drill-downs: completed-activities and won-deal tiles link to filtered activities and pipeline list views with owner and date scope preserved.
- Viewer time zone support: dashboard and stats windows use each user's local day boundaries via a `localDayRange` helper and a time zone input schema.
- Activity scope chips and filter predicates on the activities list.
- Email lookup indexes (migration `0078`) for faster thread and message queries.

### Changed

- Node.js 24 is now required (`.nvmrc`, Docker base image, and `engines` in `package.json`); workers are built via a dedicated build script.

## [2.2.0] - 2026-11-11

**Code lines:** 224,479 total, +187 vs v2.1.1.

### Added

- `EntityCombobox` accepts an `initialValue`, so deal and email forms can reopen with an existing org or contact preselected instead of blank.
- Inbox thread rows show per-row busy state (with spinner and `aria-busy`) while archiving or unarchiving.

### Fixed

- Archive actions now await the follow-up refresh, keeping the busy indicator accurate until the list settles.

## [2.1.1] - 2026-11-10

**Code lines:** 224,292 total, +43 vs v2.1.0.

### Fixed

- Inbox unread badge placement in the left nav: pinned to the icon corner when collapsed, aligned to the right end of the row (after the label) when expanded.

## [2.1.0] - 2026-11-10

**Code lines:** 224,249 total, +3,779 vs v2.0.0.

### Added

- Team mailboxes: shared Gmail mailboxes with admin settings, member access control, backfill jobs, reply chips, and visibility rules for threads and the outbox.
- Gmail OAuth via a dedicated intent flow, per-account tracking tables, and unread count badge in the left nav.
- Thread selection controls and merge-context procedure for the shared inbox.

### Changed

- Email sending moved through a durable outbox with enqueue, reconciliation, rejection, and replay handling; presence payloads updated for the mailbox-aware inbox.

## [2.0.0] - 2026-11-04

**Code lines:** 220,470 total, +163 vs v1.4.1.

### Changed

- **Breaking:** object storage switched from MinIO to Garage (S3-compatible, single-node layout in compose). Env vars renamed from `MINIO_ENDPOINT`/`MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`/`MINIO_BUCKET` to `S3_*`, with legacy names still honored, plus optional `S3_REGION` and a required `GARAGE_RPC_SECRET` in compose.
- Dev and production compose files covered by a shared test suite (Caddyfile and Dockerfile included) so the storage topology is regression-tested.

## [1.4.1] - 2026-11-02

**Code lines:** 220,307 total, +1,264 vs v1.4.0.

### Added

- Marketing site: competitor comparison pages under `/vs/[competitor]`, a migrate-from-Pipedrive landing page, an `llms.txt` route (generated from the docs site), landing FAQ, and richer structured data and sitemap coverage.

## [1.4.0] - 2026-10-30

**Code lines:** 219,043 total, +581 vs v1.3.0.

### Added

- Pipedrive import of leads with undo support and imported-history tracking, plus owner assignment for imported leads and stronger column suggestions and field mapping for Pipedrive CSVs.

## [1.3.0] - 2026-10-30

**Code lines:** 218,462 total, +6,010 vs v1.2.1.

### Added

- Import sources: batches record their source (`csv` or `pipedrive`), external IDs are stored in a new `import_external_ids` table for idempotent re-imports and reliable undo, and rows carry per-row warnings surfaced in the import UI.
- Pipedrive migration guide in the docs.
- Visibility hardening: hidden-record notices, created-deal visibility rules, and soft-delete aware merges for contacts and deals.
- Deal status transitions and imported-history for deals.

## [1.2.1] - 2026-10-24

**Code lines:** 212,452 total, +36 vs v1.2.0.

### Fixed

- Sales-cycle averages and medians on the won-deals stats exclude deals won before their creation date (e.g. records imported after the fact), which previously skewed cycle times negative.

## [1.2.0] - 2026-10-02

**Code lines:** 212,416 total, +4,005 vs v1.1.0.

### Added

- Comments with @mentions on deals, contacts, organizations, and activities (not leads), rendered as cards in the deal workspace history.
- Pipeline stage management: stage deletion with deal-count warnings and a confirmation dialog.
- Stats owner scope (me vs. all owners) with a selector on the dashboard.
- Deal status badges and remembered board view state.

## [1.1.0] - 2026-09-09

**Code lines:** 208,411 total, +73,814 vs v1.0.0.

### Added

- Contact enrichment: Enrich button and dialog with partial apply, promote-to-primary handling, person name parsing, and prospect reveals.
- Goals: goal periods, math, progress, and labels.
- MCP server for programmatic access, documented in the docs site.
- Keyboard shortcuts, theme support, and observability infrastructure.
- Docs site (Docusaurus) with setup, administration, architecture, contributing, and per-feature guides.

### Changed

- Deployment hardened: Caddy reverse proxy with automatic HTTPS, tested Dockerfile and compose files, a deploy workflow guard, and session tokens stored as hashes.
- Lead custom fields, email label join backfill, and org search index rebuild (migrations `0058` to `0074`).

## [1.0.0] - 2026-07-18

**Code lines:** 134,597 total (initial release baseline).

### Added

- Initial release: pipeline kanban board with drag-and-drop stages and saved filters, deal workspace with a unified timeline, contacts and organizations with custom fields, leads inbox, two-way Gmail sync, activities, files, user and permission management, notifications, realtime presence over WebSockets, and basic stats.
