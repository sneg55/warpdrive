import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
import { swapSignatureInBody } from "./signatureBody";

interface ComposerSignature {
  id: string;
  name: string;
  isDefault: boolean;
  bodyHtml: string;
}

// Owns the compose signature. On a FRESH compose (empty body) the default signature is rendered INTO
// the body so it is visible/editable (C3), and send passes no signatureId (no server re-append). On a
// reply/forward or a legacy draft (non-empty body) it is NOT embedded (embedding into the quote would
// be wrong); instead `sendSignatureId` carries the id so the server appends it at send, exactly as
// before C3. Hardcoding "" for every send dropped the signature from every forward/reply (codex P2).
export function useComposerSignature(args: {
  signatures: ComposerSignature[];
  setBody: Dispatch<SetStateAction<string>>;
  // Whether the composer OPENED with a body (a resumed draft or a reply/forward prefill), decided
  // from the initial props, NOT the current body: a fast typist can make the body non-empty before
  // the signatures query resolves, and keying off the live body would then misclassify a fresh
  // compose as a prefill and never embed the signature (codex P2).
  startedWithBody: boolean;
  // True when the composer opened on a resumed draft: its body is authoritative (it already carries
  // whatever signature the user composed with), so send must not append one again (codex P2).
  resumingDraft: boolean;
}): {
  signatureId: string;
  sendSignatureId: string;
  applySignature: (id: string) => void;
  resetSignature: () => void;
} {
  const { signatures, setBody, startedWithBody, resumingDraft } = args;
  const defaultSig = signatures.find((s) => s.isDefault);
  const [signatureId, setSignatureId] = useState("");
  // The signature block currently embedded at the body tail, so a dropdown switch can strip it
  // before appending the next. Empty when nothing is embedded.
  const [embeddedSig, setEmbeddedSig] = useState("");
  // True when the signature lives in the body (WYSIWYG); false when it must be appended at send.
  const [sigInBody, setSigInBody] = useState(false);
  const [applied, setApplied] = useState(false);

  // Preselect the default once. State is adjusted during render (guarded by `applied`) so the empty
  // signature never flashes on screen.
  if (!applied && defaultSig !== undefined) {
    setApplied(true);
    setSignatureId(defaultSig.id);
    // A fresh compose (opened with no body) embeds the default signature so it is visible/editable
    // (C3). Append rather than overwrite: the user may have typed before the signatures query
    // resolved, and that text must be preserved. A reply/forward prefill or resumed draft opened
    // WITH a body is left alone (embedding into the quote or a saved signature would be wrong).
    if (!startedWithBody) {
      setBody((prev) => prev + defaultSig.bodyHtml);
      setEmbeddedSig(defaultSig.bodyHtml);
      setSigInBody(true);
    } else if (resumingDraft) {
      // Resumed draft: the body is authoritative (it already holds whatever signature the user
      // composed with), so send must not append one again. Not for a reply/forward prefill, whose
      // body is only the quote and still needs the signature appended server-side.
      setSigInBody(true);
    }
  }

  // Swap the embedded signature when the user picks a different one (or "None"). Picking any option
  // moves the signature into the body, so send stops appending it.
  function applySignature(id: string): void {
    const nextHtml = signatures.find((s) => s.id === id)?.bodyHtml ?? "";
    setSignatureId(id);
    setBody((prev) => swapSignatureInBody(prev, embeddedSig, nextHtml));
    setEmbeddedSig(nextHtml);
    setSigInBody(true);
  }

  // Discard resets to a fresh compose: re-seed the default signature into the body (C3).
  function resetSignature(): void {
    setSignatureId(defaultSig?.id ?? "");
    setEmbeddedSig(defaultSig?.bodyHtml ?? "");
    setSigInBody(defaultSig !== undefined);
    setBody(defaultSig?.bodyHtml ?? "");
  }

  return {
    signatureId,
    // "" when the signature is already embedded (no server re-append), otherwise the id so the
    // server appends it (reply / forward / legacy draft).
    sendSignatureId: sigInBody ? "" : signatureId,
    applySignature,
    resetSignature,
  };
}
