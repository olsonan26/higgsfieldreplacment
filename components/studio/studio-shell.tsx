"use client";

import { useState } from "react";
import {
  Archive,
  AudioLines,
  BookOpen,
  CircleDollarSign,
  Clapperboard,
  Film,
  Gauge,
  Heart,
  Home,
  Image as ImageIcon,
  Layers3,
  Menu,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Trash2,
  UserRound,
  WandSparkles,
  X,
} from "lucide-react";
import { VesperMark } from "@/components/brand/vesper-mark";
import { ProjectDialog } from "@/components/studio/project-dialog";
import { GenerationComposer } from "@/components/studio/composer/generation-composer";
import { AssetLibrary } from "@/components/studio/views/asset-library";
import { EditLayersView } from "@/components/studio/views/edit-layers-view";
import { PromptLabView } from "@/components/studio/views/prompt-lab-view";
import { QueueView } from "@/components/studio/views/queue-view";
import { FavoritesView } from "@/components/studio/views/favorites-view";
import { LedgerView } from "@/components/studio/views/ledger-view";
import { SettingsView } from "@/components/studio/views/settings-view";
import type {
  PromptVersion,
  StudioInitialData,
  StudioProject,
  StudioView,
} from "@/lib/studio/types";

const sidebarNavigation: Array<{
  id: StudioView;
  label: string;
  icon: typeof Home;
}> = [
  { id: "studio", label: "Home", icon: Home },
  { id: "assets", label: "My elements", icon: Layers3 },
  { id: "favorites", label: "My favorites", icon: Heart },
  { id: "queue", label: "Generation queue", icon: Gauge },
  { id: "ledger", label: "Receipts ledger", icon: CircleDollarSign },
];

