export const FOLDER_KEYS = ["inbox", "drafts", "outbox", "sent", "archive"] as const;

export type FolderKey = (typeof FOLDER_KEYS)[number];

export function parseFolder(raw: string | null | undefined): FolderKey {
  return FOLDER_KEYS.includes(raw as FolderKey) ? (raw as FolderKey) : "inbox";
}

export const FOLDER_LABELS: Record<FolderKey, string> = {
  inbox: "Inbox",
  drafts: "Drafts",
  outbox: "Outbox",
  sent: "Sent",
  archive: "Archive",
};
