# Changelog

Notable changes to Warpdrive, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 2.14.2 - 2026-11-22

No user-facing changes.

## 2.14.1 - 2026-11-22

### Fixed

- **currency**: render every money surface in the configured base currency

## 2.14.0 - 2026-11-22

### Added

- **realtime**: read the browser WebSocket URL at runtime (OSS #29)
- **dev**: containerized dev mode with hot reload and Adminer (OSS #15)

### Fixed

- **settings**: actually apply the BASE_CURRENCY setting (OSS #24)

### Security

- upgrade the app to pnpm 12.21.0 (OSS #20)

## 2.13.2 - 2026-11-19

### Changed

- **search**: store plain text in generated columns and prefilter custom fields by trigram index

## 2.13.1 - 2026-11-19

No user-facing changes.

## 2.13.0 - 2026-11-19

### Added

- **search**: find records through notes, emails, Intercom and other attached content

## 2.12.0 - 2026-11-19

### Fixed

- **storage**: sign presigned URLs for the browser endpoint and dial a separate server endpoint (OSS #8)

### Security

- clear 148 advisories across the app, site and docs-site lockfiles

## 2.11.6 - 2026-11-18

### Fixed

- surface activity save and lead convert failures instead of failing silently

## 2.11.5 - 2026-11-18

### Fixed

- **site**: stamp stars and release at publish so a refused GitHub call cannot blank the build

## 2.11.4 - 2026-11-18

### Added

- **site**: give the landing page the app's look and fix its weak spots

## 2.11.3 - 2026-11-18

### Fixed

- **site**: fetch GitHub facts with no-store so cached builds stop freezing the star count

## 2.11.2 - 2026-11-18

No user-facing changes.

## 2.11.1 - 2026-11-18

### Added

- **site**: add five comparison pages, per-page FAQs, WebP screenshots, and real sitemap dates

## 2.11.0 - 2026-11-18

### Added

- **observability**: emit menu_item_selected from the shared dropdown menu wrapper

### Fixed

- **entity-create**: show every Save failure inside the add deal, lead, person and org modals

## 2.10.1 - 2026-11-18

### Fixed

- pending states and idempotent repeats for activities, leads, data fields, add modals and lead export
- **email**: give inbox refresh, reader archive and draft delete real feedback states
- **deals**: show archived state on the deal page and make repeat closes no-ops
- **clipboard**: report copy failures and reset the Copied label

## 2.10.0 - 2026-11-18

### Added

- **mcp**: browse and search any mailbox the actor can use

### Fixed

- **dates**: canonicalize every legacy tz link and fall back when Postgres lacks a zone

## 2.9.1 - 2026-11-18

### Fixed

- **history**: show names instead of raw ids in changelog rows
- **email**: send agentic mail with the mailbox display name

## 2.9.0 - 2026-11-17

### Added

- **email**: connect a Cloudflare agentic inbox as a team mailbox

## 2.8.2 - 2026-11-17

### Fixed

- **email**: stop a deactivated member from blocking team mailbox member saves

## 2.8.1 - 2026-11-17

### Fixed

- **dates**: map legacy browser time zone names before they reach Postgres

## 2.8.0 - 2026-11-16

### Added

- **x-dms**: read and reply in end-to-end encrypted X conversations

## 2.7.0 - 2026-11-16

### Added

- **email**: search contacts by name and email in To, Cc and Bcc

### Fixed

- **email**: keep a forward in the original thread

## 2.6.1 - 2026-11-16

### Fixed

- **x-dms**: read the whole conversation list, since X does not sort it by activity

## 2.6.0 - 2026-11-13

### Added

- **x-dms**: X DMs in the team inbox

### Fixed

- **email**: offer a reconnect for a disconnected team mailbox

## 2.5.1 - 2026-11-13

### Changed

- **intercom**: fetch more conversations in parallel and end each sync run inside its time limit

## 2.5.0 - 2026-11-12

### Added

- **intercom**: show Intercom support conversations in person, deal and lead history

## 2.4.0 - 2026-11-12

### Added

- **dates**: add range presets to the from/to date pickers
- **email**: show an inbox-zero state when the mail inbox is cleared

## 2.3.0 - 2026-11-11

### Added

- **dashboard**: open the activities and won-deals lists from the scoreboard tiles

### Changed

- **email**: index messages by thread and attachments by message

### Fixed

- **goals**: ask for the person or team when a goal has none picked
- **inline-edit**: keep a disabled Save readable in the light theme
- **stats**: count only the picked person's share of a goal
- **stats**: scope the dashboard goals to the person picked

## 2.2.0 - 2026-11-11

### Added

- **email**: prefill the linked contact when adding a deal from a thread

### Fixed

- **email**: show a working state while a row archive is in flight

## 2.1.1 - 2026-11-10

### Fixed

- **nav**: put the inbox unread count at the right end of the row

## 2.1.0 - 2026-11-10

### Added

- **email**: team mailboxes

## 2.0.0 - 2026-11-04

### Added

- **storage**: replace MinIO with Garage

## 1.4.1 - 2026-11-02

### Added

- **site**: make the landing site easier for AI answer engines to cite

## 1.4.0 - 2026-10-30

### Added

- **import**: import Pipedrive leads

## 1.3.0 - 2026-10-30

### Added

- **import**: migrate from Pipedrive through the CSV importer

## 1.2.1 - 2026-10-24

### Fixed

- **stats**: leave deals won before their creation date out of the sales cycle

## 1.2.0 - 2026-10-02

### Added

- **pipelines**: move a stage's deals to another stage when deleting it
- **deals**: filter the board and list by deal status
- **stats**: pick any person, team, or everyone in the Performance owner filter
- **notes**: let users reply to a note with comments
- **nav**: link to the docs site from the sidebar

### Fixed

- **deals**: share the persisted board view with the pipeline list and archive
- **deals**: keep the board filter across a browser back-navigation
- **deals**: merge the current deal into the picked one and land there
- **deals**: search the whole pipeline in the merge picker
- **email**: resolve merge fields in a timeline email reply
- **email**: report a rejected draft autosave instead of leaving it unhandled

## 1.1.0 - 2026-09-09

### Added

- **board**: add an "Add new pipeline" entry to the pipeline dropdown
- **settings**: show the MCP server URL and connect steps under Connected apps
- **mcp**: add an archive_lead tool
- **activities**: open the list on the current user's activities due today
- **filters**: next and last activity date conditions with relative periods
- **lists**: custom-field columns in the leads, people, organizations and deals lists
- **activities**: prompt to schedule a follow-up after marking an activity done
- **notes**: render URLs and emails in notes as clickable links
- **deals**: create a new person from the participants dialog
- **leads**: custom fields on leads
- **prospects**: add the GetProspect people-search adapter
- **prospects**: find people at an organization, select, then reveal
- **deals**: bulk archive from the list selection toolbar
- **pipelines**: drag-reorder stages in the pipeline editor
- **identity**: assign a permission set from the users admin page
- **leads**: carry a converted lead's history onto the deal
- **ui**: interactive label selectors on lead, person, and org record surfaces
- **ui**: unify interactions and record detail surfaces
- **docs**: capture the 7 interaction screenshots and link Docs from the marketing nav
- **docs**: capture documentation screenshots from a clean seeded database
- **docs**: add Docusaurus documentation site for docs.warpdrivecrm.com
- **ws**: per-channel seq + channel-tagged event frames
- **site**: SEO/GEO optimization for the marketing landing page

### Changed

- **nav**: instant navigation - cache retention, optimistic drawer previews, prod measurement
- **realtime**: multiplex all channels over one shared tab socket
- **deal-workspace**: drop redundant board memos; trim workspace payload
- **inbox**: prefetch the thread server-side to seed the reader
- **client**: version localStorage keys; narrow PhaseWait effect dep
- **bundle**: code-split react-day-picker out of DatePicker
- **cache**: cache near-static defs + base currency per Db
- **context**: carry actor name+avatar, drop the per-page re-read
- **labels**: build label index once, not per row
- **lists**: bound large list render cost
- **db**: parallelize independent server-side reads

### Fixed

- **filters**: disable Save in the filter dialog while the save is in flight
- **mcp**: serve tools/list again by making the custom-field sort key JSON-Schema representable
- **email**: a template applied to a reply keeps the Re: subject
- **activities**: label deal, lead and calendar activity cards with the assignee, not the creator
- **activities**: label edit-composer link rows from the activity's own links
- **deals**: count the deal's contact as a participant, and let the sidebar switch them
- **activities**: follow-up prompt reuses the full activity composer
- **notes**: apply the markdown link boundary only inside an actual [label](target)
- **sidebar**: title record custom fields Details when there is no organization
- **prospects**: make a prospect apply say it worked, and stop it re-running a paid search
- **prospects**: Apollo people search moved to api_search, and reveal now uses the profile id
- **prospects**: keep reveal bookkeeping on the transaction's own connection
- **email**: thread replies, target the counterparty, and resolve merge fields in the composer
- **activities**: refresh the activities list when an activity is completed elsewhere
- **pipelines**: adopt partially applied stage ops so a retry does not duplicate them
- **deals**: retarget inline-edit optimistic patch to the live deal-list cache
- **deals**: parse bulkStageAction input at the boundary
- **email**: commit a typed recipient on blur so Send stops being dead
- **leads**: dismiss the lead drawer after delete; keep the deal Person panel visible
- **leads**: convert past a dead contact link and a stale default pipeline
- **email**: make the spam sweep runnable in the production image
- keep Gmail spam out of the Inbox, and unblock lead convert
- **ui**: make links look like links in the editor and in activity notes
- **email**: make toolbar links insertable and stop silent blank-name saves
- **labels**: make the catalog the real source of truth for applied labels
- **notifications**: stop deep links pointing at records that do not exist
- **ui**: replace the last two window.confirm calls with a shadcn dialog
- **oauth**: let the consent grant leave the origin past form-action
- entity-qualified import map labels, and dark: bound to the .dark class
- **security**: address codex review of the hardening branch
- **security**: harden the externally facing surface
- **settings**: serialize interface preference writes
- **settings**: address design system review
- **ui**: stop create-modal comboboxes opening their menu on mount
- **ui**: stop a nested Select from closing the modal it sits in
- **settings**: constrain the permission-set and visibility-group create forms
- **settings**: tidy the broken-looking Teams create-team form

## 1.0.0 - 2026-07-18

Initial public release.

