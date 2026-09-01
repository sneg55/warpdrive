export const BULK_ARCHIVE_DESCRIPTION =
  "Archived deals leave this list but stay on the Archive tab, where any of them can be unarchived.";

export function bulkArchiveTitle(count: number): string {
  const unit = count === 1 ? "deal" : "deals";
  return `Archive ${count} ${unit}?`;
}
