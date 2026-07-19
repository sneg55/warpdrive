---
sidebar_position: 3
title: Architecture
description: "How Warpdrive is built: the stack, the runtime services, the feature-based code layout, and the conventions that hold the codebase together."
---

# Architecture

This page is for people deploying, operating, or contributing to Warpdrive. If you
just want to use it, start with the feature pages instead.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js (App Router) with React and TypeScript |
| Database | Postgres, accessed through Drizzle ORM |
| Reads | tRPC with TanStack Query |
| Writes | Next server actions |
| UI | shadcn/ui over Radix primitives, with Tailwind |
| Board | dnd-kit for drag and drop |
| Board state | Zustand, scoped to the board |
| Realtime | Self-hosted WebSocket server plus Postgres `LISTEN`/`NOTIFY` |
| Background jobs | pg-boss |
| Object storage | MinIO, S3-compatible |
| Email | Gmail API over OAuth |
| Auth | Google SSO |
| Package manager | pnpm |

Custom fields are stored as JSONB rather than as migrated columns, which is what lets
administrators add fields without a schema change.

## Runtime services

A deployment runs five long-lived processes plus two one-shot ones:

- **`app`** serves the Next.js application.
- **`ws`** is the WebSocket server for realtime updates.
- **`worker`** runs background jobs: mailbox sync, CSV imports, scheduled sends.
- **`postgres`** holds all relational data.
- **`minio`** holds uploaded files.
- **`migrate`** applies schema migrations once, before the app starts.
- **`createbuckets`** provisions the MinIO bucket once.

In production a **Caddy** reverse proxy fronts all of it and terminates TLS.

The split matters operationally: **background job handlers run only in the `worker`
process.** Enqueueing a job from the app does nothing visible until a worker picks it
up, so an import that appears stuck is usually a worker that is not running.

## Realtime

Database changes emit Postgres `NOTIFY` events. The WebSocket server relays them to
connected browsers, which update the board, inbox, notification bell, and presence
indicators in place.

Each browser tab opens **one multiplexed WebSocket connection** shared across every
subscribing component, rather than one socket per hook. The server stamps a sequence
number per channel and tags each frame with its channel.

Realtime depends on `NEXT_PUBLIC_WS_URL` being correct at build time. See
[Installation](./setup.md) for why a wrong value fails silently.

## Code layout

Code is organized by feature, not by technical layer:

```
src/
  features/<feature>/     implementation, types, constants, validation, tests
  components/ui/          shadcn design-system wrappers
  constants/              named constants, including the error ID registry
  types/                  shared types, to break import cycles
  config/env.ts           the single place process.env is read
  app/                    Next.js routes
```

Each feature directory holds its own implementation, types, validation, and tests
together. The goal is that understanding one feature does not require opening files
across five directories.

## Conventions

These are enforced by lint rules and hooks, not just by convention:

- **Validate at the boundary.** External data passes through a schema exactly once,
  where it enters the type system: procedure inputs, server-action arguments, Gmail
  responses, OAuth callbacks, CSV rows, environment variables. Inside the program the
  inferred type is trusted.
- **One environment boundary.** `src/config/env.ts` is the only module that reads
  `process.env`. It validates at import time and throws on misconfiguration. A lint
  rule bans raw access elsewhere.
- **Results over throws.** Operations that can fail return a discriminated union
  rather than throwing. Throwing is reserved for programmer errors. This matters most
  in batch work such as syncing many mailboxes, where one failure must not abandon
  the rest.
- **Stable error IDs.** Every application error carries an identifier of the form
  `E_<DOMAIN>_<NNN>`, declared once in a central registry, so a support report can be
  traced to one cause.
- **Cancellation is threaded through.** Long-running operations take an
  `AbortSignal` and pass it to everything they call, so obsoleted requests and sync
  jobs actually stop instead of piling up.
- **Use the design system.** Interactive controls use the shadcn and Radix
  primitives rather than hand-rolled menus, dialogs, or native form controls, which
  otherwise silently lose focus trapping, keyboard navigation, and scroll locking.

## Testing

Tests run on Vitest and live inside the feature directory they cover.

Integration tests **run against a real Postgres database**, never a mocked one. The
reasoning is specific: mocked database tests pass while a migration is broken, and
that is exactly the failure a CRM cannot afford.

## Contributing

See [Contributing](./contributing.md).
