// SubjectRow: inline subject field with divider-row styling (no boxed border).

interface SubjectRowProps {
  value: string;
  onChange: (value: string) => void;
}

export function SubjectRow({ value, onChange }: SubjectRowProps): React.ReactNode {
  return (
    <input
      type="text"
      placeholder="Subject"
      className="w-full border-b border-border px-2 py-1 text-sm transition-colors placeholder:text-muted-foreground focus:border-ring focus:outline-none"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
