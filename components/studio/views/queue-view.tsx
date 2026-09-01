"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, Clipboard, Clock3, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/client/api";
import type { StudioProject, StudioWorkspace } from "@/lib/studio/types";
import {
  AssetCard,
  type ViewAsset,
} from "@/components/studio/views/asset-card";

type Generation = {
  id: string;
  state: string;
  progress: number;
  raw_prompt: string;
  compiled_prompt: string;
  estimated_credits: number;
  recorded_credits: number | null;
  display_error_message: string | null;
  created_at: string;
  outputs: ViewAsset[];
};

const TERMINAL_STATES = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
]);
const ACTIVE_POLL_MS = 3_000;

export function QueueView({
  workspace,
  project,
}: {
  workspace: StudioWorkspace;
  project: StudioProject;
}) {
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const polling = useRef(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setBusy(true);
      if (!silent) setError("");
      try {
        setGenerations(
          (
            await apiRequest<{ generations: Generation[] }>(
              `/api/generations?workspaceId=${workspace.id}&projectId=${project.id}`,
            )
          ).generations,
        );
      } catch (caught) {
        if (!silent) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Queue could not be loaded",
          );
        }
      } finally {
        if (!silent) setBusy(false);
      }
    },
    [project.id, workspace.id],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const hasActiveGeneration = generations.some(
    (generation) => !TERMINAL_STATES.has(generation.state),
  );

  useEffect(() => {
    if (!hasActiveGeneration) return;

    async function poll() {
      if (polling.current || document.visibilityState !== "visible") return;
      polling.current = true;
      try {
        if (workspace.role !== "viewer") {
          await apiRequest("/api/generations/reconcile", {
            method: "POST",
            body: JSON.stringify({
              workspaceId: workspace.id,
              projectId: project.id,
            }),
          });
        }
        await load(true);
      } catch {
        // Keep the visible queue stable and try again on the next bounded poll.
      } finally {
        polling.current = false;
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), ACTIVE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [hasActiveGeneration, load, project.id, workspace.id, workspace.role]);

  async function refresh() {
    if (workspace.role !== "viewer")
      await apiRequest("/api/generations/reconcile", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: workspace.id,
          projectId: project.id,
        }),
      }).catch(() => undefined);
    await load();
  }

  async function archive(id: string) {
    await apiRequest(`/api/generations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        workspaceId: workspace.id,
        projectId: project.id,
        archived: true,
      }),
    });
    await load();
  }

  return (
    <section>
      <header className="view-heading">
        <div>
          <p className="eyebrow">SERVER-AUTHORITATIVE</p>
          <h1>Generation queue</h1>
          <p>
            Active jobs update automatically every few seconds. Callbacks and
            bounded reconciliation continue after the browser closes.
          </p>
        </div>
        <button className="button secondary" onClick={refresh} disabled={busy}>
          <RefreshCw className={busy ? "spin" : ""} /> Reconcile & refresh
        </button>
      </header>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <div className="queue-list">
        {generations.map((generation) => (
          <article className="queue-card" key={generation.id}>
            <header>
              <span className={`state-pill ${generation.state}`}>
                {generation.state}
              </span>
              <time>
                <Clock3 /> {new Date(generation.created_at).toLocaleString()}
              </time>
              <span>
                {generation.recorded_credits === null
                  ? `Estimated ${generation.estimated_credits}`
                  : `Recorded ${generation.recorded_credits}`}{" "}
                credits
              </span>
            </header>
            <p>{generation.raw_prompt}</p>
            {!TERMINAL_STATES.has(generation.state) && (
              <div
                className="progress"
                aria-label={`${generation.progress}% complete`}
              >
                <i style={{ width: `${generation.progress}%` }} />
              </div>
            )}
            {generation.display_error_message && (
              <p className="error-banner">{generation.display_error_message}</p>
            )}
            {generation.outputs.length > 0 && (
              <div className="asset-grid compact">
                {generation.outputs.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    workspaceId={workspace.id}
                    projectId={project.id}
                    canFavorite={workspace.role !== "viewer"}
                  />
                ))}
              </div>
            )}
            <footer>
              <button
                className="button subtle"
                onClick={() =>
                  navigator.clipboard.writeText(generation.compiled_prompt)
                }
              >
                <Clipboard /> Copy compiled prompt
              </button>
              {workspace.role !== "viewer" && (
                <button
                  className="button subtle"
                  onClick={() => archive(generation.id)}
                >
                  <Archive /> Remove from view
                </button>
              )}
            </footer>
          </article>
        ))}
        {!busy && !generations.length && (
          <div className="empty-state">
            <Clock3 />
            <h2>No generations yet</h2>
            <p>Approved preflight submissions will appear here immediately.</p>
          </div>
        )}
      </div>
    </section>
  );
}
