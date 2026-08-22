"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  FilePlus2,
  Film,
  Image as ImageIcon,
  Info,
  Minus,
  Plus,
  Sparkles,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import {
  PreflightDialog,
  type PreflightData,
} from "@/components/studio/composer/preflight-dialog";
import { apiRequest } from "@/lib/client/api";
import { createClient } from "@/lib/supabase/client";
import type {
  PublicCapability,
  StudioProject,
  StudioWorkspace,
} from "@/lib/studio/types";

type Settings = Record<
  string,
  string | number | boolean | Array<{ prompt: string; duration: number }>
>;
type DraftReference = {
  assetId: string;
  role: string;
  groupId?: string;
  label?: string;
  description?: string;
  startMs?: number;
  endMs?: number;
  startSeconds?: number;
  endSeconds?: number;
  fileName?: string;
};
type Skill = {
  id: string;
  name: string;
  description: string;
  media_scope: "image" | "video" | "both";
  activeVersion: {
    id: string;
    version: number;
    original_filename: string;
    markdown_content: string;
    content_sha256: string;
  } | null;
};

const creativeOptions = {
  genre: [
    "General",
    "Noir",
    "Documentary",
    "Science fiction",
    "Fashion editorial",
    "Product film",
  ],
  era: ["Contemporary", "1970s", "1980s", "1990s", "Near future"],
  tempo: ["Measured", "Contemplative", "Energetic", "Urgent"],
  body: ["Digital cinema", "35mm film", "Large format", "Handheld documentary"],
  lens: ["Natural 50mm", "Anamorphic", "Wide 24mm", "Portrait 85mm", "Macro"],
  aperture: ["f/2 shallow", "f/4 moderate", "f/8 deep"],
  movement: [
    "Static shot",
    "Slow dolly",
    "Handheld",
    "Crane rise",
    "Orbit",
    "Dolly zoom",
  ],
  palette: [
    "Natural",
    "Nocturne",
    "Warm earth",
    "Cool steel",
    "Pastel",
    "Monochrome",
  ],
  lighting: [
    "Natural daylight",
    "Golden hour",
    "Moonlit",
    "High-key studio",
    "Low-key chiaroscuro",
    "Neon reflections",
  ],
};

function defaults(capability: PublicCapability): Settings {
  return Object.fromEntries(
    capability.technical.flatMap((field) =>
      field.defaultValue ? [[field.key, field.defaultValue.value]] : [],
    ),
  );
}

function invalidOptionReason(
  capability: PublicCapability,
  settings: Settings,
  key: string,
  value: string | number | boolean,
) {
  const effective = { ...defaults(capability), ...settings, [key]: value };
  return capability.incompatibilities.find(
    (rule) =>
      Object.entries(rule.when).every(
        ([field, expected]) => effective[field] === expected,
      ) &&
      Object.entries(rule.disallow).some(([field, values]) =>
        values.includes(effective[field] as never),
      ),
  )?.reason;
}

function assetRole(role: string) {
  if (["element_image", "element_video", "element_audio"].includes(role))
    return "element";
  return role;
}

