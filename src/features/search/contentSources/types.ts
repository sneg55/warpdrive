import type { SQL } from "drizzle-orm";
import type { SearchSection } from "@/constants/search";
import type { VisibilityCtx } from "@/features/permissions/sql";
import type { SearchPattern } from "../pattern";

export interface SourceContext {
  section: SearchSection;
  pattern: SearchPattern;
  ctx: VisibilityCtx;
}

export type ContentSource = (c: SourceContext) => SQL | null;
