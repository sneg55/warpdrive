import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ConsentProps {
  action: string;
  clientName: string;
  redirectUri: string;
}

function redirectDisplay(redirectUri: string): string {
  try {
    const url = new URL(redirectUri);
    return url.host === "" ? url.protocol.replace(/:$/, "") : url.host;
  } catch {
    return redirectUri;
  }
}

export function Consent({ action, clientName, redirectUri }: ConsentProps): React.ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <section className="w-full max-w-md space-y-6 rounded-xl border bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Connection request</p>
          <h1 className="text-balance text-2xl font-semibold">
            Connect an application to warpdrive?
          </h1>
          <p className="text-pretty text-sm text-muted-foreground">
            It will be able to read and update CRM data your permissions allow. It cannot delete
            records. You can revoke it later in Settings.
          </p>
        </div>

        <dl className="space-y-3 rounded-lg border bg-muted/40 p-4 text-sm">
          <div className="space-y-1">
            <dt className="text-xs font-medium text-muted-foreground">
              Name it reports (not verified)
            </dt>
            <dd data-testid="consent-client-name" className="break-words font-medium">
              {clientName}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs font-medium text-muted-foreground">Access will be sent to</dt>
            <dd data-testid="consent-redirect-host" className="break-all font-mono text-xs">
              {redirectDisplay(redirectUri)}
            </dd>
          </div>
        </dl>

        <p
          data-testid="consent-warning"
          className="flex gap-2 text-pretty text-xs text-muted-foreground"
        >
          <TriangleAlert aria-hidden className="mt-px size-4 shrink-0 text-warning" />
          <span>
            Anyone can request a connection and choose the name above. If you did not just start
            this from that application, deny it.
          </span>
        </p>

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
