"use client";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import type React from "react";
import { Combobox } from "@/components/ui/Combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatUserName } from "@/features/identity/formatUserName";
import type { useParticipants } from "./useParticipants";

// PD-parity participants table (opened from the Summary count-link and the sidebar section's
// View All): Name / Organization / Email / Phone / Closed deals / Open deals / Next activity
// date / Owner, a per-row remove, and a link-participant combobox. Data + mutations come from
// the caller's useParticipants so every surface shares one cache.
export function ParticipantsDialog({
  open,
  onOpenChange,
  title,
  data,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  data: ReturnType<typeof useParticipants>;
}): React.ReactNode {
  const { participants, options, add, remove } = data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Participants ({title})</DialogTitle>
        </DialogHeader>

        <div className="w-64">
          <Combobox
            ariaLabel="Link participant"
            placeholder="Link participant"
            value=""
            onChange={(id) => void add(id)}
            options={options}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Organization</th>
                <th className="py-2 pr-3 font-medium">Email</th>
                <th className="py-2 pr-3 font-medium">Phone</th>
                <th className="py-2 pr-3 font-medium">Closed deals</th>
                <th className="py-2 pr-3 font-medium">Open deals</th>
                <th className="py-2 pr-3 font-medium">Next activity date</th>
                <th className="py-2 pr-3 font-medium">Owner</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => (
                <tr key={p.personId} className="border-b last:border-b-0">
                  <td className="py-2 pr-3">
                    <Link
                      href={`/contacts/people/${p.personId}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">{p.orgName ?? "-"}</td>
                  <td className="py-2 pr-3">{p.primaryEmail ?? "-"}</td>
                  <td className="py-2 pr-3">{p.phone ?? "-"}</td>
                  <td className="py-2 pr-3 tabular-nums">{p.closedDeals}</td>
                  <td className="py-2 pr-3 tabular-nums">{p.openDeals}</td>
                  <td className="py-2 pr-3">
                    {p.nextActivityAt !== null
                      ? new Date(p.nextActivityAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "-"}
                  </td>
                  {/* formatUserName: demo/seed users carry their email as name; render "Demo2", not the email. */}
                  <td className="py-2 pr-3">
                    {p.ownerName !== null ? formatUserName(p.ownerName) : "-"}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      aria-label={`Remove ${p.name}`}
                      onClick={() => void remove(p.personId)}
                      className="rounded p-1 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {participants.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-4 text-center text-muted-foreground">
                    No participants yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
