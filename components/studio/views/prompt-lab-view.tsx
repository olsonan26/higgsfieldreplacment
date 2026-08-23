"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Clock3,
  Copy,
  RefreshCw,
  RotateCcw,
  WandSparkles,
  X,
} from "lucide-react";
import { apiRequest } from "@/lib/client/api";
import type {
  PromptVersion,
  StudioProject,
  StudioWorkspace,
} from "@/lib/studio/types";

function PromptDialog({
  version,
  onClose,
}: {
  version: PromptVersion;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState<"raw" | "compiled" | null>(null);
  useEffect(() => dialog.current?.showModal(), []);
  async function copy(kind: "raw" | "compiled") {
    await navigator.clipboard.writeText(
      kind === "raw" ? version.raw_prompt : version.compiled_prompt,
    );
    setCopied(kind);
  }
  return (
    <dialog
      ref={dialog}
      className="vf-dialog prompt-version-dialog"
      onClose={onClose}
      aria-labelledby="prompt-version-title"
    >
      <button
        className="icon-button dialog-close"
        onClick={() => dialog.current?.close()}
        aria-label="Close prompt version"
      >
        <X />
      </button>
      <p className="eyebrow">PROMPT VERSION {version.version}</p>
      <h2 id="prompt-version-title">
        {version.capability?.display_name || "Project prompt"}
      </h2>
      <div className="prompt-version-columns">
        <section>
          <header>
            <h3>Raw prompt</h3>
            <button onClick={() => void copy("raw")}>
              {copied === "raw" ? <Check /> : <Copy />} Copy
            </button>
          </header>
          <pre>{version.raw_prompt || "No prompt text in this version."}</pre>
        </section>
        <section>
          <header>
            <h3>Compiled prompt</h3>
            <button onClick={() => void copy("compiled")}>
              {copied === "compiled" ? <Check /> : <Copy />} Copy
            </button>
          </header>
          <pre>
            {version.compiled_prompt || "No compiled preview in this version."}
          </pre>
        </section>
      </div>
      <details>
        <summary>Effective settings snapshot</summary>
        <pre>{JSON.stringify(version.technical_settings, null, 2)}</pre>
      </details>
    </dialog>
  );
}

export function PromptLabView({
  workspace,
  project,
  onRestore,
}: {
  workspace: StudioWorkspace;
  project: StudioProject;
  onRestore: (version: PromptVersion) => void;
}) {
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [selected, setSelected] = useState<PromptVersion | null>(null);
  const [busyId, setBusyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest<{ versions: PromptVersion[] }>(
        `/api/prompt-versions?workspaceId=${workspace.id}&projectId=${project.id}`,
      );
      setVersions(result.versions);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Prompt versions could not be loaded",
      );
    } finally {
      setLoading(false);
    }
  }, [project.id, workspace.id]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function restore(version: PromptVersion) {
    setBusyId(version.id);
    setError("");
    try {
      const result = await apiRequest<{ restored: PromptVersion }>(
        "/api/prompt-versions",
        {
          method: "POST",
          body: JSON.stringify({
            action: "restore",
            workspaceId: workspace.id,
            projectId: project.id,
            versionId: version.id,
          }),
        },
      );
      onRestore(result.restored);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Prompt restore failed",
      );
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="prompt-lab-view">
      <header className="view-heading">
        <div>
          <p className="eyebrow">PROMPT LAB</p>
          <h1>Direction, versioned.</h1>
          <p>
            Every saved preview keeps the untouched prompt, compiled direction,
            model contract, and exact settings together.
          </p>
        </div>
        <button className="button secondary" onClick={load} disabled={loading}>
          <RefreshCw className={loading ? "spin" : ""} /> Refresh
        </button>
      </header>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {!loading && !versions.length ? (
        <div className="empty-state">
          <WandSparkles />
          <h2>No compiled prompt versions yet</h2>
          <p>
            Open Cinema Studio and choose Refine or Generate. The exact compiled
            direction is saved before any spend.
          </p>
        </div>
      ) : (
        <div className="prompt-version-list">
          {versions.map((version) => (
            <article key={version.id}>
              <header>
                <span>V{version.version}</span>
                <time dateTime={version.created_at}>
                  <Clock3 /> {new Date(version.created_at).toLocaleString()}
                </time>
                {version.restored_from_id && <em>Restored</em>}
              </header>
              <h2>{version.capability?.display_name || "Project draft"}</h2>
              <p>{version.raw_prompt || "Empty starting version"}</p>
              <footer>
                <button
                  className="button subtle"
                  onClick={() => setSelected(version)}
                >
                  Inspect raw + compiled
                </button>
                {workspace.role !== "viewer" && version.raw_prompt && (
                  <button
                    className="button secondary"
                    onClick={() => void restore(version)}
                    disabled={Boolean(busyId)}
                  >
                    <RotateCcw />
                    {busyId === version.id ? "Restoring…" : "Restore to Studio"}
                  </button>
                )}
              </footer>
            </article>
          ))}
        </div>
      )}
      {selected && (
        <PromptDialog version={selected} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}
