# warpdrive

An open-source, self-hosted CRM for a company's business-development team. It
covers the core BD workflow: pipeline management, a deal workspace, contacts and
organizations, two-way Gmail email, user management, notifications, and basic
pipeline stats.

Single-tenant and self-hosted: you run it on your own box, against your own
Postgres and object storage, authenticated with your own Google Workspace. Your
data never leaves your infrastructure.

The product's information architecture is inspired by established BD tools, but
all code, styling, and assets are original and it ships its own visual layer
built on shadcn/ui.

## Features

- Kanban pipeline board with drag-and-drop stages
- Deal workspace: activities, notes, participants, files, history timeline
- Contacts and organizations with custom fields
- Two-way Gmail sync over the Gmail API (send, receive, thread linking, tracking)
- Leads inbox and CSV import
- Role-based permissions and user management
- Realtime updates (board, inbox, notifications, presence) over WebSocket
- Notifications and pipeline stats

## Stack

Next.js (App Router) and React with TypeScript, Drizzle ORM on Postgres, tRPC
with TanStack Query, Next server actions, shadcn/ui with Tailwind, dnd-kit for
the board, Zustand for board-local state, a self-hosted WebSocket server backed
by Postgres LISTEN/NOTIFY, MinIO (or any S3-compatible store) for files, and the
Gmail API via Google OAuth. Package manager: pnpm.

## Self-hosting

The repo ships a single-box Docker topology (app, WebSocket server, background
worker, Postgres, MinIO, and Caddy for automatic HTTPS):

```bash
cp .env.example .env    # fill in domain, Google OAuth, storage, and secrets
docker compose up -d --build
```

Caddy provisions TLS for `APP_DOMAIN` automatically; Postgres and MinIO stay on
the internal network. See [`docs/deploy.md`](docs/deploy.md) for the full guide,
including Google OAuth setup and required environment variables.

## Local development

```bash
pnpm install
cp .env.example .env
# bring up Postgres and MinIO with host ports and no TLS:
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres minio
pnpm db:migrate
pnpm dev
```

## Tests

```bash
pnpm test:unit          # fast unit tests
pnpm test:integration   # spins up a disposable Postgres via Testcontainers
```

Integration tests run against a real Postgres (never a mock) so migrations and
queries are exercised as they run in production.

## Contributing

Issues and pull requests are welcome. PRs are reviewed and merged upstream, then
land back here on the next release. Please keep changes focused and include tests
for new behavior.

## License

MIT. See [`LICENSE`](LICENSE).
