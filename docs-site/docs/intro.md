---
sidebar_position: 1
slug: /
title: Introduction
description: "Warpdrive is an open-source, self-hosted CRM for business-development teams: pipeline management, a deal workspace, contacts, and two-way Gmail, on your own infrastructure."
---

# Warpdrive

Warpdrive is an open-source, self-hosted CRM for a company's business-development
team. It covers pipeline management, a deal workspace, contacts and organizations,
two-way Gmail, user management, notifications, and pipeline stats.

It runs entirely on infrastructure you control. There is no per-seat bill and no
vendor holding your customer data.

## What it does

- **Pipeline management.** A drag-and-drop board of deals across stages, with a list
  view and an archive. Stages can flag deals that have gone stale.
- **Deal workspace.** A per-deal page holding the summary, activities, notes, files,
  participants, and the email thread history.
- **Contacts.** People and organizations, linked to each other and to deals.
- **Leads.** A separate inbox for unqualified prospects, convertible into deals.
- **Email.** Two-way Gmail over OAuth: send from inside the CRM, and see replies on
  the record they belong to.
- **Activities.** Calls, meetings, and tasks, in a list and on a calendar.
- **Administration.** Users, teams, permission sets, and visibility groups.

## What it is not

Warpdrive reimplements the business-development portion of a CRM. It deliberately
leaves out products and projects, documents, invoicing, forecast views, and
multi-currency. If your team needs those, this is not the right tool.

## Single-tenant by design

Warpdrive is single-tenant: one deployment serves one company. There is no
organization switcher and no cross-tenant data model, which is what keeps the
permissions model comprehensible and the queries simple.

## Where to go next

- [Installation](./setup.md) walks through a single-box Docker Compose deployment.
- [Architecture](./architecture.md) covers the stack and how the pieces fit.
- The feature pages document each surface in detail, starting with
  [Pipeline](./features/pipeline.md).

## License

MIT. The source lives at
[github.com/sneg55/warpdrive](https://github.com/sneg55/warpdrive).
