"use client";
import type React from "react";

const ORG_NOT_APPLICABLE = "Email is tracked on people, not organizations.";

export function OrgEmailPanel(): React.ReactNode {
  return <p className="text-sm text-muted-foreground">{ORG_NOT_APPLICABLE}</p>;
}
