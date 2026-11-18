import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
import { swapSignatureInBody } from "./signatureBody";

interface ComposerSignature {
  id: string;
  name: string;
  isDefault: boolean;
  bodyHtml: string;
}

export function useComposerSignature(args: {
  signatures: ComposerSignature[];
  setBody: Dispatch<SetStateAction<string>>;
  startedWithBody: boolean;
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
  const [embeddedSig, setEmbeddedSig] = useState("");
  const [sigInBody, setSigInBody] = useState(false);
  const [applied, setApplied] = useState(false);

  if (!applied && defaultSig !== undefined) {
    setApplied(true);
    setSignatureId(defaultSig.id);
    if (!startedWithBody) {
      setBody((prev) => prev + defaultSig.bodyHtml);
      setEmbeddedSig(defaultSig.bodyHtml);
      setSigInBody(true);
    } else if (resumingDraft) {
      setSigInBody(true);
    }
  }

  function applySignature(id: string): void {
    const nextHtml = signatures.find((s) => s.id === id)?.bodyHtml ?? "";
    setSignatureId(id);
    setBody((prev) => swapSignatureInBody(prev, embeddedSig, nextHtml));
    setEmbeddedSig(nextHtml);
    setSigInBody(true);
  }

  function resetSignature(): void {
    setSignatureId(defaultSig?.id ?? "");
    setEmbeddedSig(defaultSig?.bodyHtml ?? "");
    setSigInBody(defaultSig !== undefined);
    setBody(defaultSig?.bodyHtml ?? "");
  }

  return {
    signatureId,
    sendSignatureId: sigInBody ? "" : signatureId,
    applySignature,
    resetSignature,
  };
}
