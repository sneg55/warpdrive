"use client";
import type React from "react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { type CreatePipelineDestination, CreatePipelineDialog } from "./CreatePipelineDialog";

interface CreatePipelineButtonProps {
  label: string;
  onCreated?: CreatePipelineDestination;
  variant?: "default" | "outline" | "ghost";
}

export function CreatePipelineButton({
  label,
  onCreated = "edit",
  variant = "default",
}: CreatePipelineButtonProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <Button ref={buttonRef} variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <CreatePipelineDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={onCreated}
        returnFocusTo={buttonRef}
      />
    </>
  );
}
