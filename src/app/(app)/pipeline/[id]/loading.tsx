import type React from "react";
import { BoardSkeleton } from "@/components/shell/skeletons";

export default function Loading(): React.ReactNode {
  return <BoardSkeleton />;
}