export function GenerationComposer({
  workspace,
  project,
  capabilities,
  onQueue,
}: {
  workspace: StudioWorkspace;
  project: StudioProject;
  capabilities: PublicCapability[];
  onQueue: () => void;
}) {
  const [mediaKind, setMediaKind] = useState<"image" | "video">("video");
  const filtered = useMemo(
    () =>
      capabilities.filter((capability) => capability.mediaKind === mediaKind),
    [capabilities, mediaKind],
  );
  const [modelKey, setModelKey] = useState(filtered[0]?.appModelKey || "");
  const capability =
    capabilities.find(
      (item) => item.appModelKey === modelKey && item.mediaKind === mediaKind,
    ) || filtered[0];
  const [rawPrompt, setRawPrompt] = useState("");
  const [settings, setSettings] = useState<Settings>(() =>
    capability ? defaults(capability) : {},
  );
  const [creative, setCreative] = useState({
    filmSetup: { genre: "General", era: "Contemporary", tempo: "Measured" },
    camera: {
      body: "Digital cinema",
      lens: "Natural 50mm",
      aperture: "f/4 moderate",
      movement: "Static shot",
    },
    palette: "Natural",
    lighting: "Natural daylight",
  });
  const [batchCount, setBatchCount] = useState(1);
  const [references, setReferences] = useState<DraftReference[]>([]);
  const [referenceRole, setReferenceRole] = useState("");
  const [elementGroup, setElementGroup] = useState("element_subject");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [skillPreview, setSkillPreview] = useState<Skill | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preflight, setPreflight] = useState<PreflightData | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [external, setExternal] = useState({
    label: "",
    id: "",
    role: "character",
  });
  const idempotency = useRef("");
  const fileInput = useRef<HTMLInputElement>(null);
  const skillInput = useRef<HTMLInputElement>(null);

  const referenceSpecs = capability?.references || [];
  const uploadSpecs = referenceSpecs.filter(
    (spec) => spec.inputKind !== "external_id",
  );
  const externalSpecs = referenceSpecs.filter(
    (spec) => spec.inputKind === "external_id",
  );

  function selectCapability(next: PublicCapability) {
    setModelKey(next.appModelKey);
    setSettings(defaults(next));
    const roles = new Set(next.references.map((spec) => spec.role));
    setReferences((current) =>
      current.filter((reference) => roles.has(reference.role as never)),
    );
    setReferenceRole(
      next.references.find((spec) => spec.inputKind !== "external_id")?.role ||
        "",
    );
    setPreflight(null);
    idempotency.current = "";
  }

  function selectMediaKind(nextKind: "image" | "video") {
    const next = capabilities.find((item) => item.mediaKind === nextKind);
    setMediaKind(nextKind);
    if (next) selectCapability(next);
  }

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ skills: Skill[] }>(
      `/api/skills?workspaceId=${workspace.id}&mediaKind=${mediaKind}`,
    )
      .then((result) => {
        if (!cancelled) {
          setSkills(result.skills);
          setSelectedSkills((current) =>
            current.filter((id) =>
              result.skills.some((skill) => skill.activeVersion?.id === id),
            ),
          );
        }
      })
      .catch((caught) => {
        if (!cancelled)
          setError(
            caught instanceof Error
              ? caught.message
              : "Skills could not be loaded",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [workspace.id, mediaKind]);

  if (!capability)
    return (
      <section className="empty-state">
        <h2>No verified {mediaKind} capability</h2>
        <p>
          An administrator must install a validated capability contract before
          this mode can submit.
        </p>
      </section>
    );

  function draft() {
    return {
      workspaceId: workspace.id,
      projectId: project.id,
      capabilityKey: capability.appModelKey,
      capabilityVersion: capability.version,
      rawPrompt,
      creativeDirection: creative,
      technicalSettings: settings,
      references: references.map((reference) => ({
        assetId: reference.assetId,
        role: reference.role,
        ...(reference.groupId ? { groupId: reference.groupId } : {}),
        ...(reference.label ? { label: reference.label } : {}),
        ...(reference.description
          ? { description: reference.description }
          : {}),
        ...(reference.startMs !== undefined
          ? { startMs: reference.startMs }
          : {}),
        ...(reference.endMs !== undefined ? { endMs: reference.endMs } : {}),
        ...(reference.startSeconds !== undefined
          ? { startSeconds: reference.startSeconds }
          : {}),
        ...(reference.endSeconds !== undefined
          ? { endSeconds: reference.endSeconds }
          : {}),
      })),
      skillVersionIds: selectedSkills,
      batchCount,
    };
  }

  async function runPreflight() {
    setBusy(true);
    setError("");
    setSubmitError("");
    try {
      const result = await apiRequest<PreflightData>(
        "/api/generations/preflight",
        { method: "POST", body: JSON.stringify(draft()) },
      );
      setPreflight(result);
      idempotency.current = `vf:${crypto.randomUUID()}`;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Preflight failed");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setSubmitError("");
    try {
      await apiRequest("/api/generations", {
        method: "POST",
        body: JSON.stringify({
          ...draft(),
          idempotencyKey: idempotency.current || `vf:${crypto.randomUUID()}`,
        }),
      });
      setPreflight(null);
      setStatus(
        "Batch reserved and submitted. The server will finish it even if this tab closes.",
      );
      onQueue();
    } catch (caught) {
      setSubmitError(
        caught instanceof Error ? caught.message : "Submission failed",
      );
    } finally {
      setBusy(false);
    }
  }

  async function uploadReference(file: File) {
    const spec = referenceSpecs.find((item) => item.role === referenceRole);
    if (!spec) return;
    if (
      !spec.acceptedMimeTypes.includes(file.type) ||
      (spec.maxBytes && file.size > spec.maxBytes)
    ) {
      setError(`That file does not meet ${spec.label} type or size limits.`);
      return;
    }
    setBusy(true);
    setError("");
    setStatus(`Reserving ${file.name}…`);
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
          role: assetRole(referenceRole),
        }),
      });
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("vesperframe-sources")
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
      setReferences((current) => [
        ...current,
        {
          assetId: reservation.assetId,
          role: referenceRole,
          fileName: file.name,
          ...(spec.requiresGroup ? { groupId: elementGroup } : {}),
          ...(referenceRole === "element_video"
            ? { startMs: 0, endMs: 3000 }
            : {}),
          ...(referenceRole === "reference_video" &&
          capability.appModelKey === "gemini-omni-video"
            ? { startSeconds: 0, endSeconds: 5 }
            : {}),
        },
      ]);
      setStatus(`${file.name} is validated and attached as ${spec.label}.`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Reference upload failed",
      );
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function uploadSkill(file: File) {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("name", file.name.replace(/\.md$/i, "").replace(/[-_]+/g, " "));
      form.set("mediaScope", mediaKind);
      await apiRequest(`/api/skills?workspaceId=${workspace.id}`, {
        method: "POST",
        body: form,
      });
      const refreshed = await apiRequest<{ skills: Skill[] }>(
        `/api/skills?workspaceId=${workspace.id}&mediaKind=${mediaKind}`,
      );
      setSkills(refreshed.skills);
      setStatus(
        `${file.name} is versioned and available for explicit selection.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Skill upload failed",
      );
    } finally {
      setBusy(false);
      if (skillInput.current) skillInput.current.value = "";
    }
  }

  async function addExternalReference() {
    if (!external.label.trim() || !external.id.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{ reference: { assetId: string } }>(
        "/api/assets/external",
        {
          method: "POST",
          body: JSON.stringify({
            workspaceId: workspace.id,
            projectId: project.id,
            label: external.label,
            externalId: external.id,
            role: external.role,
          }),
        },
      );
      setReferences((current) => [
        ...current,
        {
          assetId: result.reference.assetId,
          role: external.role,
          label: external.label,
        },
      ]);
      setExternal((current) => ({ ...current, label: "", id: "" }));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Identity reference could not be added",
      );
    } finally {
      setBusy(false);
    }
  }

  const promptMax = capability.prompt.maximum || 20_000;
  return (
    <section className="composer" aria-labelledby="composer-title">
      <header className="view-heading">
        <div>
          <p className="eyebrow">{project.name.toUpperCase()}</p>
          <h1 id="composer-title">Direct the impossible.</h1>
          <p>
            Every enabled control is compiled or mapped by the selected verified
            model contract.
          </p>
        </div>
        <span className="contract-badge">
          <Check /> Capability v{capability.version}
        </span>
      </header>
      <div className="mode-row" role="group" aria-label="Generation media type">
        <button
          className={mediaKind === "image" ? "active" : ""}
          onClick={() => selectMediaKind("image")}
          data-testid="composer-media-mode-image"
        >
          <ImageIcon /> Image
        </button>
        <button
          className={mediaKind === "video" ? "active" : ""}
          onClick={() => selectMediaKind("video")}
          data-testid="composer-media-mode-video"
        >
          <Film /> Video
        </button>
        <label className="model-select">
          <span>Model</span>
          <select
            value={capability.appModelKey}
            onChange={(event) => {
              const next = capabilities.find(
                (item) => item.appModelKey === event.target.value,
              );
              if (next) selectCapability(next);
            }}
            data-testid="composer-model-picker"
          >
            {filtered.map((item) => (
              <option key={item.appModelKey} value={item.appModelKey}>
                {item.displayName} · {item.modelMaker}
              </option>
            ))}
          </select>
          <ChevronDown />
        </label>
      </div>
      <div className="composer-grid">
        <div className="composer-primary">
          <section className="panel prompt-panel">
            <div className="panel-title">
              <span>
                <Sparkles /> Scene prompt
              </span>
              <small>
                {rawPrompt.length}/{promptMax}
              </small>
            </div>
            <textarea
              value={rawPrompt}
              onChange={(event) => {
                setRawPrompt(event.target.value);
                setPreflight(null);
                idempotency.current = "";
              }}
              maxLength={promptMax}
              placeholder="Describe the scene, subject, action, composition, and constraints…"
              data-testid="composer-raw-prompt"
            />
            <div className="prompt-actions">
              <button
                className="button subtle"
                onClick={runPreflight}
                disabled={busy || !rawPrompt.trim()}
                data-testid="prompt-compile-preview"
              >
                <WandSparkles /> Compile preview
              </button>
              <span>Non-destructive: your raw prompt stays unchanged.</span>
            </div>
          </section>
          <section className="panel creative-panel">
            <div className="panel-title">
              <span>
                <Film /> Creative direction
              </span>
              <small>Always compiled on Generate</small>
            </div>
            <div className="field-grid">
              {(["genre", "era", "tempo"] as const).map((key) => (
                <label className="field" key={key}>
                  <span>{key}</span>
                  <select
                    value={creative.filmSetup[key]}
                    onChange={(event) =>
                      setCreative((current) => ({
                        ...current,
                        filmSetup: {
                          ...current.filmSetup,
                          [key]: event.target.value,
                        },
                      }))
                    }
                  >
                    {creativeOptions[key].map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
              ))}
              {(["body", "lens", "aperture", "movement"] as const).map(
                (key) => (
                  <label className="field" key={key}>
                    <span>{key}</span>
                    <select
                      value={creative.camera[key]}
                      onChange={(event) =>
                        setCreative((current) => ({
                          ...current,
                          camera: {
                            ...current.camera,
                            [key]: event.target.value,
                          },
                        }))
                      }
                    >
                      {creativeOptions[key].map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                ),
              )}
              <label className="field">
                <span>Palette</span>
                <select
                  value={creative.palette}
                  onChange={(event) =>
                    setCreative((current) => ({
                      ...current,
                      palette: event.target.value,
                    }))
                  }
                >
                  {creativeOptions.palette.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Lighting</span>
                <select
                  value={creative.lighting}
                  onChange={(event) =>
                    setCreative((current) => ({
                      ...current,
                      lighting: event.target.value,
                    }))
                  }
                >
                  {creativeOptions.lighting.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>
          <section className="panel reference-panel">
            <div className="panel-title">
              <span>
                <FilePlus2 /> References
              </span>
              <small>{references.length} attached</small>
            </div>
            {uploadSpecs.length ? (
              <div className="reference-add-row">
                <label className="field">
                  <span>Reference role</span>
                  <select
                    value={referenceRole}
                    onChange={(event) => setReferenceRole(event.target.value)}
                  >
                    {uploadSpecs.map((spec) => (
                      <option key={spec.role} value={spec.role}>
                        {spec.label} · max {spec.maximum}
                      </option>
                    ))}
                  </select>
                </label>
                {uploadSpecs.find((spec) => spec.role === referenceRole)
                  ?.requiresGroup && (
                  <label className="field">
                    <span>Element name</span>
                    <input
                      value={elementGroup}
                      onChange={(event) => setElementGroup(event.target.value)}
                      pattern="element_[A-Za-z0-9_]+"
                    />
                  </label>
                )}
                <button
                  className="button secondary"
                  onClick={() => fileInput.current?.click()}
                  disabled={busy}
                >
                  <Upload /> Add file
                </button>
                <input
                  ref={fileInput}
                  className="sr-only"
                  type="file"
                  accept={uploadSpecs
                    .find((spec) => spec.role === referenceRole)
                    ?.acceptedMimeTypes.join(",")}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadReference(file);
                  }}
                />
              </div>
            ) : (
              <p className="muted">
                This model contract does not accept uploaded references.
              </p>
            )}
            {externalSpecs.length > 0 && (
              <div className="external-reference">
                <label className="field">
                  <span>Identity role</span>
                  <select
                    value={external.role}
                    onChange={(event) =>
                      setExternal((current) => ({
                        ...current,
                        role: event.target.value,
                      }))
                    }
                  >
                    {externalSpecs.map((spec) => (
                      <option key={spec.role} value={spec.role}>
                        {spec.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Display label</span>
                  <input
                    value={external.label}
                    onChange={(event) =>
                      setExternal((current) => ({
                        ...current,
                        label: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Validated identity ID</span>
                  <input
                    value={external.id}
                    onChange={(event) =>
                      setExternal((current) => ({
                        ...current,
                        id: event.target.value,
                      }))
                    }
                  />
                </label>
                <button
                  className="button secondary"
                  onClick={addExternalReference}
                  disabled={busy || !external.label || !external.id}
                >
                  Add identity
                </button>
              </div>
            )}
            <div className="reference-list">
              {references.map((reference, index) => (
                <span key={`${reference.assetId}-${reference.role}`}>
                  <b>
                    {reference.fileName ||
                      reference.label ||
                      "Validated reference"}
                  </b>
                  <small>
                    {reference.role}
                    {reference.groupId ? ` · ${reference.groupId}` : ""}
                  </small>
                  <button
                    onClick={() =>
                      setReferences((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    aria-label={`Remove ${reference.fileName || reference.role}`}
                  >
                    <X />
                  </button>
                </span>
              ))}
            </div>
          </section>
        </div>
        <aside className="composer-aside">
          <section className="panel settings-panel">
            <div className="panel-title">
              <span>Effective controls</span>
              <Info />
            </div>
            {capability.technical.map((field) => {
              const value = settings[field.key] ?? "";
              if (field.kind === "enum")
                return (
                  <label className="field" key={field.key}>
                    <span>{field.label}</span>
                    <select
                      value={String(value)}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          [field.key]:
                            field.values?.find(
                              (item) => String(item) === event.target.value,
                            ) ?? event.target.value,
                        }))
                      }
                    >
                      {field.values?.map((option) => {
                        const reason = invalidOptionReason(
                          capability,
                          settings,
                          field.key,
                          option,
                        );
                        return (
                          <option
                            key={String(option)}
                            value={String(option)}
                            disabled={Boolean(reason)}
                          >
                            {String(option)}
                            {reason ? " — unavailable" : ""}
                          </option>
                        );
                      })}
                    </select>
                    <small>{field.help}</small>
                  </label>
                );
              if (field.kind === "boolean")
                return (
                  <label className="toggle-field" key={field.key}>
                    <span>
                      <b>{field.label}</b>
                      <small>{field.help}</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={Boolean(value)}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          [field.key]: event.target.checked,
                        }))
                      }
                    />
                  </label>
                );
              if (field.kind === "integer")
                return (
                  <label className="field" key={field.key}>
                    <span>{field.label}</span>
                    <input
                      type="number"
                      value={Number(value)}
                      min={field.minimum}
                      max={field.maximum}
                      step={field.step || 1}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          [field.key]: Number(event.target.value),
                        }))
                      }
                    />
                    <small>{field.help}</small>
                  </label>
                );
              return (
                <label className="field" key={field.key}>
                  <span>{field.label}</span>
                  <input
                    value={String(value)}
                    maxLength={field.maxLength}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                  />
                  <small>{field.help}</small>
                </label>
              );
            })}
            {settings.multiShots === true && capability.multiShot && (
              <div className="shot-editor">
                <b>Shot prompts</b>
                {(
                  (settings.multiPrompt as Array<{
                    prompt: string;
                    duration: number;
                  }>) || [{ prompt: "", duration: 3 }]
                ).map((shot, index, shots) => (
                  <div key={index}>
                    <textarea
                      value={shot.prompt}
                      maxLength={capability.multiShot!.promptMaxLength}
                      placeholder={`Shot ${index + 1}`}
                      onChange={(event) => {
                        const next = [...shots];
                        next[index] = { ...shot, prompt: event.target.value };
                        setSettings((current) => ({
                          ...current,
                          multiPrompt: next,
                        }));
                      }}
                    />
                    <input
                      type="number"
                      value={shot.duration}
                      min={capability.multiShot!.shotDurationMinimum}
                      max={capability.multiShot!.shotDurationMaximum}
                      onChange={(event) => {
                        const next = [...shots];
                        next[index] = {
                          ...shot,
                          duration: Number(event.target.value),
                        };
                        setSettings((current) => ({
                          ...current,
                          multiPrompt: next,
                        }));
                      }}
                    />
                  </div>
                ))}
                <button
                  className="button subtle"
                  onClick={() => {
                    const shots =
                      (settings.multiPrompt as Array<{
                        prompt: string;
                        duration: number;
                      }>) || [];
                    setSettings((current) => ({
                      ...current,
                      multiPrompt: [...shots, { prompt: "", duration: 3 }],
                    }));
                  }}
                  disabled={
                    ((settings.multiPrompt as unknown[]) || []).length >=
                    capability.multiShot.maximumShots
                  }
                >
                  <Plus /> Add shot
                </button>
              </div>
            )}
          </section>
          <section className="panel skills-panel">
            <div className="panel-title">
              <span>
                <Sparkles /> Generation Skills
              </span>
              <small>Optional</small>
            </div>
            <p>
              Selected Markdown is hash-verified and attached verbatim to every
              compiled prompt.
            </p>
            <details className="skill-selector">
              <summary>
                {selectedSkills.length
                  ? `${selectedSkills.length} selected`
                  : "Choose skills"}
                <ChevronDown />
              </summary>
              <div>
                {skills.length ? (
                  skills.map((skill) => (
                    <label key={skill.id}>
                      <input
                        type="checkbox"
                        checked={Boolean(
                          skill.activeVersion &&
                            selectedSkills.includes(skill.activeVersion.id),
                        )}
                        disabled={!skill.activeVersion}
                        onChange={(event) => {
                          const id = skill.activeVersion!.id;
                          setSelectedSkills((current) =>
                            event.target.checked
                              ? [...current, id]
                              : current.filter((item) => item !== id),
                          );
                        }}
                      />
                      <span>
                        <b>{skill.name}</b>
                        <small>
                          v{skill.activeVersion?.version} · {skill.media_scope}
                        </small>
                      </span>
                      <button
                        type="button"
                        onClick={() => setSkillPreview(skill)}
                      >
                        Preview
                      </button>
                    </label>
                  ))
                ) : (
                  <p>No skills uploaded for this media type.</p>
                )}
              </div>
            </details>
            <button
              className="button secondary full"
              onClick={() => skillInput.current?.click()}
              disabled={busy}
            >
              <FilePlus2 /> Upload .md skill
            </button>
            <input
              ref={skillInput}
              className="sr-only"
              type="file"
              accept=".md,text/markdown,text/plain"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadSkill(file);
              }}
            />
            <small>
              Skill content never executes and cannot alter app permissions or
              safety controls.
            </small>
          </section>
          <section className="panel submit-panel">
            <div className="batch-control">
              <span>
                <b>Batch count</b>
                <small>Server quota is checked before spend.</small>
              </span>
              <button
                onClick={() => setBatchCount((value) => Math.max(1, value - 1))}
                disabled={batchCount <= 1}
              >
                <Minus />
              </button>
              <b>{batchCount}</b>
              <button
                onClick={() => setBatchCount((value) => Math.min(4, value + 1))}
                disabled={batchCount >= 4}
              >
                <Plus />
              </button>
            </div>
            <button
              className="generate-button"
              onClick={runPreflight}
              disabled={
                busy ||
                !rawPrompt.trim() ||
                workspace.role === "viewer" ||
                !workspace.generationAllowed
              }
            >
              {busy ? "Validating…" : "Generate"}
              <Sparkles />
            </button>
            <small>
              {workspace.role === "viewer"
                ? "Viewers cannot spend."
                : "Preflight opens before any spend."}
            </small>
          </section>
        </aside>
      </div>
      {(error || status) && (
        <div
          className={error ? "toast error" : "toast"}
          role={error ? "alert" : "status"}
        >
          {error || status}
          <button
            onClick={() => {
              setError("");
              setStatus("");
            }}
            aria-label="Dismiss message"
          >
            <X />
          </button>
        </div>
      )}
      {preflight && (
        <PreflightDialog
          rawPrompt={rawPrompt}
          preflight={preflight}
          busy={busy}
          submitError={submitError}
          onClose={() => {
            setPreflight(null);
            setSubmitError("");
          }}
          onSubmit={submit}
        />
      )}
      {skillPreview?.activeVersion && (
        <dialog
          open
          className="vf-dialog skill-preview"
          aria-labelledby="skill-preview-title"
        >
          <button
            className="icon-button dialog-close"
            onClick={() => setSkillPreview(null)}
            aria-label="Close skill preview"
          >
            <X />
          </button>
          <p className="eyebrow">
            GENERATION SKILL · V{skillPreview.activeVersion.version}
          </p>
          <h2 id="skill-preview-title">{skillPreview.name}</h2>
          <p>SHA-256 {skillPreview.activeVersion.content_sha256}</p>
          <pre>{skillPreview.activeVersion.markdown_content}</pre>
          <button
            className="button primary"
            onClick={() => setSkillPreview(null)}
          >
            Done
          </button>
        </dialog>
      )}
    </section>
  );
}
