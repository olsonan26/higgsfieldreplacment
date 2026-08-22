"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { apiRequest } from "@/lib/client/api";
import type { StudioProject } from "@/lib/studio/types";

export function ProjectDialog({
  workspaceId,
  project,
  mode,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  project?: StudioProject;
  mode: "create" | "rename" | "archive" | "trash";
  onClose: () => void;
  onSaved: (project?: StudioProject) => void;
}) {
  const [name, setName] = useState(project?.name || "Untitled direction");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const labels = {
    create: [
      "Create project",
      "A durable project keeps settings, assets, skills, jobs, and history isolated.",
    ],
    rename: [
      "Rename project",
      "The new name is saved for every workspace member.",
    ],
    archive: [
      "Archive project",
      "Archived projects can be restored from workspace settings.",
    ],
    trash: [
      "Move project to trash",
      "Only an owner can do this. Data remains recoverable during the retention window.",
    ],
  } as const;

  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (mode === "create") {
        const result = await apiRequest<{ project: StudioProject }>(
          "/api/projects",
          {
            method: "POST",
            body: JSON.stringify({ workspaceId, name, description: "" }),
          },
        );
        onSaved(result.project);
      } else if (mode === "rename") {
        const result = await apiRequest<{ project: StudioProject }>(
          `/api/projects/${project!.id}`,
          { method: "PATCH", body: JSON.stringify({ workspaceId, name }) },
        );
        onSaved(result.project);
      } else if (mode === "archive") {
        await apiRequest(`/api/projects/${project!.id}`, {
          method: "PATCH",
          body: JSON.stringify({ workspaceId, archived: true }),
        });
        onSaved();
      } else {
        await apiRequest(`/api/projects/${project!.id}`, {
          method: "DELETE",
          body: JSON.stringify({ workspaceId }),
        });
        onSaved();
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Project change failed",
      );
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="vf-dialog project-dialog"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
      onClose={onClose}
      aria-labelledby="project-dialog-title"
    >
      <button
        className="icon-button dialog-close"
        onClick={() => dialog.current?.close()}
        disabled={busy}
        aria-label="Close dialog"
      >
        <X />
      </button>
      <p className="eyebrow">PROJECT</p>
      <h2 id="project-dialog-title">{labels[mode][0]}</h2>
      <p>{labels[mode][1]}</p>
      {(mode === "create" || mode === "rename") && (
        <label className="field">
          <span>Project name</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={160}
          />
        </label>
      )}
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button
          className="button secondary"
          onClick={() => dialog.current?.close()}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          className={`button ${mode === "trash" ? "danger" : "primary"}`}
          onClick={submit}
          disabled={
            busy || ((mode === "create" || mode === "rename") && !name.trim())
          }
        >
          {busy ? "Saving…" : labels[mode][0]}
        </button>
      </div>
    </dialog>
  );
}
