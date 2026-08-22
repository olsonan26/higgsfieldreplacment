"use client";

import { useState } from "react";
import {
  Archive,
  ChevronDown,
  FolderKanban,
  Heart,
  Images,
  LayoutDashboard,
  ListVideo,
  Plus,
  ReceiptText,
  Settings,
  Trash2,
  UserRound,
} from "lucide-react";
import { VesperMark } from "@/components/brand/vesper-mark";
import { ProjectDialog } from "@/components/studio/project-dialog";
import { GenerationComposer } from "@/components/studio/composer/generation-composer";
import { AssetLibrary } from "@/components/studio/views/asset-library";
import { QueueView } from "@/components/studio/views/queue-view";
import { FavoritesView } from "@/components/studio/views/favorites-view";
import { LedgerView } from "@/components/studio/views/ledger-view";
import { SettingsView } from "@/components/studio/views/settings-view";
import type {
  StudioInitialData,
  StudioProject,
  StudioView,
} from "@/lib/studio/types";

const navigation: Array<{
  id: StudioView;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: "studio", label: "Studio", icon: LayoutDashboard },
  { id: "assets", label: "Assets", icon: Images },
  { id: "queue", label: "Queue", icon: ListVideo },
  { id: "favorites", label: "Favorites", icon: Heart },
  { id: "ledger", label: "Ledger", icon: ReceiptText },
  { id: "settings", label: "Settings", icon: Settings },
];

export function StudioShell({ initial }: { initial: StudioInitialData }) {
  const [view, setView] = useState<StudioView>("studio");
  const [projects, setProjects] = useState(initial.projects);
  const [activeProject, setActiveProject] = useState(initial.activeProject);
  const [projectDialog, setProjectDialog] = useState<
    "create" | "rename" | "archive" | "trash" | null
  >(null);
  const workspace = initial.activeWorkspace;
  const canEdit = workspace.role !== "viewer";

  function selectWorkspace(id: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("workspace", id);
    url.searchParams.delete("project");
    window.location.assign(url);
  }
  function selectProject(project: StudioProject) {
    setActiveProject(project);
    const url = new URL(window.location.href);
    url.searchParams.set("project", project.id);
    window.history.replaceState({}, "", url);
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
    } else if (!next.some((project) => project.id === activeProject?.id))
      setActiveProject(next[0] || null);
    setProjectDialog(null);
  }

  const body = activeProject ? (
    {
      studio: (
        <GenerationComposer
          workspace={workspace}
          project={activeProject}
          capabilities={initial.capabilities}
          onQueue={() => setView("queue")}
        />
      ),
      assets: <AssetLibrary workspace={workspace} project={activeProject} />,
      queue: <QueueView workspace={workspace} project={activeProject} />,
      favorites: (
        <FavoritesView workspace={workspace} project={activeProject} />
      ),
      ledger: <LedgerView workspace={workspace} />,
      settings: <SettingsView workspace={workspace} />,
    }[view]
  ) : (
    <section className="empty-state">
      <FolderKanban />
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
    <div className="studio-app">
      <aside className="studio-sidebar">
        <button
          className="brand-button"
          onClick={() => setView("studio")}
          data-testid="nav-brand-home"
        >
          <VesperMark />
        </button>
        <nav aria-label="Workspace navigation">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "active" : ""}
              onClick={() => setView(item.id)}
              data-testid={`nav-${item.id}`}
            >
              <item.icon />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <form action="/auth/signout" method="post" className="sidebar-account">
          <button type="submit">
            <UserRound />
            <span>
              <strong>{initial.user.displayName}</strong>
              <small>Sign out</small>
            </span>
          </button>
        </form>
      </aside>
      <main className="studio-main">
        <header className="studio-topbar">
          <div className="workspace-controls">
            <label>
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
              <ChevronDown aria-hidden="true" />
            </label>
            <span className="topbar-divider" />
            <label>
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
              <ChevronDown aria-hidden="true" />
            </label>
          </div>
          <div className="project-actions">
            {canEdit && (
              <button
                className="button subtle"
                onClick={() => setProjectDialog("create")}
                data-testid="project-create"
              >
                <Plus /> New project
              </button>
            )}
            {canEdit && activeProject && (
              <details className="overflow-menu">
                <summary aria-label="Project actions">•••</summary>
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
        </header>
        <div className="studio-content">{body}</div>
      </main>
      <nav className="mobile-nav" aria-label="Mobile workspace navigation">
        {navigation.slice(0, 5).map((item) => (
          <button
            key={item.id}
            className={view === item.id ? "active" : ""}
            onClick={() => setView(item.id)}
          >
            <item.icon />
            <span>{item.label}</span>
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
