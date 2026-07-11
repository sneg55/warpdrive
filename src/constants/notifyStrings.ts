// notifyStrings.ts: human-readable change summaries used in notification payloads.
// Named constants prevent magic strings from scattering across action files.
export const NOTIFY_STRINGS = {
  dealUpdated: "Deal details were updated",
  dealMoved: "Deal moved to a new stage",
} as const;
