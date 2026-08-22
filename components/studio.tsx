"use client";

/* Provider result URLs are dynamic and cannot be safely allow-listed for next/image. */
/* eslint-disable @next/next/no-img-element */

import {
  Aperture,
  ArrowDownToLine,
  AudioLines,
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clapperboard,
  Clock3,
  Download,
  Film,
  Gauge,
  Heart,
  Home,
  ImageIcon,
  KeyRound,
  Layers3,
  Lightbulb,
  Menu,
  Mic2,
  MonitorPlay,
  Moon,
  MoreHorizontal,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  SunMedium,
  Trash2,
  Upload,
  Video,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { MediaKind, KieModel, modelById, modelsFor } from "@/lib/models";

type View = "home" | "elements" | "favorites" | "queue" | "ledger";
type ModalName = "settings" | "models" | "film" | "camera" | "palette" | "lighting" | "confirm" | null;

type Connection = {
  connected: boolean;
  verified?: boolean;
  source: "server" | "session" | "none";
  credits: number | null;
  error?: string;
};

type ReferenceAsset = {
  id: string;
  name: string;
  url: string;
  type: "image" | "video" | "audio";
  createdAt: string;
};

type GenerationJob = {
  id: string;
  taskId: string;
  model: string;
  modelLabel: string;
  kind: MediaKind;
  prompt: string;
  state: string;
  progress: number;
  resultUrls: string[];
  createdAt: string;
  creditsBefore?: number | null;
  creditsConsumed?: number;
  failure?: string;
};

type GalleryItem = {
  id: string;
  title: string;
  creator: string;
  views: string;
  image: string;
};

const STORAGE = "higgsfield-replacement-studio-v1";

const GALLERY: GalleryItem[] = [
  { id: "red-signal", title: "Red Signal", creator: "Studio Archive", views: "18.7K", image: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=900&q=85" },
  { id: "night-drive", title: "Night Drive", creator: "Aperture Lab", views: "42.1K", image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=900&q=85" },
  { id: "oneiric", title: "Oneiric", creator: "Private Studio", views: "57.2K", image: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=85" },
  { id: "after-hours", title: "After Hours", creator: "Studio Archive", views: "135.8K", image: "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=900&q=85" },
  { id: "zephyr", title: "Zephyr", creator: "Aperture Lab", views: "210.9K", image: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=900&q=85" },
  { id: "halation", title: "Halation", creator: "Private Studio", views: "44.6K", image: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=900&q=85" },
  { id: "nocturne", title: "Nocturne", creator: "Studio Archive", views: "88.4K", image: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=85" },
  { id: "north-star", title: "North Star", creator: "Aperture Lab", views: "31.5K", image: "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=900&q=85" },
];

const CAMERA_MOVES = ["Snorricam", "Robot arm", "Tilt up", "Rack focus", "Tilt down", "POV", "Pan left", "Crane up", "Pan right", "Drone orbit", "Dolly zoom", "Handheld"];
const GENRES = ["General", "Action", "Documentary", "Dreamlike", "Horror", "Romance"];
const ERAS = ["1960s", "1980s", "1990s", "2000s", "2020s", "Auto"];
const TEMPOS = ["Contemplative", "Slow burn", "Measured", "Energetic", "Frenetic", "Auto"];
const PALETTES = [
  { name: "Auto", colors: ["#e7e7e2", "#777b81", "#111214"] },
  { name: "Nocturne", colors: ["#06080e", "#2c4c69", "#d8b46b"] },
  { name: "Bleach bypass", colors: ["#11120f", "#7a7b6f", "#d4d2c1"] },
  { name: "Emerald city", colors: ["#001e1c", "#00a87b", "#d6ff70"] },
  { name: "Candy noir", colors: ["#1d0928", "#e43b8e", "#78d6ec"] },
  { name: "Desert film", colors: ["#552f1f", "#bf8055", "#f4d29a"] },
];
const LIGHTING = ["Auto", "Soft window", "Hard noon", "Moonlit", "Neon spill", "Golden hour", "Volumetric", "Studio rim"];

const isVideoUrl = (url: string) => /\.(mp4|mov|webm)(\?|$)/i.test(url);
const isAudioUrl = (url: string) => /\.(mp3|wav|m4a|aac)(\?|$)/i.test(url);

function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function mergeInput(model: KieModel | undefined, prompt: string, aspect: string, resolution: string, duration: number, sound: boolean, refs: ReferenceAsset[], advanced: string) {
  let custom: Record<string, unknown> = {};
  if (advanced.trim()) custom = JSON.parse(advanced);
  const input: Record<string, unknown> = { ...(model?.defaults || {}), ...custom, prompt };
  if (model?.id.startsWith("wan/")) input.ratio = aspect;
  else if ("aspect_ratio" in input) input.aspect_ratio = aspect;
  if ("resolution" in input) input.resolution = resolution;
  if ("duration" in input) input.duration = typeof model?.defaults.duration === "string" ? String(duration) : duration;
  if ("generate_audio" in input) input.generate_audio = sound;
  if ("sound" in input) input.sound = sound;
  const referenceUrls = refs.filter((ref) => ref.type === "image").map((ref) => ref.url);
  if (model?.referenceField && referenceUrls.length) input[model.referenceField] = referenceUrls;
  return input;
}

function statusLabel(state: string) {
  const labels: Record<string, string> = { waiting: "Queued", queuing: "Queued", generating: "Generating", success: "Complete", fail: "Failed" };
  return labels[state] || state;
}

export function Studio() {
  const [mounted, setMounted] = useState(false);
  const [promo, setPromo] = useState(true);
  const [sidebar, setSidebar] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const [view, setView] = useState<View>("home");
  const [modal, setModal] = useState<ModalName>(null);
  const [kind, setKind] = useState<MediaKind>("video");
  const [prompt, setPrompt] = useState("");
  const [projectName, setProjectName] = useState("Midnight Production");
  const [modelId, setModelId] = useState("bytedance/seedance-2");
  const [customModelId, setCustomModelId] = useState("");
  const [customKind, setCustomKind] = useState<MediaKind>("image");
  const [advanced, setAdvanced] = useState("{}");
  const [aspect, setAspect] = useState("16:9");
  const [resolution, setResolution] = useState("720p");
  const [duration, setDuration] = useState(5);
  const [batch, setBatch] = useState(1);
  const [sound, setSound] = useState(true);
  const [genre, setGenre] = useState("General");
  const [era, setEra] = useState("Auto");
  const [tempo, setTempo] = useState("Measured");
  const [filmTab, setFilmTab] = useState<"genre" | "era" | "tempo">("genre");
  const [cameraTab, setCameraTab] = useState<"setup" | "movement">("setup");
  const [cameraBody, setCameraBody] = useState("Auto");
  const [lens, setLens] = useState("Auto");
  const [aperture, setAperture] = useState("Auto");
  const [cameraMove, setCameraMove] = useState("Static shot");
  const [palette, setPalette] = useState("Auto");
  const [lighting, setLighting] = useState("Auto");
  const [references, setReferences] = useState<ReferenceAsset[]>([]);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [connection, setConnection] = useState<Connection>({ connected: false, source: "none", credits: null });
  const [keyInput, setKeyInput] = useState("");
  const [rememberKey, setRememberKey] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedModel = modelById(modelId);
  const effectiveModelId = modelId === "custom" ? customModelId.trim() : modelId;
  const effectiveKind = modelId === "custom" ? customKind : kind;
  const activeJobs = jobs.filter((job) => ["waiting", "queuing", "generating", "submitted"].includes(job.state));
  const recordedSpend = jobs.reduce((sum, job) => sum + (job.creditsConsumed || 0), 0);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE) || "{}");
        if (saved.projectName) setProjectName(saved.projectName);
        if (Array.isArray(saved.references)) setReferences(saved.references);
        if (Array.isArray(saved.jobs)) setJobs(saved.jobs);
        if (Array.isArray(saved.favorites)) setFavorites(saved.favorites);
      } catch { /* first load */ }
      setMounted(true);
    });
    refreshConnection();
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(STORAGE, JSON.stringify({ projectName, references, jobs, favorites }));
  }, [mounted, projectName, references, jobs, favorites]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const activeSignature = activeJobs.map((job) => job.taskId).sort().join("|");
  useEffect(() => {
    if (!activeSignature) return;
    let stopped = false;
    const poll = async () => {
      const ids = activeSignature.split("|");
      const updates = await Promise.all(ids.map(async (taskId) => {
        try {
          const response = await fetch(`/api/kie/status/${encodeURIComponent(taskId)}`, { cache: "no-store" });
          const data = await response.json();
          return response.ok ? data : null;
        } catch { return null; }
      }));
      if (stopped) return;
      setJobs((current) => current.map((job) => {
        const update = updates.find((item) => item?.taskId === job.taskId);
        return update ? { ...job, state: update.state, progress: update.progress, resultUrls: update.resultUrls || [], creditsConsumed: update.creditsConsumed, failure: update.failure } : job;
      }));
      if (updates.some((item) => item?.state === "success" || item?.state === "fail")) refreshConnection();
    };
    poll();
    const timer = window.setInterval(poll, 4500);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [activeSignature]);

  const filteredModels = useMemo(() => {
    const query = modelSearch.toLowerCase();
    return modelsFor(kind).filter((model) => `${model.label} ${model.vendor} ${model.id}`.toLowerCase().includes(query));
  }, [kind, modelSearch]);

  async function refreshConnection() {
    try {
      const response = await fetch("/api/kie/connection", { cache: "no-store" });
      const data = await response.json();
      setConnection(data);
    } catch {
      setConnection({ connected: false, source: "none", credits: null, error: "Could not reach the app server." });
    }
  }

  async function connectKey(event: FormEvent) {
    event.preventDefault();
    setBusy("Connecting…");
    setError("");
    try {
      const response = await fetch("/api/kie/connection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: keyInput, remember: rememberKey }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Connection failed.");
      setConnection(data);
      setKeyInput("");
      setToast(`Kie.ai connected${data.credits !== null ? ` · ${data.credits} credits` : ""}`);
      setModal(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Connection failed.");
    } finally { setBusy(""); }
  }

  async function disconnectKey() {
    setBusy("Disconnecting…");
    await fetch("/api/kie/connection", { method: "DELETE" });
    setBusy("");
    setConnection({ connected: false, source: "none", credits: null });
    setToast("Browser session key removed.");
  }

  function chooseKind(next: MediaKind) {
    setKind(next);
    const first = modelsFor(next)[0];
    setModelId(first.id);
    setAdvanced(JSON.stringify(first.defaults, null, 2));
    setResolution(next === "image" ? "1K" : "720p");
  }

  function chooseModel(model: KieModel) {
    setModelId(model.id);
    setKind(model.kind);
    setAdvanced(JSON.stringify(model.defaults, null, 2));
    setModal(null);
  }

  function chooseCustomModel() {
    if (!customModelId.trim()) return setError("Enter the Kie model identifier from its documentation.");
    setModelId("custom");
    if (customKind !== "audio") setKind(customKind);
    setAdvanced("{}");
    setModal(null);
  }

  function refinePrompt() {
    if (!prompt.trim()) return setToast("Write the core idea first.");
    const clean = prompt.trim().replace(/\s+/g, " ");
    if (kind === "image") {
      setPrompt(`${clean}. Cinematic ${genre.toLowerCase()} composition, ${era === "Auto" ? "contemporary" : era} production design. Shot on ${cameraBody === "Auto" ? "a cinema camera" : cameraBody} with ${lens === "Auto" ? "a natural perspective lens" : lens}, ${aperture === "Auto" ? "controlled depth of field" : aperture}. ${lighting === "Auto" ? "Motivated cinematic lighting" : `${lighting} lighting`}, ${palette === "Auto" ? "restrained film color" : `${palette} color palette`}. Precise materials, coherent background, no invented typography.`);
    } else {
      setPrompt(`${cameraMove === "Static shot" ? "Static cinematic shot" : cameraMove}: ${clean}. ${genre} film language, ${era === "Auto" ? "contemporary" : era} production design, ${tempo.toLowerCase()} pacing. ${cameraBody === "Auto" ? "Cinema camera" : cameraBody}, ${lens === "Auto" ? "natural perspective lens" : lens}, ${aperture === "Auto" ? "controlled depth of field" : aperture}. ${lighting === "Auto" ? "Motivated cinematic lighting" : `${lighting} lighting`}; ${palette === "Auto" ? "cohesive film grade" : `${palette} palette`}. Preserve subject identity and physical continuity throughout the shot.`);
    }
    setToast("Prompt refined with your film controls.");
  }

  async function uploadReference(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!connection.verified) { setModal("settings"); return setError("Connect a verified Kie.ai key before uploading references."); }
    if (file.size > 10 * 1024 * 1024) return setToast("Reference files must be under 10 MB.");
    setBusy("Uploading reference…");
    setError("");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read that file."));
        reader.readAsDataURL(file);
      });
      const response = await fetch("/api/kie/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ base64Data: dataUrl, fileName: file.name }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload failed.");
      const type: ReferenceAsset["type"] = file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "image";
      setReferences((current) => [{ id: uid(), name: data.fileName || file.name, url: data.url, type, createdAt: new Date().toISOString() }, ...current]);
      setToast("Reference uploaded to Kie.ai temporary storage.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally { setBusy(""); }
  }

  function requestGenerate() {
    setError("");
    if (!connection.verified) { setModal("settings"); return setError("Connect and verify a Kie.ai key first."); }
    if (!prompt.trim()) return setToast("Describe the image or scene you want to create.");
    if (!effectiveModelId) { setModal("models"); return setError("Choose a model or enter a custom Kie model id."); }
    try { mergeInput(selectedModel, prompt, aspect, resolution, duration, sound, references, advanced); }
    catch { return setToast("Advanced parameters must be valid JSON."); }
    setModal("confirm");
  }

  async function submitGeneration() {
    setBusy("Submitting to Kie.ai…");
    setError("");
    try {
      const input = mergeInput(selectedModel, prompt, aspect, resolution, duration, sound, references, advanced);
      const created: GenerationJob[] = [];
      for (let index = 0; index < batch; index += 1) {
        const response = await fetch("/api/kie/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: effectiveModelId, input }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Generation submission failed.");
        created.push({ id: uid(), taskId: data.taskId, model: effectiveModelId, modelLabel: selectedModel?.label || effectiveModelId, kind: effectiveKind, prompt, state: "waiting", progress: 0, resultUrls: [], createdAt: new Date().toISOString(), creditsBefore: connection.credits });
      }
      setJobs((current) => [...created, ...current]);
      setModal(null);
      setView("queue");
      setToast(`${created.length} generation${created.length > 1 ? "s" : ""} queued.`);
      refreshConnection();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Generation failed.");
    } finally { setBusy(""); }
  }

  function newProject() {
    setProjectName(`Production ${jobs.length + 1}`);
    setPrompt("");
    setReferences([]);
    setView("home");
    setToast("New local project started. Existing generation history was kept.");
  }

  function navigate(next: View) {
    setView(next);
    setMobileNav(false);
  }

  return (
    <div className={`app ${promo ? "has-promo" : ""}`}>
      {promo && <div className="promo"><span>YOUR PRIVATE GENERATION STUDIO · PAY ONLY FOR KIE.AI OUTPUTS</span><b><Zap size={13} fill="currentColor" /> NO PLATFORM MARKUP</b><button aria-label="Dismiss offer" onClick={() => setPromo(false)}><X size={18} /></button></div>}

      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu /></button>
        <button className="top-logo" onClick={() => navigate("home")} aria-label="Studio home"><LogoMark /><span>HF//R</span></button>
        <nav className="global-nav" aria-label="Main">
          <button onClick={() => navigate("home")}>Explore</button>
          <button onClick={() => { chooseKind("image"); navigate("home"); }} className={kind === "image" ? "active" : ""}>Image</button>
          <button onClick={() => { chooseKind("video"); navigate("home"); }} className={kind === "video" ? "active" : ""}>Video</button>
          <button onClick={() => { navigate("elements"); setToast("Audio references live in My elements; audio models use the custom Kie route."); }}><AudioLines size={15} /> Audio</button>
          <button onClick={() => navigate("elements")}><Layers3 size={15} /> Edit layers</button>
          <button className="active" onClick={() => navigate("home")}>Cinema Studio <em>LIVE</em></button>
          <button onClick={() => { navigate("home"); refinePrompt(); }}>Prompt Lab <em>NEW</em></button>
        </nav>
        <div className="top-actions">
          <button className="credit-pill" onClick={() => setModal("settings")}><CircleDollarSign size={16} /> {connection.credits ?? "Credits"}</button>
          <button className={`connection-pill ${connection.verified ? "connected" : ""}`} onClick={() => setModal("settings")}><span />{connection.verified ? "Connected" : "Connect Kie"}</button>
          <button className="lime-button" onClick={() => setModal("settings")}><Settings size={17} /><span>Settings</span></button>
        </div>
      </header>

      <div className="workspace">
        <aside className={`sidebar ${sidebar ? "" : "collapsed"} ${mobileNav ? "mobile-open" : ""}`}>
          <button className="mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X /></button>
          <div className="side-brand"><LogoMark /><span><strong>Cinema Studio</strong><small>Kie production system</small></span></div>
          <div className="project-name"><Film size={16} /><input value={projectName} onChange={(event) => setProjectName(event.target.value)} aria-label="Project name" /></div>
          <nav className="side-nav">
            <SideButton active={view === "home"} label="Home" icon={<Home />} collapsed={!sidebar} onClick={() => navigate("home")} />
            <SideButton active={view === "elements"} label="My elements" icon={<Layers3 />} count={references.length} collapsed={!sidebar} onClick={() => navigate("elements")} />
            <SideButton active={view === "favorites"} label="My favorites" icon={<Heart />} count={favorites.length} collapsed={!sidebar} onClick={() => navigate("favorites")} />
            <SideButton active={view === "queue"} label="Generation queue" icon={<Gauge />} count={activeJobs.length} collapsed={!sidebar} onClick={() => navigate("queue")} />
            <SideButton active={view === "ledger"} label="Receipts ledger" icon={<CircleDollarSign />} collapsed={!sidebar} onClick={() => navigate("ledger")} />
          </nav>
          <div className="side-label">PROJECT</div>
          <button className="new-project" onClick={newProject}><Plus /><span>New project</span></button>
          <div className="recent-project">
            <div className="project-thumb" style={{ backgroundImage: `url(${GALLERY[1].image})` }} />
            <span><strong>{projectName}</strong><small>{jobs.length} generation{jobs.length === 1 ? "" : "s"}</small></span>
            <MoreHorizontal />
          </div>
          <div className="academy-card">
            <div><small>PRODUCTION NOTES</small><strong>From idea to a recorded Kie receipt.</strong></div>
            <BookOpen />
            <button onClick={() => navigate("ledger")}>Open ledger</button>
          </div>
          <button className="collapse-button" onClick={() => setSidebar((value) => !value)}>{sidebar ? <PanelLeftClose /> : <PanelLeftOpen />}<span>Collapse sidebar</span></button>
        </aside>

        <main className="main">
          {view === "home" && <>
            <section className="hero">
              <div className="poster-stack">
                <div className="poster side left" style={{ backgroundImage: `url(${GALLERY[3].image})` }}><span>AFTER HOURS</span></div>
                <div className="poster center" style={{ backgroundImage: `url(${GALLERY[1].image})` }}><span>NEW EPISODE</span><strong>NIGHT DRIVE</strong></div>
                <div className="poster side right" style={{ backgroundImage: `url(${GALLERY[4].image})` }}><span>ZEPHYR</span></div>
              </div>
              <h1>BRING YOUR STORIES TO LIFE</h1>
              <p>Direct every detail. Route any Kie model. Keep the references, jobs, and receipts.</p>
            </section>
            <Composer
              kind={kind} setKind={chooseKind} prompt={prompt} setPrompt={setPrompt} model={selectedModel} modelId={effectiveModelId}
              aspect={aspect} setAspect={setAspect} resolution={resolution} setResolution={setResolution} duration={duration} setDuration={setDuration}
              batch={batch} setBatch={setBatch} sound={sound} setSound={setSound} references={references} openModal={setModal}
              onRefine={refinePrompt} onUpload={() => fileRef.current?.click()} onGenerate={requestGenerate}
              film={{ genre, era, tempo }} camera={{ cameraBody, lens, aperture, cameraMove }} palette={palette} lighting={lighting}
            />
            <section className="gallery-section">
              <div className="section-heading"><div><span>CURATED FROM YOUR STUDIO</span><h2>Open source inspiration</h2></div><button onClick={() => navigate("favorites")}>Explore favorites <ChevronRight /></button></div>
              <div className="gallery-grid">{GALLERY.map((item) => <GalleryCard key={item.id} item={item} favorite={favorites.includes(item.id)} toggle={() => setFavorites((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} />)}</div>
            </section>
          </>}

          {view === "elements" && <ElementsView references={references} upload={() => fileRef.current?.click()} remove={(id) => setReferences((current) => current.filter((item) => item.id !== id))} />}
          {view === "favorites" && <FavoritesView favorites={GALLERY.filter((item) => favorites.includes(item.id))} toggle={(id) => setFavorites((current) => current.filter((item) => item !== id))} />}
          {view === "queue" && <QueueView jobs={jobs} refresh={() => setJobs((current) => [...current])} remove={(id) => setJobs((current) => current.filter((job) => job.id !== id))} />}
          {view === "ledger" && <LedgerView jobs={jobs} recordedSpend={recordedSpend} connection={connection} />}
        </main>
      </div>

      <input ref={fileRef} className="hidden-input" type="file" accept="image/*,video/mp4,video/webm,audio/*" onChange={uploadReference} />
      {modal === "settings" && <SettingsModal connection={connection} keyInput={keyInput} setKeyInput={setKeyInput} remember={rememberKey} setRemember={setRememberKey} onConnect={connectKey} onDisconnect={disconnectKey} close={() => { setModal(null); setError(""); }} busy={busy} error={error} />}
      {modal === "models" && <ModelModal kind={kind} setKind={chooseKind} models={filteredModels} search={modelSearch} setSearch={setModelSearch} choose={chooseModel} customId={customModelId} setCustomId={setCustomModelId} customKind={customKind} setCustomKind={setCustomKind} chooseCustom={chooseCustomModel} close={() => { setModal(null); setError(""); }} error={error} />}
      {modal === "film" && <FilmModal tab={filmTab} setTab={setFilmTab} genre={genre} setGenre={setGenre} era={era} setEra={setEra} tempo={tempo} setTempo={setTempo} close={() => setModal(null)} />}
      {modal === "camera" && <CameraModal tab={cameraTab} setTab={setCameraTab} body={cameraBody} setBody={setCameraBody} lens={lens} setLens={setLens} aperture={aperture} setAperture={setAperture} movement={cameraMove} setMovement={setCameraMove} close={() => setModal(null)} />}
      {modal === "palette" && <ChoiceModal title="Color palette" icon={<Palette />} choices={PALETTES.map((item) => item.name)} selected={palette} choose={setPalette} close={() => setModal(null)} palettes={PALETTES} />}
      {modal === "lighting" && <ChoiceModal title="Lighting" icon={<Lightbulb />} choices={LIGHTING} selected={lighting} choose={setLighting} close={() => setModal(null)} />}
      {modal === "confirm" && <ConfirmModal model={selectedModel} modelId={effectiveModelId} kind={effectiveKind} prompt={prompt} batch={batch} credits={connection.credits} advanced={advanced} setAdvanced={setAdvanced} submit={submitGeneration} close={() => { setModal(null); setError(""); }} busy={busy} error={error} />}
      {busy && modal !== "settings" && modal !== "confirm" && <div className="busy-overlay"><RefreshCw className="spin" />{busy}</div>}
      {toast && <div className="toast"><Check />{toast}</div>}
    </div>
  );
}

function LogoMark() {
  return <span className="logo-mark"><span /><span /></span>;
}

function SideButton({ active, label, icon, count, collapsed, onClick }: { active: boolean; label: string; icon: React.ReactNode; count?: number; collapsed: boolean; onClick: () => void }) {
  return <button className={active ? "active" : ""} onClick={onClick} title={collapsed ? label : undefined}>{icon}<span>{label}</span>{typeof count === "number" && count > 0 && <em>{count}</em>}</button>;
}

function Composer(props: {
  kind: MediaKind; setKind: (kind: MediaKind) => void; prompt: string; setPrompt: (value: string) => void; model?: KieModel; modelId: string;
  aspect: string; setAspect: (value: string) => void; resolution: string; setResolution: (value: string) => void; duration: number; setDuration: (value: number) => void;
  batch: number; setBatch: (value: number) => void; sound: boolean; setSound: (value: boolean) => void; references: ReferenceAsset[];
  openModal: (modal: ModalName) => void; onRefine: () => void; onUpload: () => void; onGenerate: () => void;
  film: { genre: string; era: string; tempo: string }; camera: { cameraBody: string; lens: string; aperture: string; cameraMove: string }; palette: string; lighting: string;
}) {
  return <section className="composer-wrap">
    <div className="mode-rail">
      <button className={props.kind === "image" ? "active" : ""} onClick={() => props.setKind("image")}><ImageIcon /><span>Image</span></button>
      <button className={props.kind === "video" ? "active" : ""} onClick={() => props.setKind("video")}><Video /><span>Video</span></button>
    </div>
    <div className="composer">
      {props.kind === "video" && <div className="director-row">
        <button onClick={props.onUpload}><Plus /><span><small>References</small>{props.references.length}/50</span></button>
        <button onClick={() => props.openModal("film")}><Clapperboard /><span><small>Film setup</small>{props.film.genre}</span></button>
        <button onClick={() => props.openModal("camera")}><Aperture /><span><small>Camera</small>{props.camera.cameraBody === "Auto" ? props.camera.cameraMove : props.camera.cameraBody}</span></button>
        <button onClick={() => props.openModal("palette")}><Palette /><span><small>Color palette</small>{props.palette}</span></button>
        <button onClick={() => props.openModal("lighting")}><Lightbulb /><span><small>Lighting</small>{props.lighting}</span></button>
      </div>}
      <div className="prompt-row">
        <textarea value={props.prompt} onChange={(event) => props.setPrompt(event.target.value)} placeholder={props.kind === "video" ? "Describe your scene — use references and direct every detail" : "Describe what you want to create…"} />
        <button className="refine" onClick={props.onRefine}><WandSparkles /><span>Refine</span></button>
      </div>
      <div className="settings-row">
        <button className="add-reference" onClick={props.onUpload}><Plus /></button>
        <button className="model-select" onClick={() => props.openModal("models")}><Sparkles /><span>{props.model?.label || props.modelId || "Choose model"}</span><ChevronRight /></button>
        <label><MonitorPlay /><select value={props.resolution} onChange={(event) => props.setResolution(event.target.value)}><option>480p</option><option>720p</option><option>1080p</option><option>1K</option><option>2K</option><option>4K</option></select></label>
        <label><PanelRatioIcon /><select value={props.aspect} onChange={(event) => props.setAspect(event.target.value)}><option>16:9</option><option>9:16</option><option>1:1</option><option>4:3</option><option>3:4</option><option>2:3</option><option>21:9</option></select></label>
        {props.kind === "video" && <label><Clock3 /><select value={props.duration} onChange={(event) => props.setDuration(Number(event.target.value))}><option value={4}>4s</option><option value={5}>5s</option><option value={6}>6s</option><option value={10}>10s</option><option value={15}>15s</option></select></label>}
        <button className={`sound ${props.sound ? "on" : ""}`} onClick={() => props.setSound(!props.sound)}>{props.sound ? <Mic2 /> : <Moon />}<span>{props.sound ? "Audio on" : "Audio off"}</span></button>
        <div className="batch"><button disabled={props.batch <= 1} onClick={() => props.setBatch(Math.max(1, props.batch - 1))}>−</button><span>{props.batch}/4</span><button disabled={props.batch >= 4} onClick={() => props.setBatch(Math.min(4, props.batch + 1))}>+</button></div>
      </div>
    </div>
    <button className="generate" onClick={props.onGenerate}><span>GENERATE</span><small><Sparkles /> Kie credits</small></button>
  </section>;
}

function PanelRatioIcon() { return <span className="ratio-icon" />; }

function GalleryCard({ item, favorite, toggle }: { item: GalleryItem; favorite: boolean; toggle: () => void }) {
  return <article className="gallery-card">
    <div className="gallery-image" style={{ backgroundImage: `url(${item.image})` }}><button onClick={toggle} className={favorite ? "favorite" : ""} aria-label={favorite ? "Remove favorite" : "Add favorite"}><Heart fill={favorite ? "currentColor" : "none"} /></button><span><Play fill="currentColor" /></span></div>
    <div><span><strong>{item.title}</strong><small>{item.creator}</small></span><em>{item.views} views</em></div>
  </article>;
}

function ElementsView({ references, upload, remove }: { references: ReferenceAsset[]; upload: () => void; remove: (id: string) => void }) {
  return <section className="page-view"><PageHeading eyebrow="PROJECT CONTINUITY" title="My elements" copy="Upload reusable character, location, prop, audio, and source-frame references. Kie temporary URLs expire, so regenerate important references when needed." action={<button className="lime-button" onClick={upload}><Upload /> Add reference</button>} />
    {references.length === 0 ? <EmptyState icon={<Layers3 />} title="Build your reference library" copy="Upload an image, video, or audio file. The app sends it through the server to Kie.ai temporary storage and can attach compatible image references to generations." action={<button className="lime-button" onClick={upload}>Upload first element</button>} /> : <div className="element-grid">{references.map((ref) => <article key={ref.id} className="element-card"><div className="element-preview">{ref.type === "image" ? <img src={ref.url} alt="" /> : ref.type === "video" ? <video src={ref.url} muted /> : <AudioLines />}</div><div><span className="type-chip">{ref.type}</span><strong>{ref.name}</strong><small>Added {new Date(ref.createdAt).toLocaleDateString()}</small></div><button onClick={() => remove(ref.id)} aria-label="Remove reference"><Trash2 /></button></article>)}</div>}
  </section>;
}

function FavoritesView({ favorites, toggle }: { favorites: GalleryItem[]; toggle: (id: string) => void }) {
  return <section className="page-view"><PageHeading eyebrow="VISUAL MEMORY" title="My favorites" copy="A lightweight visual moodboard saved on this device." />{favorites.length ? <div className="gallery-grid large">{favorites.map((item) => <GalleryCard key={item.id} item={item} favorite toggle={() => toggle(item.id)} />)}</div> : <EmptyState icon={<Heart />} title="No favorites yet" copy="Heart any project on the home gallery to keep it here." />}</section>;
}

function QueueView({ jobs, refresh, remove }: { jobs: GenerationJob[]; refresh: () => void; remove: (id: string) => void }) {
  return <section className="page-view"><PageHeading eyebrow="PRODUCTION" title="Generation queue" copy="Tasks poll Kie.ai until they complete or fail. Generated provider URLs can expire, so download important results." action={<button className="outline-button" onClick={refresh}><RefreshCw /> Refresh view</button>} />
    {jobs.length === 0 ? <EmptyState icon={<Gauge />} title="The queue is clear" copy="Return home, choose a model, and generate your first image or video." /> : <div className="job-list">{jobs.map((job) => <article className="job-card" key={job.id}>
      <div className="job-media">{job.resultUrls[0] ? (isVideoUrl(job.resultUrls[0]) ? <video src={job.resultUrls[0]} controls poster={undefined} /> : isAudioUrl(job.resultUrls[0]) ? <div className="audio-result"><AudioLines /><audio src={job.resultUrls[0]} controls /></div> : <img src={job.resultUrls[0]} alt={job.prompt} />) : <div className="job-placeholder"><span className={job.state === "fail" ? "failed" : ""}>{job.state === "fail" ? <X /> : <Sparkles />}</span><strong>{statusLabel(job.state)}</strong>{!(["success", "fail"].includes(job.state)) && <div className="progress"><i style={{ width: `${Math.max(job.progress, 8)}%` }} /></div>}</div>}</div>
      <div className="job-copy"><div className="job-top"><span className={`status ${job.state}`}>{statusLabel(job.state)}</span><small>{new Date(job.createdAt).toLocaleString()}</small></div><h3>{job.modelLabel}</h3><code>{job.model}</code><p>{job.prompt}</p>{job.failure && <div className="inline-error">{job.failure}</div>}<div className="job-footer"><span><CircleDollarSign /> {typeof job.creditsConsumed === "number" ? `${job.creditsConsumed} recorded credits` : "Cost pending from Kie"}</span><span><Clock3 /> {job.taskId.slice(0, 18)}…</span></div></div>
      <div className="job-actions">{job.resultUrls[0] && <a href={job.resultUrls[0]} target="_blank" rel="noreferrer" title="Open result"><ArrowDownToLine /></a>}<button onClick={() => remove(job.id)} title="Remove from local history"><Trash2 /></button></div>
    </article>)}</div>}
  </section>;
}

function LedgerView({ jobs, recordedSpend, connection }: { jobs: GenerationJob[]; recordedSpend: number; connection: Connection }) {
  function exportLedger() {
    const rows = [["date", "model", "prompt", "status", "credits", "task_id"], ...jobs.map((job) => [job.createdAt, job.model, job.prompt, job.state, job.creditsConsumed ?? "unreported", job.taskId])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a"); link.href = url; link.download = "kie-generation-ledger.csv"; link.click(); URL.revokeObjectURL(url);
  }
  return <section className="page-view"><PageHeading eyebrow="BENCH STUDIO PATTERN" title="Receipts ledger" copy="Recorded Kie credits stay distinct from unknown or estimated spend. This local ledger never invents a dollar conversion." action={<button className="outline-button" onClick={exportLedger}><Download /> Export CSV</button>} />
    <div className="ledger-stats"><div><small>Recorded task spend</small><strong>{recordedSpend}</strong><span>Kie credits from completed records</span></div><div><small>Current balance</small><strong>{connection.credits ?? "—"}</strong><span>{connection.verified ? "Verified live" : "Connect a key to verify"}</span></div><div><small>Total jobs</small><strong>{jobs.length}</strong><span>{jobs.filter((job) => job.state === "success").length} completed</span></div></div>
    <div className="ledger-table"><div className="ledger-head"><span>Timestamp</span><span>Model</span><span>Prompt</span><span>Status</span><span>Credits</span></div>{jobs.map((job) => <div className="ledger-row" key={job.id}><span>{new Date(job.createdAt).toLocaleDateString()}<small>{new Date(job.createdAt).toLocaleTimeString()}</small></span><span><strong>{job.modelLabel}</strong><code>{job.model}</code></span><span>{job.prompt}</span><span><em className={`status ${job.state}`}>{statusLabel(job.state)}</em></span><span>{job.creditsConsumed ?? <small>unreported</small>}</span></div>)}{!jobs.length && <div className="ledger-empty">No generation receipts yet.</div>}</div>
  </section>;
}

function PageHeading({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><span>{eyebrow}</span><h1>{title}</h1><p>{copy}</p></div>{action}</div>;
}

function EmptyState({ icon, title, copy, action }: { icon: React.ReactNode; title: string; copy: string; action?: React.ReactNode }) {
  return <div className="empty-state"><div>{icon}</div><h2>{title}</h2><p>{copy}</p>{action}</div>;
}

function ModalShell({ title, icon, close, children, wide = false }: { title: string; icon?: React.ReactNode; close: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}><header><span>{icon}{title}</span><button onClick={close} aria-label="Close"><X /></button></header>{children}</section></div>;
}

function SettingsModal({ connection, keyInput, setKeyInput, remember, setRemember, onConnect, onDisconnect, close, busy, error }: { connection: Connection; keyInput: string; setKeyInput: (value: string) => void; remember: boolean; setRemember: (value: boolean) => void; onConnect: (event: FormEvent) => void; onDisconnect: () => void; close: () => void; busy: string; error: string }) {
  return <ModalShell title="Kie.ai connection" icon={<KeyRound />} close={close}>
    <div className="connection-summary"><span className={connection.verified ? "online" : ""} /><div><strong>{connection.verified ? "Connected and verified" : "No verified key"}</strong><small>{connection.source === "server" ? "Using server KIE_API_KEY" : connection.source === "session" ? "Using secure browser-session cookie" : "Add your Kie.ai key below"}</small></div>{connection.credits !== null && <em>{connection.credits} credits</em>}</div>
    <form onSubmit={onConnect} className="key-form"><label>API key<input type="password" value={keyInput} onChange={(event) => setKeyInput(event.target.value)} placeholder="Paste your Kie.ai key" autoComplete="off" /></label><label className="remember"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span>Remember on this device for 30 days</span></label><p><KeyRound /> The key is verified server-side and stored in an HttpOnly cookie. Client JavaScript cannot read it after connection. For the strongest production setup, add <code>KIE_API_KEY</code> in Vercel instead.</p>{error && <div className="inline-error">{error}</div>}<button className="lime-button full" disabled={!keyInput || !!busy}>{busy || "Connect and verify"}</button></form>
    {connection.source === "session" && <button className="danger-link" onClick={onDisconnect} disabled={!!busy}>Remove browser-session key</button>}
  </ModalShell>;
}

function ModelModal({ kind, setKind, models, search, setSearch, choose, customId, setCustomId, customKind, setCustomKind, chooseCustom, close, error }: { kind: MediaKind; setKind: (value: MediaKind) => void; models: KieModel[]; search: string; setSearch: (value: string) => void; choose: (model: KieModel) => void; customId: string; setCustomId: (value: string) => void; customKind: MediaKind; setCustomKind: (value: MediaKind) => void; chooseCustom: () => void; close: () => void; error: string }) {
  return <ModalShell title="Choose any Kie model" icon={<Sparkles />} close={close} wide>
    <div className="model-toolbar"><div className="modal-tabs"><button className={kind === "image" ? "active" : ""} onClick={() => setKind("image")}><ImageIcon /> Image</button><button className={kind === "video" ? "active" : ""} onClick={() => setKind("video")}><Video /> Video</button></div><label><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search models…" /></label></div>
    <div className="model-list">{models.map((model) => <button key={model.id} onClick={() => choose(model)}><span className="model-icon">{model.kind === "image" ? <ImageIcon /> : <Video />}</span><span><strong>{model.label}{model.badge && <em>{model.badge}</em>}</strong><small>{model.description}</small><code>{model.id}</code></span><ChevronRight /></button>)}</div>
    <div className="custom-model"><div><strong>Use any current or future Kie model</strong><small>Paste the exact model identifier from the Kie documentation, then edit its JSON contract before submitting.</small></div><div><select value={customKind} onChange={(event) => setCustomKind(event.target.value as MediaKind)}><option value="image">Image</option><option value="video">Video</option><option value="audio">Audio</option></select><input value={customId} onChange={(event) => setCustomId(event.target.value)} placeholder="provider/model-id" /><button className="lime-button" onClick={chooseCustom}>Use model</button></div>{error && <div className="inline-error">{error}</div>}</div>
  </ModalShell>;
}

function FilmModal({ tab, setTab, genre, setGenre, era, setEra, tempo, setTempo, close }: { tab: "genre" | "era" | "tempo"; setTab: (value: "genre" | "era" | "tempo") => void; genre: string; setGenre: (value: string) => void; era: string; setEra: (value: string) => void; tempo: string; setTempo: (value: string) => void; close: () => void }) {
  const list = tab === "genre" ? GENRES : tab === "era" ? ERAS : TEMPOS;
  const selected = tab === "genre" ? genre : tab === "era" ? era : tempo;
  const choose = tab === "genre" ? setGenre : tab === "era" ? setEra : setTempo;
  return <ModalShell title="Film setup" icon={<Clapperboard />} close={close} wide><div className="direction-layout"><aside><button className={tab === "genre" ? "active" : ""} onClick={() => setTab("genre")}><Film /> Genre</button><button className={tab === "era" ? "active" : ""} onClick={() => setTab("era")}><Clock3 /> Era</button><button className={tab === "tempo" ? "active" : ""} onClick={() => setTab("tempo")}><Gauge /> Tempo</button></aside><div className="choice-stage"><span>Select {tab}</span><p>Direct the story conventions the model should follow.</p><div className="cinema-choice-grid">{list.map((item, index) => <button key={item} className={selected === item ? "active" : ""} onClick={() => choose(item)} style={{ backgroundImage: `linear-gradient(180deg, transparent, rgba(0,0,0,.9)), url(${GALLERY[index % GALLERY.length].image})` }}><span>{selected === item && <Check />}{item}</span></button>)}</div></div></div></ModalShell>;
}

function CameraModal({ tab, setTab, body, setBody, lens, setLens, aperture, setAperture, movement, setMovement, close }: { tab: "setup" | "movement"; setTab: (value: "setup" | "movement") => void; body: string; setBody: (value: string) => void; lens: string; setLens: (value: string) => void; aperture: string; setAperture: (value: string) => void; movement: string; setMovement: (value: string) => void; close: () => void }) {
  return <ModalShell title="Camera" icon={<Camera />} close={close} wide><div className="direction-layout"><aside><button className={tab === "setup" ? "active" : ""} onClick={() => setTab("setup")}><Camera /> Setup</button><button className={tab === "movement" ? "active" : ""} onClick={() => setTab("movement")}><SlidersHorizontal /> Movement</button></aside><div className="choice-stage">{tab === "setup" ? <div className="camera-columns"><CameraColumn label="CAMERA" selected={body} setSelected={setBody} options={["DV Camcorder", "Auto", "Modern", "35mm Film"]} icon={<Camera />} /><CameraColumn label="LENS" selected={lens} setSelected={setLens} options={["Halation Vintage", "Auto", "Clean Sharp", "Anamorphic"]} icon={<Aperture />} /><CameraColumn label="APERTURE" selected={aperture} setSelected={setAperture} options={["f/11 Deep Focus", "Auto", "f/1.4 Wide Open", "f/4 Moderate"]} icon={<Aperture />} /></div> : <><span>Direct a camera move</span><p>Adds the selected movement to prompt refinement. Order and physical clarity matter.</p><div className="movement-grid">{CAMERA_MOVES.map((move, index) => <button className={movement === move ? "active" : ""} onClick={() => setMovement(move)} key={move}><div style={{ backgroundImage: `url(${GALLERY[index % GALLERY.length].image})` }}><SlidersHorizontal /></div><strong>{move}</strong></button>)}</div></>}</div></div></ModalShell>;
}

function CameraColumn({ label, selected, setSelected, options, icon }: { label: string; selected: string; setSelected: (value: string) => void; options: string[]; icon: React.ReactNode }) {
  return <div><span>{label}</span>{options.map((option) => <button key={option} className={selected === option ? "active" : ""} onClick={() => setSelected(option)}>{icon}<strong>{option}</strong>{selected === option && <Check />}</button>)}</div>;
}

function ChoiceModal({ title, icon, choices, selected, choose, close, palettes }: { title: string; icon: React.ReactNode; choices: string[]; selected: string; choose: (value: string) => void; close: () => void; palettes?: typeof PALETTES }) {
  return <ModalShell title={title} icon={icon} close={close} wide><div className="simple-choice-grid">{choices.map((choice, index) => <button className={selected === choice ? "active" : ""} onClick={() => choose(choice)} key={choice}>{palettes ? <span className="swatches">{palettes[index].colors.map((color) => <i key={color} style={{ background: color }} />)}</span> : <span className="lighting-icon">{index % 3 === 0 ? <SunMedium /> : index % 3 === 1 ? <Moon /> : <Lightbulb />}</span>}<strong>{choice}</strong>{selected === choice && <Check />}</button>)}</div></ModalShell>;
}

function ConfirmModal({ model, modelId, kind, prompt, batch, credits, advanced, setAdvanced, submit, close, busy, error }: { model?: KieModel; modelId: string; kind: MediaKind; prompt: string; batch: number; credits: number | null; advanced: string; setAdvanced: (value: string) => void; submit: () => void; close: () => void; busy: string; error: string }) {
  return <ModalShell title="Confirm generation" icon={<Sparkles />} close={close} wide><div className="confirm-layout"><div><div className="confirm-model"><span>{kind === "image" ? <ImageIcon /> : kind === "audio" ? <AudioLines /> : <Video />}</span><div><strong>{model?.label || modelId}</strong><code>{modelId}</code></div><em>{batch} output{batch > 1 ? "s" : ""}</em></div><label>Final prompt<textarea value={prompt} readOnly rows={6} /></label><label>Advanced Kie input JSON<textarea className="code-editor" value={advanced} onChange={(event) => setAdvanced(event.target.value)} rows={10} spellCheck={false} /></label></div><aside><div className="balance-card"><small>Current Kie balance</small><strong>{credits ?? "—"}</strong><span>credits before submission</span></div><div className="preflight"><p><Check /> Key verified server-side</p><p><Check /> Model id supplied</p><p><Check /> Prompt ready</p><p><Check /> Local receipt will be recorded</p></div><div className="spend-warning"><CircleDollarSign /><span><strong>This action spends Kie.ai credits.</strong><small>Exact cost is model- and settings-dependent. The ledger labels cost as recorded only when Kie returns <code>creditsConsumed</code>.</small></span></div>{error && <div className="inline-error">{error}</div>}<button className="lime-button full" onClick={submit} disabled={!!busy}>{busy || "Approve spend & generate"}</button><button className="cancel-button" onClick={close} disabled={!!busy}>Cancel</button></aside></div></ModalShell>;
}
