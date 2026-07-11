// Backward-compatible re-export. The canonical activity type-icon map moved to
// typeIcons.tsx so Unit A (deal history card) and Unit C (composer rail) can share
// one source of truth; existing importers of this path keep working unchanged.
export { ACTIVITY_TYPE_ICON_KEYS, ActivityTypeIcon } from "./typeIcons";
