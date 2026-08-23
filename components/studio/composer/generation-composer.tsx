"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  ChevronDown,
  Clapperboard,
  FilePlus2,
  Film,
  Image as ImageIcon,
  Lightbulb,
  Minus,
  Palette,
  Plus,
  Settings2,
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
  PromptVersion,
  PublicCapability,
  StudioProject,
  StudioProjectDraft,
  StudioWorkspace,
} from "@/lib/studio/types";
import { AssetLibrary } from "@/components/studio/views/asset-library";

type Settings = Record<
  string,
  string | number | boolean | Array<{ prompt: string; duration: number }>
>;
type TechnicalField = PublicCapability["technical"][number];
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

function DirectionDialog({
  title,
  eyebrow,
  onClose,
  children,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => dialog.current?.showModal(), []);
  return (
    <dialog
      ref={dialog}
      className="vf-dialog direction-dialog"
      onClose={onClose}
      aria-labelledby="direction-dialog-title"
    >
      <button
        className="icon-button dialog-close"
        onClick={() => dialog.current?.close()}
        aria-label={`Close ${title}`}
      >
        <X />
      </button>
      <p className="eyebrow">{eyebrow}</p>
      <h2 id="direction-dialog-title">{title}</h2>
      {children}
    </dialog>
  );
}

