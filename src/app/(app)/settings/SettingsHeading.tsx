import type React from "react";
import { PageHeading } from "@/components/shell/PageHeading";
import { STRINGS } from "@/constants/strings";

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
