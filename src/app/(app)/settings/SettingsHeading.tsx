import type React from "react";
import { PageHeading } from "@/components/shell/PageHeading";
import { STRINGS } from "@/constants/strings";

// A settings page heading: the shared PageHeading with the "Settings / X" breadcrumb prepended, so
// every settings subpage carries the Pipedrive breadcrumb + 25px title without repeating the crumb.
export function SettingsHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}): React.ReactNode {
  return (
    <PageHeading
      crumbs={[{ label: STRINGS.nav.settings, href: "/settings" }, { label: title }]}
      title={title}
      description={description}
      actions={actions}
    />
  );
}
