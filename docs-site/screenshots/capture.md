# Capturing docs screenshots

All screenshots under `docs-site/static/img/screenshots/<feature>/` are captured from a
**locally seeded demo instance**, never from production.

## Why local, not production

The production deployment holds real business-development customer data. PingCRM's
docs solve this by capturing production and blurring PII with a CSS redaction layer,
but blur is one missed selector away from publishing a real customer's name to a
public site, permanently.

Seeding synthetic data removes the risk class instead of mitigating it. There is no
redaction step here because there is nothing to redact.

Design: `docs/superpowers/specs/2026-07-19-docs-site-docusaurus-design.md`.

## Setup

:::danger
**Do not capture against your everyday development database.** `db:seed:demo` only
wipes rows it owns; every other account survives. A long-lived dev database
accumulates real data from manual testing, and the first capture pass against one put
a real personal Gmail address into `/settings/users` twice. Those screenshots would
have shipped to a public site.

Always capture against a database created fresh for the purpose.
:::

1. Bring up local Postgres (port 5433) and MinIO:

   ```sh
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
   ```

2. Create a throwaway database and point an env file at it:

   ```sh
   docker exec wd-smoke-pg psql -U warpdrive -d postgres \
     -c "DROP DATABASE IF EXISTS warpdrive_docs;" -c "CREATE DATABASE warpdrive_docs;"
   sed -E 's#^(DATABASE_URL=.*)/warpdrive$#\1/warpdrive_docs#' .env > .env.docs
   ```

3. Migrate and seed it:

   ```sh
   export $(grep -E '^DATABASE_URL' .env.docs | xargs)
   npx drizzle-kit migrate
   npx tsx --env-file .env.docs scripts/seed-demo.ts
   ```

4. Verify it is clean before capturing anything:

   ```sh
   docker exec wd-smoke-pg psql -U warpdrive -d warpdrive_docs \
     -tAc "select email from users order by email;"
   ```

   Every address must be `@example.com`. Contact records use invented company domains
   (`ironsystems.com` and similar), which are seed-generated and fine.

5. Run the app against it. Next.js refuses a second dev server from the same
   directory, so stop any existing one first:

   ```sh
   export $(grep -E '^DATABASE_URL' .env.docs | xargs)
   BASE_URL=http://localhost:3010 npx next dev --port 3010
   ```

6. Sign in as an administrator: `/auth/dev-login?email=demo1@example.com`. Several
   shots need settings pages a regular account cannot open.

## Capture parameters

| Setting | Value |
| --- | --- |
| Viewport | 1440x900 |
| Theme | Light |
| Device pixel ratio | 2 |
| Browser chrome | Excluded, capture the page only |

Save each shot to `docs-site/static/img/screenshots/<feature>/<filename>` exactly as
named in the table below. The Docusaurus build **fails on a missing image**, so a
typo in a filename is caught at build time rather than shipping as a broken image.

### Two things that silently ruin shots

**Wait for content, not for a timer.** Several pages render a "Loading activities..."
placeholder well past `networkidle`. A fixed wait captured that placeholder, and it
looked like a legitimately empty page rather than a mistake. Gate on the text
disappearing instead:

```sh
agent-browser wait --load networkidle
agent-browser wait --fn '!document.body.innerText.includes("Loading")'
```

**Suppress the dev overlay and animations.** The Next.js dev indicator sits in the
bottom-left corner of every page, and sidebar transitions get captured mid-flight.
Inject this before each screenshot:

```js
const s = document.createElement("style");
s.textContent =
  "nextjs-portal,[data-nextjs-toast]{display:none!important}" +
  "*{transition:none!important;animation:none!important}";
document.head.appendChild(s);
```

## Reproducibility

The demo seed is **not** currently byte-reproducible. Its content PRNG is deterministic
(Mulberry32, fixed seed), but timestamps, database-generated UUIDs, and some query
ordering vary between runs, so re-seeding produces cosmetically different data. The UI
also renders relative dates and overdue and rotting styling against the real clock.

Making it fully reproducible was scoped at roughly 190 to 260 lines across ten seed
modules, some of which are shared with smoke-test infrastructure. That was judged not
worth the risk for a cosmetic docs benefit.

**Practical consequence:** re-capture a shot only when the UI in it actually changed,
rather than regenerating the whole set. The screenshots are committed PNGs; they do
not need to be reproducible from scratch.

## Capturing interaction states

Seven shots show a transient state rather than a page. Three techniques cover them.

**Open a control, then screenshot.** Use accessible names rather than CSS selectors:

```sh
agent-browser find role button click --name "Filter"
agent-browser find role button click --name "Notifications"
```

**Type into a dialog with `fill`, not `keyboard type`.** Keystrokes sent without a
target can miss the focused input entirely, and the search modal then shows
"No deals / No people / No organizations", which reads exactly like a broken search
rather than a missed keystroke. Snapshot for the ref and fill it:

