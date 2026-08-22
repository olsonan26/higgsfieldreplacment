"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { apiRequest } from "@/lib/client/api";
import type { StudioProject, StudioWorkspace } from "@/lib/studio/types";
import {
  AssetCard,
  type ViewAsset,
} from "@/components/studio/views/asset-card";

export function FavoritesView({
  workspace,
  project,
}: {
  workspace: StudioWorkspace;
  project: StudioProject;
}) {
  const [favorites, setFavorites] = useState<ViewAsset[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    apiRequest<{ favorites: ViewAsset[] }>(
      `/api/favorites?workspaceId=${workspace.id}&projectId=${project.id}`,
    )
      .then((result) => setFavorites(result.favorites))
      .catch((caught) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "Favorites could not be loaded",
        ),
      );
  }, [project.id, workspace.id]);
  return (
    <section>
      <header className="view-heading">
        <div>
          <p className="eyebrow">PERSONAL COLLECTION</p>
          <h1>Favorites</h1>
          <p>
            Your saved project outputs, queried from authenticated workspace
            data.
          </p>
        </div>
      </header>
      {error && <p className="error-banner">{error}</p>}
      {favorites.length ? (
        <div className="asset-grid">
          {favorites.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              workspaceId={workspace.id}
              projectId={project.id}
              canFavorite={false}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Heart />
          <h2>No favorites yet</h2>
          <p>Use the heart action on a durable result or asset.</p>
        </div>
      )}
    </section>
  );
}
