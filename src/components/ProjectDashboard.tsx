import { useState, useEffect, useMemo, useRef } from "react";
import {
  Film,
  Plus,
  FolderOpen,
  Search,
  MoreVertical,
  Pencil,
  Copy,
  Trash2,
  Video,
  AlertTriangle,
  X,
  Play,
  Clock,
  Sparkles,
} from "lucide-react";
import type { ProjectInfo } from "../core/types";
import { editorAPI } from "../wails/wailsBridge";
import { useTranslation } from "../i18n";
import "./ProjectDashboard.css";

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  if (i === 0) return `${bytes} B`;
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(1)} ${units[i]}`;
}

export function formatProjectDuration(seconds: number): string {
  if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) return "00:00";
  const total = Math.round(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function filterAndSortProjects(
  projects: ProjectInfo[],
  query: string,
  sortMode: "recent" | "name",
): ProjectInfo[] {
  const cleanQ = query.trim().toLowerCase();
  const filtered = cleanQ
    ? projects.filter((p) => p.name.toLowerCase().includes(cleanQ))
    : [...projects];

  if (sortMode === "name") {
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }
  return filtered.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

interface ProjectDashboardProps {
  onOpenProject: (path: string) => void;
  onNewProject: () => void;
  onOpenExternalFile?: () => void;
}

export default function ProjectDashboard({
  onOpenProject,
  onNewProject,
  onOpenExternalFile,
}: ProjectDashboardProps) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<"recent" | "name">("recent");
  const [activeMenuPath, setActiveMenuPath] = useState<string | null>(null);

  // Modals state
  const [renameTarget, setRenameTarget] = useState<ProjectInfo | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ProjectInfo | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  const loadProjects = async () => {
    try {
      const items = await editorAPI.listProjects();
      setProjects(items);
    } catch {
      setProjects([]);
    }
  };

  useEffect(() => {
    void loadProjects();
  }, []);

  // Close context menu on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenuPath(null);
      }
    };
    window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, []);

  const displayedProjects = useMemo(() => {
    return filterAndSortProjects(projects, searchQuery, sortMode);
  }, [projects, searchQuery, sortMode]);

  const handleCreateNew = async () => {
    try {
      const res = await editorAPI.createProject(t("project.untitled") || "Untitled Project");
      await loadProjects();
      onOpenProject(res.path);
    } catch {
      onNewProject();
    }
  };

  const handleDuplicate = async (path: string) => {
    setActiveMenuPath(null);
    try {
      await editorAPI.duplicateProject(path);
      await loadProjects();
    } catch (err) {
      console.error("Duplicate failed", err);
    }
  };

  const handleRenameConfirm = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    try {
      await editorAPI.renameProject(renameTarget.path, renameValue.trim());
      setRenameTarget(null);
      await loadProjects();
    } catch (err) {
      console.error("Rename failed", err);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await editorAPI.deleteProject(deleteTarget.path);
      setDeleteTarget(null);
      await loadProjects();
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  return (
    <div className="project-dashboard">
      <div className="dashboard-container">
        {/* Header */}
        <header className="dashboard-header">
          <div className="dashboard-logo">
            <div className="dashboard-logo-icon">
              <Film size={18} />
            </div>
            <span>GoCut</span>
          </div>
          <div className="dashboard-actions">
            <button
              className="secondary-action-btn"
              onClick={onOpenExternalFile}
              title={t("toolbar.openProject")}
            >
              <FolderOpen size={16} />
              <span>{t("toolbar.openProject")}</span>
            </button>
          </div>
        </header>

        {/* Hero Banner */}
        <section className="dashboard-hero">
          <div className="dashboard-hero-content">
            <h1>{t("dashboard.heroTitle") || "Buat Video Hebat Anda"}</h1>
            <p>
              {t("dashboard.heroSubtitle") ||
                "Editor video desktop offline yang cepat, ringan, dan canggih dengan alur kerja modern ala CapCut."}
            </p>
          </div>
          <button className="dashboard-hero-btn" onClick={handleCreateNew}>
            <Plus size={20} />
            <span>{t("toolbar.newProject")}</span>
          </button>
        </section>

        {/* Projects Section */}
        <section className="projects-section">
          <div className="projects-section-header">
            <div className="projects-section-title">
              <h2>{t("settings.recentProjects")}</h2>
              <span className="projects-count">{displayedProjects.length}</span>
            </div>

            <div className="projects-controls">
              <div className="search-input-box">
                <Search size={15} />
                <input
                  type="text"
                  placeholder={t("common.search") || "Cari proyek..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", padding: 0 }}
                    onClick={() => setSearchQuery("")}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <select
                className="secondary-action-btn"
                style={{ height: 36, padding: "0 10px" }}
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as "recent" | "name")}
              >
                <option value="recent">{t("dashboard.sortRecent") || "Terakhir Diedit"}</option>
                <option value="name">{t("dashboard.sortName") || "Nama A-Z"}</option>
              </select>
            </div>
          </div>

          {/* Cards Grid */}
          {displayedProjects.length > 0 ? (
            <div className="projects-grid" style={{ marginTop: 20 }}>
              {displayedProjects.map((p) => {
                const isMenuOpen = activeMenuPath === p.path;
                return (
                  <div
                    key={p.path}
                    className="project-card"
                    onClick={() => onOpenProject(p.path)}
                  >
                    <div className="project-thumbnail">
                      {p.cover ? (
                        <img src={p.cover} alt={p.name} />
                      ) : (
                        <div className="project-thumbnail-placeholder">
                          <Video size={36} />
                        </div>
                      )}

                      <button
                        className={`project-card-menu-btn ${isMenuOpen ? "active" : ""}`}
                        title="Opsi Proyek"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuPath(isMenuOpen ? null : p.path);
                        }}
                      >
                        <MoreVertical size={16} />
                      </button>

                      {isMenuOpen && (
                        <div
                          ref={menuRef}
                          className="card-context-menu"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="context-menu-item"
                            onClick={() => {
                              setActiveMenuPath(null);
                              onOpenProject(p.path);
                            }}
                          >
                            <Play size={14} />
                            <span>{t("common.open") || "Buka"}</span>
                          </button>
                          <button
                            className="context-menu-item"
                            onClick={() => {
                              setActiveMenuPath(null);
                              setRenameTarget(p);
                              setRenameValue(p.name);
                            }}
                          >
                            <Pencil size={14} />
                            <span>{t("common.rename") || "Ganti Nama"}</span>
                          </button>
                          <button
                            className="context-menu-item"
                            onClick={() => handleDuplicate(p.path)}
                          >
                            <Copy size={14} />
                            <span>{t("shortcuts.duplicate") || "Duplikat"}</span>
                          </button>
                          <button
                            className="context-menu-item danger"
                            onClick={() => {
                              setActiveMenuPath(null);
                              setDeleteTarget(p);
                            }}
                          >
                            <Trash2 size={14} />
                            <span>{t("toolbar.delete") || "Hapus"}</span>
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="project-info">
                      <div className="project-title" title={p.name}>
                        {p.name}
                      </div>
                      <div className="project-meta">
                        <span>{formatBytes(p.sizeBytes)}</span>
                        <span>•</span>
                        <span>{formatProjectDuration(p.duration)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="projects-empty-state" style={{ marginTop: 24 }}>
              <div className="empty-state-icon">
                <Film size={28} />
              </div>
              <h3>{t("settings.recentProjects.empty") || "Belum ada proyek"}</h3>
              <p>
                {searchQuery
                  ? "Tidak ada proyek yang cocok dengan kata kunci pencarian."
                  : "Mulai perjalanan kreatif Anda dengan membuat proyek pertama."}
              </p>
              <button className="dashboard-hero-btn" onClick={handleCreateNew}>
                <Plus size={18} />
                <span>{t("toolbar.newProject")}</span>
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Rename Modal */}
      {renameTarget && (
        <div className="modal-backdrop" role="presentation" onClick={() => setRenameTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <header>
              <h3>{t("common.rename") || "Ganti Nama Proyek"}</h3>
              <button className="icon-btn" onClick={() => setRenameTarget(null)}>
                <X size={16} />
              </button>
            </header>
            <div className="modal-body" style={{ padding: "16px 20px" }}>
              <input
                type="text"
                className="text-input"
                autoFocus
                style={{ width: "100%", padding: "10px 12px", background: "#1a1e26", border: "1px solid #374151", color: "#fff", borderRadius: 8 }}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleRenameConfirm();
                  if (e.key === "Escape") setRenameTarget(null);
                }}
              />
            </div>
            <footer>
              <button className="secondary-btn" onClick={() => setRenameTarget(null)}>
                {t("dialog.cancel") || "Batal"}
              </button>
              <button className="primary" onClick={handleRenameConfirm}>
                {t("common.save") || "Simpan"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="modal-backdrop" role="presentation" onClick={() => setDeleteTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <header>
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#ef4444" }}>
                <AlertTriangle size={20} />
                <h3 style={{ margin: 0, color: "#fff" }}>{t("toolbar.delete") || "Hapus Proyek"}</h3>
              </div>
              <button className="icon-btn" onClick={() => setDeleteTarget(null)}>
                <X size={16} />
              </button>
            </header>
            <div className="modal-body" style={{ padding: "16px 20px", color: "#d1d5db", fontSize: 14, lineHeight: 1.5 }}>
              Apakah Anda yakin ingin menghapus proyek <strong>"{deleteTarget.name}"</strong> secara permanen? Tindakan ini tidak dapat dibatalkan.
            </div>
            <footer>
              <button className="secondary-btn" onClick={() => setDeleteTarget(null)}>
                {t("dialog.cancel") || "Batal"}
              </button>
              <button
                className="primary"
                style={{ background: "#ef4444", borderColor: "#ef4444", color: "#fff" }}
                onClick={handleDeleteConfirm}
              >
                {t("toolbar.delete") || "Hapus"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
