"use client";

import type React from "react";
import { Avatar } from "@/components/ui/Avatar";
import { ContactFollowersButton } from "@/features/contacts/ContactFollowersButton";
import { ContactLabelsControl } from "@/features/contacts/ContactLabelsControl";
import { ContactActionsMenu } from "./ContactActionsMenu";

type FollowerRef = { id: string; name: string; avatarUrl: string | null };

interface ContactDetailHeaderProps {
  entityId: string;
  name: string;
  labels: string[];
  followers: FollowerRef[];
  isFollowedBySelf: boolean;
  canMerge: boolean;
  canDelete: boolean;
  onMerge: () => void;
}

function ContactDetailHeaderFrame({
  entityType,
  avatarClassName,
  entityId,
  name,
  labels,
  followers,
  isFollowedBySelf,
  canMerge,
  canDelete,
  onMerge,
}: ContactDetailHeaderProps & {
  entityType: "person" | "organization";
  avatarClassName: string;
}): React.ReactNode {
  return (
    <header className="mb-4 flex flex-wrap items-start gap-3 border-b pb-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={name} className={avatarClassName} />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-foreground">{name}</h1>
          <ContactLabelsControl entityType={entityType} entityId={entityId} labels={labels} />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <ContactFollowersButton
          entityType={entityType}
          entityId={entityId}
          followers={followers}
          isFollowedBySelf={isFollowedBySelf}
        />
        <ContactActionsMenu
          entityType={entityType}
          entityId={entityId}
          canMerge={canMerge}
          canDelete={canDelete}
          onMerge={onMerge}
        />
      </div>
    </header>
  );
}

export function PersonDetailHeader(props: ContactDetailHeaderProps): React.ReactNode {
  return (
    <ContactDetailHeaderFrame {...props} entityType="person" avatarClassName="h-9 w-9 text-sm" />
  );
}

export function OrganizationDetailHeader(props: ContactDetailHeaderProps): React.ReactNode {
  return (
    <ContactDetailHeaderFrame
      {...props}
      entityType="organization"
      avatarClassName="h-9 w-9 rounded-md text-sm"
    />
  );
}
