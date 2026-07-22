import type React from "react";
import { cn } from "@/lib/utils";

export function SettingsPage({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return <section className={cn("max-w-2xl space-y-6", className)}>{children}</section>;
}

export function SettingsCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div className={cn("overflow-hidden rounded-lg border bg-card shadow-sm", className)}>
      {children}
    </div>
  );
}

export function SettingsCardHeader({
  icon,
  title,
  description,
  actions,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b px-5 py-4", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon !== undefined ? (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-muted-foreground">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-balance">{title}</h2>
          {description !== undefined ? (
            <p className="mt-0.5 text-sm text-pretty text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {actions !== undefined ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

export function SettingsCardBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return <div className={cn("p-5", className)}>{children}</div>;
}

export function SettingsCardFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 border-t bg-muted/20 px-5 py-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export const SETTINGS_TABLE_HEAD =
  "bg-muted/30 text-left text-sm font-medium text-muted-foreground";
export const SETTINGS_TABLE_HEADER_CELL = "px-4 py-2.5 font-medium";
export const SETTINGS_TABLE_ROW =
  "border-b transition-colors duration-150 ease-out last:border-b-0 hover:bg-accent/50 motion-reduce:transition-none";
export const SETTINGS_TABLE_CELL = "px-4 py-2.5";
