"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { XAccountSummary } from "../reads";
import { X_DM_STRINGS } from "../strings";
import { xListHref } from "./xRoutes";

export function XAccountRailLinks({
  accounts,
  activeId,
}: {
  accounts: XAccountSummary[];
  activeId: string | null;
}): React.ReactNode {
  return accounts.map((account) => (
    <Link
      key={account.id}
      href={xListHref(account.id, "inbox")}
      aria-current={activeId === account.id ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm",
        activeId === account.id && "bg-accent font-medium",
      )}
    >
      <span aria-hidden="true" className="text-xs font-semibold">
        {X_DM_STRINGS.xMark}
      </span>
      <span className="truncate">{account.displayName}</span>
      {account.unread > 0 && (
        <span className="ml-auto rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">
          {account.unread}
        </span>
      )}
    </Link>
  ));
}
