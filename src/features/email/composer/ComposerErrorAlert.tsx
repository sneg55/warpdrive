"use client";

interface ComposerErrorAlertProps {
  error: string | null;
  onDismiss: () => void;
}

export function ComposerErrorAlert({ error, onDismiss }: ComposerErrorAlertProps): React.ReactNode {
  if (error === null) return null;
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <span>{error}</span>
      <button
        type="button"
        aria-label="Dismiss error"
        onClick={onDismiss}
        className="shrink-0 font-medium hover:opacity-70"
      >
        &times;
      </button>
    </div>
  );
}
