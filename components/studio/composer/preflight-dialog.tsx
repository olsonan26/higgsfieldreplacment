"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, Check, X } from "lucide-react";

export type PreflightData = {
  canSubmit: boolean;
  compiledPrompt: string;
  effectiveSettings: Record<string, string | number | boolean>;
  references: Array<{ assetId: string; role: string; groupId?: string }>;
  skills: Array<{
    skillId: string;
    versionId: string;
    name: string;
    contentSha256: string;
  }>;
  batchCount: number;
  warnings: Array<{ code: string; message: string }>;
  sanitizedRequestPreview: unknown;
  capabilityVersion: number;
  requestHash: string;
};

export function PreflightDialog({
  rawPrompt,
  preflight,
  busy,
  deploymentReady,
  submitError,
  onClose,
  onSubmit,
}: {
  rawPrompt: string;
  preflight: PreflightData;
  busy: boolean;
  deploymentReady: boolean;
  submitError: string;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="vf-dialog preflight-dialog"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
      onClose={onClose}
      aria-labelledby="preflight-title"
      aria-describedby="preflight-description"
    >
      <button
        className="icon-button dialog-close"
        onClick={() => dialog.current?.close()}
        disabled={busy}
        aria-label="Close preflight"
      >
        <X />
      </button>
      <p className="eyebrow">SPEND PREFLIGHT · CONTRACT V1</p>
      <h2 id="preflight-title">Review the exact effective request</h2>
      <p id="preflight-description">
        Nothing is submitted until you approve. Settings and selected skill
        versions are revalidated again at reservation.
      </p>
      <div className="preflight-grid">
        <section>
          <h3>Raw prompt</h3>
          <pre>{rawPrompt}</pre>
        </section>
        <section>
          <h3>Compiled prompt</h3>
          <pre>{preflight.compiledPrompt}</pre>
        </section>
      </div>
      <div className="preflight-summary">
        <section>
          <h3>Effective settings</h3>
          <dl>
            {Object.entries(preflight.effectiveSettings).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <h3>References & skills</h3>
          <p>
            {preflight.references.length} reference
            {preflight.references.length === 1 ? "" : "s"} ·{" "}
            {preflight.skills.length} skill
            {preflight.skills.length === 1 ? "" : "s"} · {preflight.batchCount}{" "}
            output{preflight.batchCount === 1 ? "" : "s"}
          </p>
          {preflight.skills.map((skill) => (
            <span className="summary-chip" key={skill.versionId}>
              <Check /> {skill.name} · {skill.contentSha256.slice(0, 10)}
            </span>
          ))}
        </section>
      </div>
      {preflight.warnings.length > 0 && (
        <section className="warning-stack" aria-label="Preflight warnings">
          {preflight.warnings.map((warning) => (
            <p key={warning.code}>
              <AlertTriangle />{" "}
              <span>
                <strong>{warning.code.replaceAll("_", " ")}</strong>
                {warning.message}
              </span>
            </p>
          ))}
        </section>
      )}
      <details className="request-preview">
        <summary>Sanitized transport preview</summary>
        <pre>{JSON.stringify(preflight.sanitizedRequestPreview, null, 2)}</pre>
      </details>
      <p className="fine-print">
        Creative direction and selected Generation Skills are included in the
        exact compiled prompt. Generative models remain probabilistic, so no
        interface can guarantee perfect semantic obedience.
      </p>
      {!deploymentReady && (
        <p className="error-banner" role="status">
          Generation is blocked until an owner configures the server credentials
          shown in Settings. This preflight remains available and does not spend
          credits.
        </p>
      )}
      {submitError && (
        <p className="error-banner" role="alert">
          {submitError}
        </p>
      )}
      <div className="dialog-actions">
        <button
          className="button secondary"
          onClick={() => dialog.current?.close()}
          disabled={busy}
        >
          Go back
        </button>
        <button
          className="button primary"
          onClick={onSubmit}
          disabled={busy || !preflight.canSubmit || !deploymentReady}
        >
          {busy
            ? "Reserving & submitting…"
            : !deploymentReady
              ? "Configure server credentials"
              : preflight.canSubmit
                ? `Approve ${preflight.batchCount} generation${preflight.batchCount === 1 ? "" : "s"}`
                : "Submission not permitted"}
        </button>
      </div>
    </dialog>
  );
}
