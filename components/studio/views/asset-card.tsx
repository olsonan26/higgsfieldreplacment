"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Download, Expand, Heart, X } from "lucide-react";
import { apiRequest } from "@/lib/client/api";

export type ViewAsset = {
  id: string;
  media_kind: "image" | "video" | "audio" | "document" | "other";
  safe_filename: string;
  mime_type: string;
  byte_size: number;
  previewUrl?: string | null;
  role?: string;
  metadata?: unknown;
};

function PreviewDialog({
  asset,
  workspaceId,
  projectId,
  onClose,
}: {
  asset: ViewAsset;
  workspaceId: string;
  projectId: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<{
    url: string;
    mediaKind: string;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    apiRequest<{ url: string; mediaKind: string }>(
      `/api/assets/${asset.id}/preview?workspaceId=${workspaceId}&projectId=${projectId}`,
    )
      .then(setPreview)
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "Preview failed"),
      );
  }, [asset.id, projectId, workspaceId]);
  return (
    <dialog
      ref={dialog}
      className="vf-dialog asset-preview-dialog"
      onClose={onClose}
      aria-labelledby="asset-preview-title"
    >
      <button
        className="icon-button dialog-close"
        onClick={() => dialog.current?.close()}
        aria-label="Close preview"
      >
        <X />
      </button>
      <h2 id="asset-preview-title">{asset.safe_filename}</h2>
      <div className="asset-preview-stage">
        {error ? (
          <p role="alert">{error}</p>
        ) : !preview ? (
          <p>Signing private preview…</p>
        ) : preview.mediaKind === "video" ? (
          <video src={preview.url} controls autoPlay={false} />
        ) : preview.mediaKind === "audio" ? (
          <audio src={preview.url} controls />
        ) : (
          <Image
            src={preview.url}
            alt={asset.safe_filename}
            fill
            sizes="min(92vw, 1200px)"
            unoptimized
          />
        )}
      </div>
      <a
        className="button primary"
        href={`/api/assets/${asset.id}/download?workspaceId=${workspaceId}&projectId=${projectId}`}
      >
        <Download /> Download
      </a>
    </dialog>
  );
}

export function AssetCard({
  asset,
  workspaceId,
  projectId,
  canFavorite = true,
}: {
  asset: ViewAsset;
  workspaceId: string;
  projectId: string;
  canFavorite?: boolean;
}) {
  const [previewing, setPreviewing] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [busy, setBusy] = useState(false);
  async function toggleFavorite() {
    setBusy(true);
    try {
      await apiRequest("/api/favorites", {
        method: favorite ? "DELETE" : "POST",
        body: JSON.stringify({ workspaceId, projectId, assetId: asset.id }),
      });
      setFavorite((current) => !current);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="asset-card">
      <button
        className="asset-thumb"
        onClick={() => setPreviewing(true)}
        disabled={asset.mime_type === "application/x.external-id"}
        aria-label={`Preview ${asset.safe_filename}`}
      >
        {asset.previewUrl ? (
          <Image
            src={asset.previewUrl}
            alt=""
            fill
            sizes="(max-width: 700px) 100vw, 25vw"
            unoptimized
          />
        ) : (
          <span>
            {asset.mime_type === "application/x.external-id"
              ? "ID"
              : asset.media_kind.toUpperCase()}
          </span>
        )}
        {asset.mime_type !== "application/x.external-id" && (
          <i>
            <Expand />
          </i>
        )}
      </button>
      <div>
        <strong title={asset.safe_filename}>{asset.safe_filename}</strong>
        <small>
          {asset.role || asset.media_kind} ·{" "}
          {asset.byte_size
            ? `${Math.max(1, Math.round(asset.byte_size / 1024))} KB`
            : "identity"}
        </small>
      </div>
      <div className="asset-card-actions">
        {canFavorite && (
          <button
            onClick={toggleFavorite}
            disabled={busy}
            aria-label={favorite ? "Remove favorite" : "Add favorite"}
            className={favorite ? "active" : ""}
          >
            <Heart />
          </button>
        )}{" "}
        {asset.mime_type !== "application/x.external-id" && (
          <a
            href={`/api/assets/${asset.id}/download?workspaceId=${workspaceId}&projectId=${projectId}`}
            aria-label={`Download ${asset.safe_filename}`}
          >
            <Download />
          </a>
        )}
      </div>
      {previewing && (
        <PreviewDialog
          asset={asset}
          workspaceId={workspaceId}
          projectId={projectId}
          onClose={() => setPreviewing(false)}
        />
      )}
    </article>
  );
}
