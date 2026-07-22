import { Button } from "@/components/ui/Button";

interface ConsentProps {
  action: string;
  clientName: string;
}

export function Consent({ action, clientName }: ConsentProps): React.ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <section className="w-full max-w-md space-y-6 rounded-xl border bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Connected app</p>
          <h1 className="text-balance text-2xl font-semibold">
            Allow {clientName} to access warpdrive?
          </h1>
          <p className="text-pretty text-sm text-muted-foreground">
            This connection can read and update CRM data allowed by your permissions. It cannot
            delete records.
          </p>
        </div>
        <form action={action} method="post" className="flex justify-end gap-2">
          <Button type="submit" name="decision" value="deny" variant="outline">
            Deny
          </Button>
          <Button type="submit" name="decision" value="approve">
            Allow access
          </Button>
        </form>
      </section>
    </main>
  );
}
