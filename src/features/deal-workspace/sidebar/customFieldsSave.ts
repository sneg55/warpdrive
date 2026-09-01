import type { InlineSaveResult } from "@/features/inline-edit/useInlineEditField";

export type CustomFieldsSave = (patch: Record<string, unknown>) => Promise<InlineSaveResult>;
