import type React from "react";
import { DashboardSkeleton } from "@/components/shell/skeletons";

// Instant navigation fallback: paints while this route's server component fetches its data.
export default function Loading(): React.ReactNode {
  return <DashboardSkeleton />;
}
