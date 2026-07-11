import type React from "react";
import { InboxSkeleton } from "@/components/shell/skeletons";

// Instant navigation fallback: paints while this route's server component fetches its data.
export default function Loading(): React.ReactNode {
  return <InboxSkeleton />;
}
