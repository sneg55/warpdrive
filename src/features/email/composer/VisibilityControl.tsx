// VisibilityControl: read-only footer display showing the email's default visibility.
// Non-interactive (no backend, no mutation). Gap #16 from parity spec (minimal/read-only).

interface VisibilityControlProps {
  label: string;
}

export function VisibilityControl({ label }: VisibilityControlProps): React.ReactNode {
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground select-none">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      {label}
    </span>
  );
}
