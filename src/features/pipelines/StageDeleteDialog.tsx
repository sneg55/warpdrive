"use client";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/Select";
import { STRINGS } from "@/constants/strings";
import { dealCountLabel, type StageDestination } from "./stageRemoval";

export interface StageDeleteRequest {
  key: string;
  name: string;
  dealCount: number;
  closedDealCount: number;
  destinations: StageDestination[];
  defaultDestinationId: string;
}

interface StageDeleteDialogProps {
  request: StageDeleteRequest;
  onCancel: () => void;
  onConfirm: (moveDealsToStageId: string) => void;
}

export function StageDeleteDialog({
  request,
  onCancel,
  onConfirm,
}: StageDeleteDialogProps): React.ReactNode {
  const [destination, setDestination] = useState(request.defaultDestinationId);
  const s = STRINGS.settings;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{s.deleteStageTitle(request.name)}</DialogTitle>
          <DialogDescription>
            {s.deleteStageDescription(dealCountLabel(request.dealCount, request.closedDealCount))}
          </DialogDescription>
        </DialogHeader>
        <div className="text-sm">
          <span className="mb-1 block font-medium">{s.moveDealsTo}</span>
          <Select
            ariaLabel={s.moveDealsTo}
            value={destination}
            onChange={setDestination}
            options={request.destinations.map((d) => ({ value: d.id, label: d.name }))}
          />
        </div>
        <DialogFooter className="mt-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            {s.cancel}
          </Button>
          <Button type="button" variant="destructive" onClick={() => onConfirm(destination)}>
            {s.moveDealsAndDeleteStage}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
