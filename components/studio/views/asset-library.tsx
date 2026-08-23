"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Images,
  Layers3,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react";
import { apiRequest } from "@/lib/client/api";
import { createClient } from "@/lib/supabase/client";
import type { StudioProject, StudioWorkspace } from "@/lib/studio/types";
import {
  AssetCard,
  type ViewAsset,
} from "@/components/studio/views/asset-card";

type Variant = "library" | "explore" | "elements" | "audio" | "compact";

const copy = {
  library: {
    eyebrow: "PRIVATE LIBRARY",
    title: "Project assets",
    description:
      "Validated source references and durably ingested outputs with short-lived signed previews.",
  },
  explore: {
    eyebrow: "WORKSPACE GALLERY",
    title: "Explore your production",
    description:
      "Search the real images, video, and audio attached to this project. No invented view counts or sample engagement.",
  },
  elements: {
    eyebrow: "PROJECT CONTINUITY",
    title: "My elements",
    description:
      "Durable characters, locations, props, source frames, video, and audio references for this project.",
  },
  audio: {
    eyebrow: "AUDIO INPUTS",
    title: "Audio library",
    description:
      "Upload, preview, and reuse private audio references. Audio appears in generation only when the selected model supports it.",
  },
  compact: {
    eyebrow: "CURATED FROM YOUR STUDIO",
    title: "Recent project work",
    description: "Private source and generated assets from this project.",
  },
};

export function AssetLibrary({
  workspace,
  project,
  variant = "library",
  mediaFilter,
  limit,
  onExplore,
}: {
  workspace: StudioWorkspace;
  project: StudioProject;
  variant?: Variant;
  mediaFilter?: ViewAsset["media_kind"];
  limit?: number;
  onExplore?: () => void;
}) {
  const [assets, setAssets] = useState<ViewAsset[]>([]);
  const [busy, setBusy] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ViewAsset["media_kind"] | "all">(
    mediaFilter || "all",
  );
  const fileInput = useRef<HTMLInputElement>(null);
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

  async function upload(file: File) {
    setUploading(true);
    setError("");
    setStatus(`Validating ${file.name}…`);
    try {
      const reservation = await apiRequest<{
        assetId: string;
        storagePath: string;
        uploadToken: string;
      }>("/api/assets", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: workspace.id,
          projectId: project.id,
          originalFilename: file.name,
          mimeType: file.type,
          byteSize: file.size,
          role: file.type.startsWith("audio/")
            ? "reference_audio"
            : file.type.startsWith("video/")
              ? "reference_video"
              : "reference_image",
        }),
      });
      const { error: uploadError } = await createClient()
        .storage.from("vesperframe-sources")
        .uploadToSignedUrl(
          reservation.storagePath,
          reservation.uploadToken,
          file,
          { contentType: file.type, upsert: false },
        );
      if (uploadError) throw new Error("Private upload failed");
      await apiRequest(`/api/assets/${reservation.assetId}/finalize`, {
        method: "POST",
        body: JSON.stringify({ workspaceId: workspace.id }),
      });
      setStatus(`${file.name} is ready in this project.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed");
      setStatus("");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const visible = assets
    .filter((asset) => kind === "all" || asset.media_kind === kind)
    .filter((asset) =>
      asset.safe_filename.toLowerCase().includes(query.trim().toLowerCase()),
    )
    .slice(0, limit);
  const heading = copy[variant];
  const Icon =
    variant === "audio"
      ? AudioLines
      : variant === "elements"
        ? Layers3
        : Images;
  const canUpload = workspace.role !== "viewer" && variant !== "compact";

  return (
    <section
      className={variant === "compact" ? "project-gallery" : "asset-library"}
    >
      <header
        className={variant === "compact" ? "section-heading" : "view-heading"}
      >
        <div>
          <p className="eyebrow">{heading.eyebrow}</p>
          <h1>{heading.title}</h1>
          <p>{heading.description}</p>
        </div>
        <div className="view-actions">
          {onExplore && (
            <button className="button subtle" onClick={onExplore}>
              Explore all
            </button>
          )}
          {variant !== "compact" && (
            <button className="button secondary" onClick={load} disabled={busy}>
              <RefreshCw className={busy ? "spin" : ""} /> Refresh
            </button>
          )}
          {canUpload && (
            <button
              className="button primary"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
            >
              <Upload /> {uploading ? "Uploading…" : "Add asset"}
            </button>
          )}
        </div>
      </header>
      {variant !== "compact" && (
        <div className="asset-toolbar">
          <label>
            <Search />
            <span className="sr-only">Search assets</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search this project…"
            />
          </label>
          {!mediaFilter && (
            <div role="group" aria-label="Asset media filter">
              {(["all", "image", "video", "audio"] as const).map((item) => (
                <button
                  key={item}
                  className={kind === item ? "active" : ""}
                  onClick={() => setKind(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        className="sr-only"
        accept={
          mediaFilter === "audio"
            ? "audio/mpeg,audio/wav,audio/x-wav,audio/mp4"
            : "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,audio/mpeg,audio/wav,audio/x-wav,audio/mp4"
        }
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="success-banner" role="status">
          {status}
        </p>
      )}
      {!busy && !visible.length ? (
        <div className="empty-state">
          <Icon />
          <h2>{query ? "No matching assets" : "No assets yet"}</h2>
          <p>
            {query
              ? "Try a different search or media filter."
              : "Add a validated reference or generate your first durable output."}
          </p>
          {canUpload && !query && (
            <button
              className="button primary"
              onClick={() => fileInput.current?.click()}
            >
              <Upload /> Upload first asset
            </button>
          )}
        </div>
      ) : (
        <div className={`asset-grid ${variant === "compact" ? "compact" : ""}`}>
          {visible.map((asset) => (
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
