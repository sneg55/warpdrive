---
sidebar_position: 30
title: Contributing
description: "How to contribute to Warpdrive: running it locally, the test-driven workflow, the conventions enforced by lint, and submitting a pull request."
---

# Contributing

Warpdrive is MIT licensed and developed at
[github.com/sneg55/warpdrive](https://github.com/sneg55/warpdrive).

## Running locally

```sh
pnpm install
cp .env.example .env    # fill in values
pnpm db:migrate
pnpm dev
```

For a full stack with Postgres and Garage in containers, see the local development
section of [Installation](./setup.md).

## Tests

```sh
pnpm test:unit
```

Warpdrive is developed test-first. A bugfix begins with a failing test that reproduces
the bug, and a feature begins with a test that expresses the next behavior.

**Integration tests run against a real Postgres database, never a mocked one.** The
reason is specific rather than dogmatic: mocked database tests pass while a migration
is broken, which is exactly the failure a CRM cannot absorb.

```sh
pnpm test:integration
```

The integration suite starts a disposable Postgres with Testcontainers, so it needs
Docker. Where Docker is unavailable but a Postgres server is running, point the harness
at it:

```sh
WD_TEST_PG_URL=postgres://postgres@127.0.0.1:5432/postgres pnpm test:integration
```

The URL must name the user and an admin database; the harness defaults neither. It then
runs against that server instead of a container, creating its `wd_template` database
when missing and reusing it otherwise. It still applies the real migrations, extensions
and search indexes, so tests see the same schema either way. Runs must not overlap on
the same server, and nothing is dropped at teardown, so do not point it at a server
whose `wd_template` already matters.

## Conventions

Most conventions are enforced by lint and by hooks rather than by review, so the
fastest way to learn them is to run the linter. The ones that surprise people:

- **One environment boundary.** `src/config/env.ts` is the only module that reads
  `process.env`.
- **Results over throws.** Operations that can fail return a discriminated union.
  Throwing is for programmer errors only.
- **Errors carry stable IDs** of the form `E_<DOMAIN>_<NNN>`, declared in one registry.
- **Use the design system.** Interactive controls use the shadcn and Radix primitives.
  Hand-rolled menus, dialogs, and native form controls are rejected, because they
  silently lose focus trapping, keyboard navigation, and scroll locking.
- **Organize by feature**, not by layer, and keep files small.
- **No em dashes** in any file. A hook enforces this.

See [Architecture](./architecture.md) for the reasoning behind these.

## Pull requests

Contributions go to the public repository. Keep the change focused, include tests, and
describe what behavior changed and why.

## Documentation

These docs are built with Docusaurus and live in `docs-site/` in the same repository.
Every page has an "Edit this page" link at the bottom that opens the source file.

```sh
pnpm -C docs-site start   # local preview with hot reload
pnpm -C docs-site build   # production build
```

The build treats a **broken cross-link as an error**, so a renamed page fails the
build rather than shipping a dead link.

Screenshots are captured from a locally seeded demo instance rather than from
production, so that no real customer data can reach a public site. The procedure is
documented in `docs-site/screenshots/capture.md`.
