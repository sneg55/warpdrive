"use client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { BLOCK_CLASS } from "@/features/observability/replayMasking";

const MIN_BODY_HEIGHT_PX = 240;
const IFRAME_SANDBOX = "allow-same-origin";

const BODY_STYLE = [
  "html{color-scheme:light}",
  "body{margin:0;padding:12px;background:#ffffff;color:#1f2328;",
  'font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;',
  "overflow-wrap:anywhere}",
  "img{max-width:100%;height:auto}",
  "a{color:#0b57d0}",
].join("");

export function MessageBodyFrame(props: {
  html: string;
  allowRemote: boolean;
  onShowRemote: () => void;
  title?: string;
}): React.ReactNode {
  const [height, setHeight] = useState<number | null>(null);
  const srcDoc = useMemo(
    () =>
      `<!doctype html><meta charset="utf-8"><meta name="color-scheme" content="light">` +
      `<base target="_blank"><style>${BODY_STYLE}</style><body>${props.html}</body>`,
    [props.html],
  );

  function onLoad(e: React.SyntheticEvent<HTMLIFrameElement>): void {
    const doc = e.currentTarget.contentDocument;
    if (doc === null) return;
    setHeight(doc.body.scrollHeight);
  }

  return (
    <div>
      {!props.allowRemote && (
        <Button variant="outline" size="sm" className="mb-2" onClick={props.onShowRemote}>
          Show remote content
        </Button>
      )}
      <iframe
        title={props.title ?? "email body"}
        className={`${BLOCK_CLASS} block overflow-hidden rounded-md border border-border`}
        sandbox={IFRAME_SANDBOX}
        srcDoc={srcDoc}
        onLoad={onLoad}
        style={{
          width: "100%",
          border: 0,
          minHeight: height === null ? MIN_BODY_HEIGHT_PX : undefined,
          height: height === null ? undefined : height,
        }}
      />
    </div>
  );
}
