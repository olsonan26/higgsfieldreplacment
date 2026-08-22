"use client";

import { useCallback, useEffect, useState } from "react";
import { Images, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/client/api";
import type { StudioProject, StudioWorkspace } from "@/lib/studio/types";
import {
  AssetCard,
  type ViewAsset,
} from "@/components/studio/views/asset-card";

export function AssetLibrary({
  workspace,
  project,
}: {
  workspace: StudioWorkspace;
  project: StudioProject;
}) {
  const [assets, setAssets] = useState<ViewAsset[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setAssets(
        (
          await apiRequest<{ assets: ViewAsset[] }>(
            `/api/assets?workspaceId=${workspace.id}&projectId=${project.id}`,
          )
        ).assets,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Assets could not be loaded",
      );
    } finally {
      setBusy(false);
    }
  }, [project.id, workspace.id]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  return (
    <section>
      <header className="view-heading">
        <div>
          <p className="eyebrow">PRIVATE LIBRARY</p>
          <h1>Project assets</h1>
          <p>
            Validated source references and durably ingested outputs. Signed
            previews expire automatically.
          </p>
        </div>
        <button className="button secondary" onClick={load} disabled={busy}>
          <RefreshCw className={busy ? "spin" : ""} /> Refresh
        </button>
      </header>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {!busy && !assets.length ? (
        <div className="empty-state">
          <Images />
          <h2>No assets yet</h2>
          <p>
            Add a capability-compatible reference from Studio, or generate your
            first durable output.
          </p>
        </div>
      ) : (
        <div className="asset-grid">
          {assets.map((asset) => (
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
    </section>
  );
}
