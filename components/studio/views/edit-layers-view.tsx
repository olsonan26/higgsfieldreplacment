"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Layers3,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { apiRequest } from "@/lib/client/api";
import type { StudioProject, StudioWorkspace } from "@/lib/studio/types";
import type { ViewAsset } from "@/components/studio/views/asset-card";

type Layer = {
  asset: ViewAsset;
  opacity: number;
  blend: "over" | "multiply" | "screen" | "overlay";
};

export function EditLayersView({
  workspace,
  project,
}: {
  workspace: StudioWorkspace;
  project: StudioProject;
}) {
  const [assets, setAssets] = useState<ViewAsset[]>([]);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [name, setName] = useState("VesperFrame composite");
  const [adjustments, setAdjustments] = useState({
    brightness: 1,
    saturation: 1,
    blur: 0,
    sharpen: 0,
    rotate: 0 as 0 | 90 | 180 | 270,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest<{ assets: ViewAsset[] }>(
        `/api/assets?workspaceId=${workspace.id}&projectId=${project.id}`,
      );
      setAssets(
        result.assets.filter(
          (asset) => asset.media_kind === "image" && asset.previewUrl,
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Images could not be loaded",
      );
    } finally {
      setLoading(false);
    }
  }, [project.id, workspace.id]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function add(asset: ViewAsset) {
    if (
      layers.some((layer) => layer.asset.id === asset.id) ||
      layers.length >= 5
    )
      return;
    setLayers((current) => [...current, { asset, opacity: 1, blend: "over" }]);
  }
  function update(index: number, patch: Partial<Layer>) {
    setLayers((current) =>
      current.map((layer, itemIndex) =>
        itemIndex === index ? { ...layer, ...patch } : layer,
      ),
    );
  }
  function move(index: number, direction: -1 | 1) {
    setLayers((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  async function save() {
    setSaving(true);
    setError("");
    setStatus("");
    try {
      await apiRequest("/api/assets/edit-layers", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: workspace.id,
          projectId: project.id,
          name,
          layers: layers.map((layer) => ({
            assetId: layer.asset.id,
            opacity: layer.opacity,
            blend: layer.blend,
          })),
          adjustments,
        }),
      });
      setStatus("A new durable composite was saved to My elements.");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Composite could not be saved",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="layers-view">
      <header className="view-heading">
        <div>
          <p className="eyebrow">EDIT LAYERS</p>
          <h1>Build a new frame.</h1>
          <p>
            Stack up to five private project images, tune the composite, and
            save a new flattened asset without changing any source file.
          </p>
        </div>
        <button className="button secondary" onClick={load} disabled={loading}>
          <RefreshCw className={loading ? "spin" : ""} /> Refresh assets
        </button>
      </header>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="success-banner" role="status">
          <Check /> {status}
        </p>
      )}
      <div className="layers-workbench">
        <aside className="panel layer-source-panel">
          <div className="panel-title">
            <span>Project images</span>
            <small>{assets.length} available</small>
          </div>
          <div className="layer-source-grid">
            {assets.map((asset) => (
              <button
                key={asset.id}
                onClick={() => add(asset)}
                disabled={
                  layers.length >= 5 ||
                  layers.some((layer) => layer.asset.id === asset.id)
                }
              >
                <span>
                  <Image
                    src={asset.previewUrl!}
                    alt=""
                    fill
                    sizes="140px"
                    unoptimized
                  />
                </span>
                <strong>{asset.safe_filename}</strong>
                <Plus />
              </button>
            ))}
          </div>
        </aside>
        <div className="layer-editor-main">
          <div className="layer-preview" aria-label="Layer composite preview">
            {layers.length ? (
              layers.map((layer, index) => (
                <Image
                  key={layer.asset.id}
                  src={layer.asset.previewUrl!}
                  alt={index === 0 ? layer.asset.safe_filename : ""}
                  fill
                  sizes="(max-width: 900px) 100vw, 60vw"
                  unoptimized
                  style={{
                    objectFit: "contain",
                    opacity: layer.opacity,
                    mixBlendMode:
                      layer.blend === "over" ? "normal" : layer.blend,
                    transform: `rotate(${adjustments.rotate}deg)`,
                    filter: `brightness(${adjustments.brightness}) saturate(${adjustments.saturation}) blur(${adjustments.blur}px)`,
                  }}
                />
              ))
            ) : (
              <div>
                <Layers3 />
                <h2>Add a base image</h2>
                <p>Select an image from the project library to begin.</p>
              </div>
            )}
          </div>
          <section className="panel layer-stack-panel">
            <div className="panel-title">
              <span>Layer stack</span>
              <small>Bottom to top</small>
            </div>
            <div className="layer-stack">
              {layers.map((layer, index) => (
                <div key={layer.asset.id}>
                  <span>{index + 1}</span>
                  <strong>{layer.asset.safe_filename}</strong>
                  <label>
                    Opacity
                    <input
                      type="range"
                      min="0.05"
                      max="1"
                      step="0.05"
                      value={layer.opacity}
                      onChange={(event) =>
                        update(index, { opacity: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Blend
                    <select
                      value={layer.blend}
                      onChange={(event) =>
                        update(index, {
                          blend: event.target.value as Layer["blend"],
                        })
                      }
                    >
                      <option value="over">Normal</option>
                      <option value="multiply">Multiply</option>
                      <option value="screen">Screen</option>
                      <option value="overlay">Overlay</option>
                    </select>
                  </label>
                  <button
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label="Move layer down"
                  >
                    <ArrowDown />
                  </button>
                  <button
                    onClick={() => move(index, 1)}
                    disabled={index === layers.length - 1}
                    aria-label="Move layer up"
                  >
                    <ArrowUp />
                  </button>
                  <button
                    onClick={() =>
                      setLayers((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    aria-label="Remove layer"
                  >
                    <Trash2 />
                  </button>
                </div>
              ))}
            </div>
          </section>
          <section className="panel layer-adjustments">
            <div className="panel-title">
              <span>Finish</span>
            </div>
            <div className="field-grid">
              {(["brightness", "saturation", "blur", "sharpen"] as const).map(
                (key) => (
                  <label className="field" key={key}>
                    <span>{key}</span>
                    <input
                      type="number"
                      value={adjustments[key]}
                      min={0}
                      max={
                        key === "brightness" || key === "saturation"
                          ? 2
                          : key === "blur"
                            ? 20
                            : 10
                      }
                      step={
                        key === "brightness" || key === "saturation"
                          ? 0.05
                          : 0.5
                      }
                      onChange={(event) =>
                        setAdjustments((current) => ({
                          ...current,
                          [key]: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                ),
              )}
              <label className="field">
                <span>Rotate</span>
                <select
                  value={adjustments.rotate}
                  onChange={(event) =>
                    setAdjustments((current) => ({
                      ...current,
                      rotate: Number(event.target.value) as 0 | 90 | 180 | 270,
                    }))
                  }
                >
                  <option value="0">0°</option>
                  <option value="90">90°</option>
                  <option value="180">180°</option>
                  <option value="270">270°</option>
                </select>
              </label>
              <label className="field layer-name-field">
                <span>Saved asset name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={120}
                />
              </label>
            </div>
            <button
              className="button primary"
              onClick={() => void save()}
              disabled={
                saving || !layers.length || !name || workspace.role === "viewer"
              }
              data-testid="layer-save"
            >
              <Save /> {saving ? "Rendering…" : "Save new composite"}
            </button>
          </section>
        </div>
      </div>
    </section>
  );
}