```sh
agent-browser find role button click --name "Open search"
agent-browser snapshot -i           # -> searchbox "Search" [ref=e4]
agent-browser fill @e4 "Apex"
```

**For a mid-drag frame, hold a real mouse drag.** `agent-browser drag` completes the
drop, so it cannot show the lifted card. Synthetic `PointerEvent`s do not activate
dnd-kit either. Use the low-level mouse commands, and step past the 8px activation
threshold in small increments, because a single large jump does not register:

```sh
agent-browser mouse move 392 275
agent-browser mouse down
for y in 278 282 288 296 310 330 360 400 440; do
  agent-browser mouse move 400 $y
done
agent-browser screenshot .../pipeline/board-drag.png
agent-browser mouse up      # always release, or the next shot is captured mid-drag
```

Row checkboxes need the same care: clicking the DOM node with `.click()` does not
update React state. Click the snapshot ref instead.

## Shot table

Each row is `page -> route -> setup -> filename`.

### Pipeline

| Page section | Route | Setup | Filename |
| --- | --- | --- | --- |
| Board | `/pipeline/[id]` | Populated stages with values, labels, owners | `pipeline/board.png` |
| Moving deals | `/pipeline/[id]` | Begin dragging a card, hold | `pipeline/board-drag.png` |
| Filtering | `/pipeline/[id]` | Open Filter, apply 2+ conditions | `pipeline/board-filter.png` |
| List | `/pipeline/[id]/list` | Default columns | `pipeline/list.png` |
| Bulk actions | `/pipeline/[id]/list` | Select 3 rows, open stage picker | `pipeline/list-bulk.png` |
| Archive | `/pipeline/[id]/archived` | Archive an open and a lost deal first | `pipeline/archived.png` |
| Creating deals | `/pipeline/[id]` | Click `+ Deal` | `pipeline/add-deal.png` |
| Configuring stages | `/pipeline/[id]/edit` | Several stages, rotting on one | `pipeline/edit.png` |

### Deal workspace

| Page section | Route | Setup | Filename |
| --- | --- | --- | --- |
| Overview | `/deals/[dealId]` | Deal with activities, notes, participants | `deal-workspace/detail.png` |
| Inline editing | `/deals/[dealId]` | Click a summary field to edit | `deal-workspace/inline-edit.png` |

### Leads, contacts, activities

| Page section | Route | Setup | Filename |
| --- | --- | --- | --- |
| Leads inbox | `/leads` | Several active leads | `leads/list.png` |
| People list | `/contacts/people` | Populated | `contacts/people-list.png` |
| Organization detail | `/contacts/orgs/[orgId]` | Org with people and deals | `contacts/org-detail.png` |
| Activities list | `/activities/list` | Mixed overdue, upcoming, done | `activities/list.png` |
| Activities calendar | `/activities/calendar` | Same week populated | `activities/calendar.png` |

### Email

| Page section | Route | Setup | Filename |
| --- | --- | --- | --- |
| Inbox | `/inbox` | Seeded threads | `email/inbox.png` |
| Composer | `/inbox/compose` | Recipient and subject filled | `email/compose.png` |

### Other features

| Page section | Route | Setup | Filename |
| --- | --- | --- | --- |
| Import wizard | `/settings/import/new` | Mapping step, columns mapped | `import/wizard.png` |
| Dashboard | `/dashboard` | Seeded deals across stages | `dashboard/overview.png` |
| Notifications | any | Open the bell with unread items | `notifications/panel.png` |
| Search | any | Type a term matching several types | `search/results.png` |
| Saved filters | `/pipeline/[id]` | Open the saved-filter menu | `saved-filters/menu.png` |

### Administration

| Page section | Route | Setup | Filename |
| --- | --- | --- | --- |
| Users | `/settings/users` | Active, invited, deactivated all present | `users/list.png` |
| Teams | `/settings/teams` | Teams with and without managers | `teams/list.png` |
| Permission sets | `/settings/permission-sets` | Regular and Admin plus one custom | `permission-sets/list.png` |
| Visibility groups | `/settings/visibility-groups` | Everyone plus one custom group | `visibility-groups/list.png` |
| Labels | `/settings/company/labels` | Default label set | `company-settings/labels.png` |
| Data fields | `/settings/fields` | At least one custom field added | `data-fields/list.png` |
| Email sync | `/settings/email-sync` | Disconnected state is fine | `email-sync/settings.png` |

## Adding a new shot

1. Add a row to the table above.
2. Capture it with the parameters above.
3. Reference it from the page as `/img/screenshots/<feature>/<filename>`.
4. Run `pnpm -C docs-site build` to confirm it resolves.
