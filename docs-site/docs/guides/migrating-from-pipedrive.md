---
title: Migrating from Pipedrive
description: "Move organizations, people, leads, deals, activities, and notes from Pipedrive CSV exports into Warpdrive, in the right order, with owners, links, and history kept."
---

# Migrating from Pipedrive

Warpdrive reads Pipedrive's CSV exports directly. You export each record type from Pipedrive, then import the files one at a time in a fixed order. This page covers the preparation, the order, and what does not come across. The wizard itself is described on the [Import](../features/import.md) page.

## Before you start

1. **Invite your team first.** Owners are matched to Warpdrive users by email, then by name, so the users have to exist before you import. See [Users and teams](../administration/users-and-teams.md).
2. **Create pipelines and stages if their order matters.** The importer can create missing pipelines and stages for you (see below), but it appends new stages in the order the file first names them. If you want a specific order, create the pipelines and stages yourself, or reorder them afterwards.

## Export from Pipedrive

Export each record type as **CSV** (not XLSX) with all columns. For every file, add the **ID** column in Pipedrive's column chooser before you export. The ID column is required in every file. Warpdrive uses it to link records across files and to make re-runs safe. If your Pipedrive instance is set in a non-English language, the column headers would be translated in that language and this breaks the automatic matching; before exporting from Pipedrive it is best to switch to `English (US)`, the setting is in my account -> General -> Language. 

## Import order

Import the files in this order, choosing **Pipedrive export** as the **Source** on the upload step:

1. Organizations
2. People
3. Leads
4. Deals
5. Activities
6. Notes

The order matters because later files link to earlier ones. The **Note** target only appears when the source is **Pipedrive export**.

Convert leads to deals only after every file is in. Activities and notes imported later attach to the lead, not to the deal it became.

For each file, Warpdrive pre-matches columns from their headers. Check the mapping before you continue, and fix any column that landed on the wrong field.

## How records are linked

- **Leads** link to their person and organization by Pipedrive ID, or by name.
- **Activities and notes** link to deals, leads, people, and organizations by their Pipedrive IDs when those columns are present in the file, and by exact name otherwise. If a name is ambiguous or matches nothing, the row fails with a message saying which file to import first.
- **An activity links a deal or a lead, not both.** A row that names both fails.
- **A note attaches to one record:** its deal when it has one, otherwise its lead, otherwise its person, otherwise its organization.
- **Owners** are matched to Warpdrive users by email, then by name. If no user matches, the person doing the import becomes the owner and the row shows a warning in the results and in the downloadable report.

## What is kept

- **Deals** keep their status, won and lost dates, lost reason, labels, and creation date.
- **Leads** keep their owner, labels, creation date, and archived state. Their source and channel are not carried over.
- **Activities** keep their done state and done time. Overdue and done imported activities do not send reminders.
- **Dates without a time zone** are read as UTC.

## Create missing pipelines and stages

On a deal import from a Pipedrive export, a **Create missing pipelines and stages** checkbox is available. It requires the pipeline-management permission. When it is on, any pipeline or stage named in the file that does not exist yet is created, and new stages are appended in the order the file first names them.

Undo does not remove pipelines or stages the import created. Delete them by hand if you do not want them.

## Re-running a file

Re-running a file skips rows whose Pipedrive ID was already imported. If some rows failed, fix them in the file (or fix the cause, such as a missing owner or a record that had not been imported yet) and run the same file again. Rows that already landed are not duplicated.

## What does not come across

- Lead source and channel
- Products
- Files
- Email history
- Stage history
- Currencies: values import as plain numbers, and the currency column is ignored

## Related

- [Import](../features/import.md)
- [Users and teams](../administration/users-and-teams.md)
- [Deal workspace](../features/deal-workspace.md)