export function StudioShell({ initial }: { initial: StudioInitialData }) {
  const [view, setView] = useState<StudioView>("studio");
  const initialMediaKind = initial.projectSettings?.settings.mediaKind;
  const [mediaKind, setMediaKind] = useState<"image" | "video">(
    initialMediaKind === "image" || initialMediaKind === "video"
      ? initialMediaKind
      : "video",
  );
  const [projects, setProjects] = useState(initial.projects);
  const [activeProject, setActiveProject] = useState(initial.activeProject);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [restoredPrompt, setRestoredPrompt] = useState<PromptVersion | null>(
    null,
  );
  const [projectDialog, setProjectDialog] = useState<
    "create" | "rename" | "archive" | "trash" | null
  >(null);
  const workspace = initial.activeWorkspace;
  const canEdit = workspace.role !== "viewer";

  function navigate(next: StudioView) {
    if (next !== "studio") setRestoredPrompt(null);
    setView(next);
    setMobileOpen(false);
  }
  function openComposer(kind: "image" | "video") {
    setRestoredPrompt(null);
    setMediaKind(kind);
    navigate("studio");
  }
  function selectWorkspace(id: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("workspace", id);
    url.searchParams.delete("project");
    window.location.assign(url);
  }
  function selectProject(project: StudioProject) {
    const url = new URL(window.location.href);
    url.searchParams.set("project", project.id);
    window.location.assign(url);
  }
  async function reloadProjects(nextProject?: StudioProject) {
    const response = await fetch(`/api/projects?workspaceId=${workspace.id}`, {
      cache: "no-store",
    });
    const payload = (await response.json()) as { projects?: StudioProject[] };
    const next = payload.projects || [];
    setProjects(next);
    if (nextProject) {
      setActiveProject(nextProject);
      selectProject(nextProject);
    } else if (!next.some((project) => project.id === activeProject?.id)) {
      setActiveProject(next[0] || null);
    }
    setProjectDialog(null);
  }

  const body = activeProject ? (
    {
      studio: (
        <GenerationComposer
          key={`${activeProject.id}:${mediaKind}:${restoredPrompt?.id || "draft"}`}
          workspace={workspace}
          project={activeProject}
          capabilities={initial.capabilities}
          mediaKind={mediaKind}
          onMediaKindChange={(kind) => {
            setRestoredPrompt(null);
            setMediaKind(kind);
          }}
          restoredPrompt={restoredPrompt}
          initialDraft={initial.projectSettings?.settings || null}
          onQueue={() => setView("queue")}
          onExplore={() => setView("explore")}
        />
      ),
      explore: (
        <AssetLibrary
          workspace={workspace}
          project={activeProject}
          variant="explore"
        />
      ),
      assets: (
        <AssetLibrary
          workspace={workspace}
          project={activeProject}
          variant="elements"
        />
      ),
      audio: (
        <AssetLibrary
          workspace={workspace}
          project={activeProject}
          variant="audio"
          mediaFilter="audio"
        />
      ),
      layers: <EditLayersView workspace={workspace} project={activeProject} />,
      prompts: (
        <PromptLabView
          workspace={workspace}
          project={activeProject}
          onRestore={(version) => {
            setRestoredPrompt(version);
            setMediaKind(version.capability?.media_kind || "video");
            setView("studio");
          }}
        />
      ),
      queue: <QueueView workspace={workspace} project={activeProject} />,
      favorites: (
        <FavoritesView workspace={workspace} project={activeProject} />
      ),
      ledger: <LedgerView workspace={workspace} />,
      settings: <SettingsView workspace={workspace} />,
    }[view]
  ) : (
    <section className="empty-state">
      <Film />
      <h2>Create your first project</h2>
      <p>
        Projects keep every prompt, asset, skill, generation, and receipt
        isolated.
      </p>
      {canEdit && (
        <button
          className="button primary"
          onClick={() => setProjectDialog("create")}
        >
          <Plus /> New project
        </button>
      )}
    </section>
  );

  return (
    <div className={`studio-app ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      <header className="studio-global-header">
        <button
          className="mobile-menu-button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
        >
          <Menu />
        </button>
        <button
          className="global-brand"
          onClick={() => navigate("studio")}
          data-testid="nav-brand-home"
        >
          <VesperMark compact />
          <strong>VESPERFRAME</strong>
        </button>
        <nav className="global-navigation" aria-label="Production navigation">
          <button
            className={view === "explore" ? "active" : ""}
            onClick={() => navigate("explore")}
            data-testid="nav-explore"
          >
            <Search /> Explore
          </button>
          <button
            className={
              view === "studio" && mediaKind === "image" ? "active" : ""
            }
            onClick={() => openComposer("image")}
          >
            <ImageIcon /> Image
          </button>
          <button
            className={
              view === "studio" && mediaKind === "video" ? "active" : ""
            }
            onClick={() => openComposer("video")}
          >
            <Film /> Video
          </button>
          <button
            className={view === "audio" ? "active" : ""}
            onClick={() => navigate("audio")}
            data-testid="nav-audio"
          >
            <AudioLines /> Audio
          </button>
          <button
            className={view === "layers" ? "active" : ""}
            onClick={() => navigate("layers")}
            data-testid="nav-edit-layers"
          >
            <Layers3 /> Edit layers
          </button>
          <button
            className={view === "studio" ? "active studio-tab" : "studio-tab"}
            onClick={() => navigate("studio")}
          >
            <Clapperboard /> Cinema Studio <em>LIVE</em>
          </button>
          <button
            className={view === "prompts" ? "active" : ""}
            onClick={() => navigate("prompts")}
            data-testid="nav-prompt-lab"
          >
            <WandSparkles /> Prompt Lab <em>PRO</em>
          </button>
        </nav>
        <div className="global-actions">
          <button onClick={() => navigate("ledger")}>
            <CircleDollarSign /> Credits
          </button>
          <button
            className={workspace.generationAllowed ? "access-ready" : ""}
            onClick={() => navigate("settings")}
          >
            <span />
            {workspace.generationAllowed ? "Generation ready" : "View only"}
          </button>
          <button
            className="settings-button"
            onClick={() => navigate("settings")}
            data-testid="nav-settings"
          >
            <Settings /> Settings
          </button>
        </div>
      </header>

      <div className="studio-workspace-frame">
        <aside className={`studio-sidebar ${mobileOpen ? "mobile-open" : ""}`}>
          <button
            className="mobile-sidebar-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X />
          </button>
          <div className="side-brand">
            <VesperMark compact />
            <span>
              <strong>Cinema Studio</strong>
              <small>Private production system</small>
            </span>
          </div>
          <label className="workspace-select">
            <span className="sr-only">Workspace</span>
            <select
              value={workspace.id}
              onChange={(event) => selectWorkspace(event.target.value)}
              data-testid="workspace-switcher"
            >
              {initial.workspaces.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="project-select">
            <Film />
            <span className="sr-only">Project</span>
            <select
              value={activeProject?.id || ""}
              onChange={(event) => {
                const found = projects.find(
                  (project) => project.id === event.target.value,
                );
                if (found) selectProject(found);
              }}
              data-testid="project-switcher"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <nav className="side-navigation" aria-label="Workspace navigation">
            {sidebarNavigation.map((item) => (
              <button
                key={item.id}
                className={view === item.id ? "active" : ""}
                onClick={() => navigate(item.id)}
                data-testid={`nav-${item.id}`}
                title={!sidebarOpen ? item.label : undefined}
              >
                <item.icon />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="side-section-label">PROJECT</div>
          {canEdit && (
            <button
              className="new-project-button"
              onClick={() => setProjectDialog("create")}
              data-testid="project-create"
            >
              <Plus /> <span>New project</span>
            </button>
          )}
          <div className="recent-projects">
            {projects.slice(0, 3).map((project) => (
              <div
                className={`recent-project ${
                  activeProject?.id === project.id ? "active" : ""
                }`}
                key={project.id}
              >
                <button onClick={() => selectProject(project)}>
                  <span className="project-thumbnail" aria-hidden="true" />
                  <span>
                    <strong>{project.name}</strong>
                    <small>
                      Updated{" "}
                      {new Date(project.updated_at).toLocaleDateString()}
                    </small>
                  </span>
                </button>
                {canEdit && activeProject?.id === project.id && (
                  <details className="project-overflow">
                    <summary aria-label="Project actions">
                      <MoreHorizontal />
                    </summary>
                    <div>
                      <button onClick={() => setProjectDialog("rename")}>
                        Rename
                      </button>
                      <button onClick={() => setProjectDialog("archive")}>
                        <Archive /> Archive
                      </button>
                      {workspace.role === "owner" && (
                        <button
                          className="danger-text"
                          onClick={() => setProjectDialog("trash")}
                        >
                          <Trash2 /> Move to trash
                        </button>
                      )}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
          <div className="production-note-card">
            <div>
              <small>PRODUCTION NOTES</small>
              <strong>From an idea to a durable generation receipt.</strong>
            </div>
            <BookOpen />
            <button onClick={() => navigate("ledger")}>Open ledger</button>
          </div>
          <div className="sidebar-footer">
            <button
              className="collapse-sidebar"
              onClick={() => setSidebarOpen((value) => !value)}
            >
              {sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
              <span>{sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}</span>
            </button>
            <form
              action="/auth/signout"
              method="post"
              className="sidebar-account"
            >
              <button type="submit" data-testid="auth-sign-out">
                <UserRound />
                <span>
                  <strong>{initial.user.displayName}</strong>
                  <small>Sign out</small>
                </span>
              </button>
            </form>
          </div>
        </aside>
        <main className="studio-main">
          <div className="studio-content">{body}</div>
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Mobile workspace navigation">
        {sidebarNavigation.slice(0, 5).map((item) => (
          <button
            key={item.id}
            className={view === item.id ? "active" : ""}
            onClick={() => navigate(item.id)}
          >
            <item.icon />
            <span>{item.label.replace("My ", "")}</span>
          </button>
        ))}
      </nav>
      {projectDialog && (
        <ProjectDialog
          workspaceId={workspace.id}
          project={
            projectDialog === "create" ? undefined : activeProject || undefined
          }
          mode={projectDialog}
          onClose={() => setProjectDialog(null)}
          onSaved={reloadProjects}
        />
      )}
    </div>
  );
}
