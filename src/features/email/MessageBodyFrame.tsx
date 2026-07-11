"use client";
import { useMemo, useState } from "react";

// Sanitized HTML is isolated in an iframe whose sandbox grants allow-same-origin ONLY.
//
// !!! SECURITY WARNING: NEVER add allow-scripts to this sandbox. !!!
// allow-same-origin is safe here ONLY because allow-scripts is absent. The two tokens together
// (`allow-same-origin allow-scripts`) fully DEFEAT the sandbox: the framed content gains both code
// execution AND the real origin, so any single sanitizer miss (one unescaped <script>, one onerror
// handler) would run with our origin's cookies/session/DOM access. Adding allow-scripts, even
// temporarily or for a "trusted" body, is a critical vulnerability. Keep scripts off, permanently.
//
// WHY allow-same-origin is safe on its own: the sandbox does NOT include allow-scripts, so no
// script (inline, event handler, or otherwise) can execute inside the frame. With code
// execution off, a sanitizer miss still cannot reach the app, cookies, or session. The
// content is server-sanitized and delivered as a same-origin srcDoc blob (nothing the app
// did not already produce), so granting same-origin exposes no new surface. We need
// same-origin purely so the onLoad handler can read the laid-out document height
// (contentDocument.body.scrollHeight); without it the iframe collapses to a fixed default
// (~150px) and long email bodies are clipped. "show remote content" re-queries the server
// with allowRemote:true (server re-sanitizes) rather than enabling remote content client-side.
const MIN_BODY_HEIGHT_PX = 240;
const IFRAME_SANDBOX = "allow-same-origin";

export function MessageBodyFrame(props: {
  html: string;
  allowRemote: boolean;
  onShowRemote: () => void;
}): React.ReactNode {
  // null until the frame has loaded and reported its content height; min-height keeps a
  // short (or not-yet-loaded) body from collapsing.
  const [height, setHeight] = useState<number | null>(null);
  const srcDoc = useMemo(
    () => `<!doctype html><meta charset="utf-8"><base target="_blank"><body>${props.html}</body>`,
    [props.html],
  );

  function onLoad(e: React.SyntheticEvent<HTMLIFrameElement>): void {
    const doc = e.currentTarget.contentDocument;
    if (doc === null) return; // cross-origin/unavailable: fall back to min-height.
    setHeight(doc.body.scrollHeight);
  }

  return (
    <div>
      {!props.allowRemote && (
        <button type="button" onClick={props.onShowRemote}>
          Show remote content
        </button>
      )}
      <iframe
        title="email body"
        sandbox={IFRAME_SANDBOX}
        srcDoc={srcDoc}
        onLoad={onLoad}
        style={{
          width: "100%",
          border: 0,
          minHeight: MIN_BODY_HEIGHT_PX,
          height: height === null ? undefined : height,
        }}
      />
    </div>
  );
}