export function GenerationComposer({
  workspace,
  project,
  capabilities,
  mediaKind,
  onMediaKindChange,
  restoredPrompt,
  initialDraft,
  onQueue,
  onExplore,
}: {
  workspace: StudioWorkspace;
  project: StudioProject;
  capabilities: PublicCapability[];
  mediaKind: "image" | "video";
  onMediaKindChange: (kind: "image" | "video") => void;
  restoredPrompt: PromptVersion | null;
  initialDraft: Record<string, unknown> | null;
  onQueue: () => void;
  onExplore: () => void;
}) {
  const filtered = useMemo(
    () =>
      capabilities.filter((capability) => capability.mediaKind === mediaKind),
    [capabilities, mediaKind],
  );
  const savedDraft =
    initialDraft?.mediaKind === mediaKind &&
    typeof initialDraft.capabilityKey === "string" &&
    typeof initialDraft.rawPrompt === "string"
      ? (initialDraft as StudioProjectDraft)
      : null;
  const restoredCapability = restoredPrompt?.capability
    ? capabilities.find(
        (item) =>
          item.appModelKey === restoredPrompt.capability?.app_model_key &&
          item.version === restoredPrompt.capability.version &&
          item.mediaKind === mediaKind,
      )
    : undefined;
  const savedCapability = savedDraft
    ? capabilities.find(
        (item) =>
          item.appModelKey === savedDraft.capabilityKey &&
          item.mediaKind === mediaKind,
      )
    : undefined;
  const [modelKey, setModelKey] = useState(
    restoredCapability?.appModelKey ||
      savedCapability?.appModelKey ||
      filtered[0]?.appModelKey ||
      "",
  );
  const capability =
    capabilities.find(
      (item) => item.appModelKey === modelKey && item.mediaKind === mediaKind,
    ) || filtered[0];
  const [rawPrompt, setRawPrompt] = useState(
    restoredPrompt?.raw_prompt || savedDraft?.rawPrompt || "",
  );
  const [settings, setSettings] = useState<Settings>(() =>
    restoredPrompt
      ? (restoredPrompt.technical_settings as Settings)
      : savedDraft
        ? (savedDraft.technicalSettings as Settings)
        : capability
          ? defaults(capability)
          : {},
  );
  const [creative, setCreative] = useState(() => ({
    filmSetup: { genre: "General", era: "Contemporary", tempo: "Measured" },
    camera: {
      body: "Digital cinema",
      lens: "Natural 50mm",
      aperture: "f/4 moderate",
      movement: "Static shot",
    },
    palette: "Natural",
    lighting: "Natural daylight",
    ...(savedDraft?.creativeDirection || {}),
    ...(restoredPrompt?.creative_direction as Record<string, unknown>),
  }));
  const [batchCount, setBatchCount] = useState(savedDraft?.batchCount || 1);
  const [references, setReferences] = useState<DraftReference[]>(
    savedDraft?.references || [],
  );
  const [referenceRole, setReferenceRole] = useState("");
  const [elementGroup, setElementGroup] = useState("element_subject");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>(
    savedDraft?.skillVersionIds || [],
  );
  const [skillPreview, setSkillPreview] = useState<Skill | null>(null);
  const [status, setStatus] = useState(
    restoredPrompt ? `Prompt version ${restoredPrompt.version} restored.` : "",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preflight, setPreflight] = useState<PreflightData | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [directionPanel, setDirectionPanel] = useState<
    | "film"
    | "camera"
    | "palette"
    | "lighting"
    | "references"
    | "settings"
    | "skills"
    | null
  >(null);
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
    onMediaKindChange(nextKind);
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

  useEffect(() => {
    if (!capability || workspace.role === "viewer") return;
    const timer = window.setTimeout(() => {
      void apiRequest("/api/project-settings", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: workspace.id,
          projectId: project.id,
          settings: {
            mediaKind,
            capabilityKey: capability.appModelKey,
            rawPrompt,
            creativeDirection: creative,
            technicalSettings: settings,
            references,
            skillVersionIds: selectedSkills,
            batchCount,
          },
        }),
      }).catch((caught) =>
        setError(
          caught instanceof Error
            ? `Draft save failed: ${caught.message}`
            : "Draft save failed",
        ),
      );
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [
    batchCount,
    capability,
    creative,
    mediaKind,
    project.id,
    rawPrompt,
    references,
    selectedSkills,
    settings,
    workspace.id,
    workspace.role,
  ]);

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
      if (workspace.role !== "viewer") {
        await apiRequest("/api/prompt-versions", {
          method: "POST",
          body: JSON.stringify({
            action: "save",
            workspaceId: workspace.id,
            projectId: project.id,
            rawPrompt,
            compiledPrompt: result.compiledPrompt,
            creativeDirection: creative,
            technicalSettings: result.effectiveSettings,
            capabilityKey: capability.appModelKey,
            capabilityVersion: capability.version,
          }),
        });
      }
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
  function renderTechnicalField(field: TechnicalField, compact = false) {
    const value = settings[field.key] ?? "";
    const className = compact ? "compact-technical-field" : "field";
    if (field.kind === "enum")
      return (
        <label className={className} key={field.key}>
          <span>{field.label}</span>
          <select
            value={String(value)}
            aria-label={field.label + (field.help ? " " + field.help : "")}
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
          {!compact && <small>{field.help}</small>}
        </label>
      );
    if (field.kind === "boolean")
      return (
        <label
          className={compact ? "compact-toggle-field" : "toggle-field"}
          key={field.key}
        >
          <span>
            <b>{field.label}</b>
            {!compact && <small>{field.help}</small>}
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
        <label className={className} key={field.key}>
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
          {!compact && <small>{field.help}</small>}
        </label>
      );
    return (
      <label className={className} key={field.key}>
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
        {!compact && <small>{field.help}</small>}
      </label>
    );
  }

  return (
    <section
      className="composer cinematic-composer"
      aria-labelledby="composer-title"
    >
      <section
        className="cinematic-hero"
        aria-label="VesperFrame production mood board"
      >
        <div className="poster-stack" aria-hidden="true">
          <div
            className="poster side left"
            style={{
              backgroundImage:
                "url(https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=900&q=85)",
            }}
          >
            <span>AFTER HOURS</span>
          </div>
          <div
            className="poster center"
            style={{
              backgroundImage:
                "url(https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=900&q=85)",
            }}
          >
            <span>VESPERFRAME ORIGINAL</span>
            <strong>NIGHT DRIVE</strong>
          </div>
          <div
            className="poster side right"
            style={{
              backgroundImage:
                "url(https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=900&q=85)",
            }}
          >
            <span>ZEPHYR</span>
          </div>
        </div>
        <p className="eyebrow">
          {project.name.toUpperCase()} · PRIVATE MOOD BOARD
        </p>
        <h1 id="composer-title">BRING YOUR STORIES TO LIFE</h1>
        <p>
          Direct every detail. Choose a verified model. Keep the references,
          versions, outputs, and receipts.
        </p>
      </section>

      <section className="production-composer" aria-label="Generation composer">
        <div className="direction-toolbar">
          <button
            className="reference-count-button"
            onClick={() => setDirectionPanel("references")}
            data-testid="reference-add"
          >
            <Plus />
            <span>
              <small>REFERENCES</small>
              <strong>
                {references.length}/
                {capability.combinedMediaQuota?.limit ??
                  capability.references.reduce(
                    (total, reference) => total + reference.maximum,
                    0,
                  )}
              </strong>
            </span>
          </button>
          <button
            onClick={() => setDirectionPanel("film")}
            data-testid="creative-film"
          >
            <Clapperboard />
            <span>
              <small>FILM SETUP</small>
              <strong>{creative.filmSetup.genre}</strong>
            </span>
          </button>
          <button
            onClick={() => setDirectionPanel("camera")}
            data-testid="creative-camera"
          >
            <Camera />
            <span>
              <small>CAMERA</small>
              <strong>{creative.camera.movement}</strong>
            </span>
          </button>
          <button
            onClick={() => setDirectionPanel("palette")}
            data-testid="creative-palette"
          >
            <Palette />
            <span>
              <small>COLOR PALETTE</small>
              <strong>{creative.palette}</strong>
            </span>
          </button>
          <button
            onClick={() => setDirectionPanel("lighting")}
            data-testid="creative-lighting"
          >
            <Lightbulb />
            <span>
              <small>LIGHTING</small>
              <strong>{creative.lighting}</strong>
            </span>
          </button>
        </div>

        <div className="prompt-workspace">
          <div
            className="media-rail"
            role="group"
            aria-label="Generation media type"
          >
            <button
              className={mediaKind === "image" ? "active" : ""}
              onClick={() => selectMediaKind("image")}
              data-testid="composer-media-mode-image"
            >
              <ImageIcon />
              <span>Image</span>
            </button>
            <button
              className={mediaKind === "video" ? "active" : ""}
              onClick={() => selectMediaKind("video")}
              data-testid="composer-media-mode-video"
            >
              <Film />
              <span>Video</span>
            </button>
          </div>
          <div className="prompt-canvas">
            <label className="sr-only" htmlFor="scene-prompt">
              Scene prompt
            </label>
            <textarea
              id="scene-prompt"
              value={rawPrompt}
              onChange={(event) => setRawPrompt(event.target.value)}
              maxLength={promptMax}
              placeholder="Describe your scene — use references and direct every detail"
              data-testid="composer-raw-prompt"
            />
            <span className="prompt-count">
              {rawPrompt.length}/{promptMax}
            </span>
            <button
              className="refine-button"
              onClick={runPreflight}
              disabled={busy || !rawPrompt.trim()}
              data-testid="prompt-compile-preview"
            >
              <WandSparkles /> Refine
            </button>
          </div>
          <button
            className="cinematic-generate"
            onClick={runPreflight}
            disabled={
              busy ||
              !rawPrompt.trim() ||
              workspace.role === "viewer" ||
              !workspace.generationAllowed
            }
            data-testid="generation-preflight"
          >
            <span>{busy ? "VALIDATING" : "GENERATE"}</span>
            <small>
              <Sparkles /> Review before spend
            </small>
          </button>
        </div>

        <div className="composer-control-strip">
          <button
            className="control-add"
            onClick={() => setDirectionPanel("references")}
            aria-label="Add reference"
          >
            <Plus />
          </button>
          <label className="compact-model-field">
            <Sparkles />
            <span className="sr-only">Model</span>
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
                  {item.displayName}
                </option>
              ))}
            </select>
            <ChevronDown />
          </label>
          {capability.technical
            .slice(0, 4)
            .map((field) => renderTechnicalField(field, true))}
          {capability.technical.length > 4 && (
            <button
              className="more-settings-button"
              onClick={() => setDirectionPanel("settings")}
            >
              <Settings2 />
              <span>All settings</span>
            </button>
          )}
          <button
            className="skills-control"
            onClick={() => setDirectionPanel("skills")}
            data-testid="skill-selector"
          >
            <FilePlus2 />
            <span>
              {selectedSkills.length
                ? selectedSkills.length + " skills"
                : "Skills"}
            </span>
          </button>
          <div className="compact-batch" data-testid="batch-count">
            <button
              onClick={() => setBatchCount((value) => Math.max(1, value - 1))}
              disabled={batchCount <= 1}
              aria-label="Decrease batch"
            >
              <Minus />
            </button>
            <span>{batchCount}/4</span>
            <button
              onClick={() => setBatchCount((value) => Math.min(4, value + 1))}
              disabled={batchCount >= 4}
              aria-label="Increase batch"
            >
              <Plus />
            </button>
          </div>
        </div>
      </section>

      <AssetLibrary
        workspace={workspace}
        project={project}
        variant="compact"
        limit={8}
        onExplore={onExplore}
      />

      {directionPanel === "film" && (
        <DirectionDialog
          title="Film setup"
          eyebrow="CREATIVE DIRECTION · ALWAYS COMPILED"
          onClose={() => setDirectionPanel(null)}
        >
          <div className="direction-fields">
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
          </div>
          <p className="direction-note">
            These choices are compiled automatically on Refine and Generate.
          </p>
        </DirectionDialog>
      )}
      {directionPanel === "camera" && (
        <DirectionDialog
          title="Camera"
          eyebrow="CAMERA SYSTEM · ALWAYS COMPILED"
          onClose={() => setDirectionPanel(null)}
        >
          <div className="direction-fields camera-fields">
            {(["body", "lens", "aperture", "movement"] as const).map((key) => (
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
            ))}
          </div>
          <p className="direction-note">
            The selected body, lens, aperture, and movement are included once in
            the deterministic compiled prompt.
          </p>
        </DirectionDialog>
      )}
      {directionPanel === "palette" && (
        <DirectionDialog
          title="Color palette"
          eyebrow="COLOR DIRECTION · ALWAYS COMPILED"
          onClose={() => setDirectionPanel(null)}
        >
          <div className="cinematic-choice-grid">
            {creativeOptions.palette.map((item) => (
              <button
                key={item}
                className={creative.palette === item ? "active" : ""}
                onClick={() =>
                  setCreative((current) => ({ ...current, palette: item }))
                }
              >
                <Palette />
                <strong>{item}</strong>
                {creative.palette === item && <Check />}
              </button>
            ))}
          </div>
        </DirectionDialog>
      )}
      {directionPanel === "lighting" && (
        <DirectionDialog
          title="Lighting"
          eyebrow="LIGHTING DIRECTION · ALWAYS COMPILED"
          onClose={() => setDirectionPanel(null)}
        >
          <div className="cinematic-choice-grid">
            {creativeOptions.lighting.map((item) => (
              <button
                key={item}
                className={creative.lighting === item ? "active" : ""}
                onClick={() =>
                  setCreative((current) => ({ ...current, lighting: item }))
                }
              >
                <Lightbulb />
                <strong>{item}</strong>
                {creative.lighting === item && <Check />}
              </button>
            ))}
          </div>
        </DirectionDialog>
      )}
      {directionPanel === "references" && (
        <DirectionDialog
          title="Add references"
          eyebrow="PRIVATE INPUTS · CAPABILITY-AWARE"
          onClose={() => setDirectionPanel(null)}
        >
          <div className="reference-dialog-content">
            {uploadSpecs.length ? (
              <div className="reference-add-row">
                <label className="field">
                  <span>Reference role</span>
                  <select
                    value={referenceRole}
                    onChange={(event) => setReferenceRole(event.target.value)}
                    data-testid="reference-role"
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
                  className="button primary"
                  onClick={() => fileInput.current?.click()}
                  disabled={busy}
                >
                  <Upload /> Choose file
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
                This verified model contract does not accept uploaded
                references.
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
                <span key={reference.assetId + "-" + reference.role}>
                  <b>
                    {reference.fileName ||
                      reference.label ||
                      "Validated reference"}
                  </b>
                  <small>
                    {reference.role}
                    {reference.groupId ? " · " + reference.groupId : ""}
                  </small>
                  <button
                    onClick={() =>
                      setReferences((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    aria-label={
                      "Remove " + (reference.fileName || reference.role)
                    }
                  >
                    <X />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </DirectionDialog>
      )}
      {directionPanel === "settings" && (
        <DirectionDialog
          title="Exact model settings"
          eyebrow={"VERIFIED CONTRACT · V" + capability.version}
          onClose={() => setDirectionPanel(null)}
        >
          <div className="direction-fields technical-dialog-fields">
            {capability.technical.map((field) => renderTechnicalField(field))}
          </div>
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
                    placeholder={"Shot " + (index + 1)}
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
        </DirectionDialog>
      )}
      {directionPanel === "skills" && (
        <DirectionDialog
          title="Generation Skills"
          eyebrow="OPTIONAL · HASH-VERIFIED MARKDOWN"
          onClose={() => setDirectionPanel(null)}
        >
          <p className="direction-note">
            Selected skill text is attached once to every compiled prompt. It
            cannot execute code or change application permissions.
          </p>
          <div className="skill-dialog-list">
            {skills.length ? (
              skills.map((skill) => (
                <label key={skill.id}>
                  <input
                    type="checkbox"
                    checked={Boolean(
                      skill.activeVersion &&
                        selectedSkills.includes(skill.activeVersion.id),
                    )}
                    disabled={
                      !skill.activeVersion ||
                      (!selectedSkills.includes(skill.activeVersion.id) &&
                        selectedSkills.length >= 5)
                    }
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
                  <button type="button" onClick={() => setSkillPreview(skill)}>
                    Preview
                  </button>
                </label>
              ))
            ) : (
              <p>No skills uploaded for this media type.</p>
            )}
          </div>
          <button
            className="button secondary"
            onClick={() => skillInput.current?.click()}
            disabled={busy}
            data-testid="skill-upload"
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
        </DirectionDialog>
      )}
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
