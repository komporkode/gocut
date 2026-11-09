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

export function formatRelativeDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (isToday) {
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear();
    if (isYesterday) {
      return "Kemarin";
    }
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  } catch {
    return "";
  }
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

export function GoCutLogoIcon({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 326 350"
      fill="currentColor"
      className={className}
    >
      <path d="M177.51 224.9l74.87 0c-13.15,32.51 -45.02,55.45 -82.25,55.45 -48.98,0 -88.69,-39.71 -88.69,-88.69 0,-38.65 24.73,-71.53 59.23,-83.68l30.55 -88.18 -16.34 2.23c-3.73,0.51 -4.43,0.6 -7.65,1.03 -83.13,11.1 -147.23,79.12 -147.23,168.59 0,90.64 76.17,170.13 170.13,170.13 73.7,0 136.46,-46.87 160.09,-112.42 8.46,-23.45 17.45,-56.47 19.87,-80.88 0.54,-5.45 0.63,-13.7 -9.24,-13.7l-90.04 0 -45.95 0c-3.44,0 -7.36,2.81 -8.7,6.26l-22.47 57.59c-1.34,3.44 0.37,6.26 3.82,6.26z" />
      <polygon points="222.85,96.27 253.29,8.38 196.11,16.2 165.66,104.09" />
      <path d="M278.11 4.99l-30.45 87.89 77.68 -10.63c3.74,-0.51 6.38,-3.99 5.87,-7.73l-9.38 -68.58c-0.51,-3.74 -3.99,-6.38 -7.73,-5.87l-35.99 4.92z" />
    </svg>
  );
}

export interface NewProjectConfig {
  name: string;
  width: number;
  height: number;
  fps: number;
}

interface ProjectDashboardProps {
  onOpenProject: (path: string) => void;
  onNewProject: (config?: NewProjectConfig) => void;
  onOpenExternalFile?: () => void;
  onDropFiles?: (files: File[], paths?: string[]) => void;
}

const ASPECT_RATIO_PRESETS = [
  { id: "16:9", label: "16:9 Landscape", desc: "1920 × 1080 (YouTube / Desktop)", width: 1920, height: 1080 },
  { id: "9:16", label: "9:16 Vertical", desc: "1080 × 1920 (TikTok / Reels / Shorts)", width: 1080, height: 1920 },
  { id: "1:1", label: "1:1 Square", desc: "1080 × 1080 (Feed / Carousel)", width: 1080, height: 1080 },
  { id: "4:5", label: "4:5 Portrait", desc: "1080 × 1350 (Instagram Portrait)", width: 1080, height: 1350 },
] as const;

export default function ProjectDashboard({
  onOpenProject,
  onNewProject,
  onOpenExternalFile,
  onDropFiles,
}: ProjectDashboardProps) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<"recent" | "name">("recent");
  const [activeMenuPath, setActiveMenuPath] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounter = useRef(0);

  // Modals state
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjName, setNewProjName] = useState("");
  const [newProjAspect, setNewProjAspect] = useState<string>("16:9");
  const [newProjFps, setNewProjFps] = useState<number>(30);
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

  const handleCreateNew = () => {
    const defaultTitle = t("project.untitled") || "Proyek Tanpa Judul";
    const nextIdx = projects.length + 1;
    setNewProjName(`${defaultTitle} ${nextIdx}`);
    setNewProjAspect("16:9");
    setNewProjFps(30);
    setShowNewProjectModal(true);
  };

  const handleConfirmCreateNew = () => {
    const preset = ASPECT_RATIO_PRESETS.find((p) => p.id === newProjAspect) ?? ASPECT_RATIO_PRESETS[0];
    const finalName = newProjName.trim() || t("project.untitled") || "Proyek Tanpa Judul";
    setShowNewProjectModal(false);
    onNewProject({
      name: finalName,
      width: preset.width,
      height: preset.height,
      fps: newProjFps,
    });
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
    <div
      className={`project-dashboard ${isDraggingOver ? "is-drag-over" : ""}`}
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        dragCounter.current++;
        setIsDraggingOver(true);
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        dragCounter.current = Math.max(0, dragCounter.current - 1);
        if (dragCounter.current === 0) setIsDraggingOver(false);
      }}
      onDrop={async (e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current = 0;
        setIsDraggingOver(false);
        const files = Array.from(e.dataTransfer.files);
        const paths = window.editorAPI?.resolveFilePaths
          ? await window.editorAPI.resolveFilePaths(files)
          : window.editorAPI
            ? files.map((file) => window.editorAPI!.getPathForFile(file)).filter(Boolean)
            : [];
        onDropFiles?.(files, paths);
      }}
    >
      <div className="dashboard-container">
        {/* Header */}
        <header className="dashboard-header">
          <div className="dashboard-logo">
            <img src="./icons/gocut_title.png" alt="GoCut" className="dashboard-logo-img" />
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

        {/* Compact Minimalist Hero Banner */}
        <section className="dashboard-hero">
          <div className="dashboard-hero-content">
            <h1>{t("dashboard.heroTitle") || "Selamat Datang di GoCut"}</h1>
          </div>
          <div className="dashboard-hero-actions">
            <button className="dashboard-hero-btn" onClick={handleCreateNew}>
              <Plus size={18} />
              <span>{t("toolbar.newProject")}</span>
            </button>
            <button
              className="secondary-action-btn"
              style={{ height: 40 }}
              onClick={onOpenExternalFile}
              title={t("toolbar.openProject")}
            >
              <FolderOpen size={16} />
              <span>{t("toolbar.openProject")}</span>
            </button>
          </div>
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
                        <div className="project-thumbnail-neon">
                          <div className="neon-logo-box">
                            <GoCutLogoIcon size={24} />
                          </div>
                        </div>
                      )}
                      <div className="project-duration-badge">
                        {formatProjectDuration(p.duration)}
                      </div>
                    </div>

                    {/* Top-Right Context Menu Trigger Button */}
                    <button
                      className={`project-card-menu-btn ${isMenuOpen ? "active" : ""}`}
                      title="Opsi Proyek"
                      aria-label={`Opsi untuk ${p.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuPath(isMenuOpen ? null : p.path);
                      }}
                    >
                      <MoreVertical size={16} />
                    </button>

                    <div className="project-info">
                      <div className="project-header-row">
                        <div className="project-card-title" title={p.name}>
                          {p.name}
                        </div>
                      </div>
                      <div className="project-meta-row">
                        <span>{formatBytes(p.sizeBytes)}</span>
                        {p.updatedAt && (
                          <>
                            <span>•</span>
                            <span>{formatRelativeDate(p.updatedAt)}</span>
                          </>
                        )}
                      </div>
                    </div>

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
                          <span>{t("dashboard.duplicateProject") || "Duplikat Proyek"}</span>
                        </button>
                        <div className="context-menu-divider" />
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

      {/* New Project Setup Modal */}
      {showNewProjectModal && (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowNewProjectModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <header>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Film size={17} style={{ color: "#22d3ee" }} />
                <h3>{t("toolbar.newProject") || "Buat Proyek Baru"}</h3>
              </div>
              <button className="icon-btn" onClick={() => setShowNewProjectModal(false)}>
                <X size={16} />
              </button>
            </header>
            <div className="modal-body" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>
                  Nama Proyek
                </label>
                <input
                  type="text"
                  className="text-input"
                  autoFocus
                  placeholder="Proyek Tanpa Judul"
                  style={{ width: "100%", padding: "10px 12px", background: "#14171f", border: "1px solid #2e3446", color: "#fff", borderRadius: 8, fontSize: 13 }}
                  value={newProjName}
                  onChange={(e) => setNewProjName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleConfirmCreateNew();
                    if (e.key === "Escape") setShowNewProjectModal(false);
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 8 }}>
                  Rasio Aspek & Resolusi Kanvas
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {ASPECT_RATIO_PRESETS.map((preset) => {
                    const active = newProjAspect === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setNewProjAspect(preset.id)}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-start",
                          gap: 3,
                          padding: "10px 12px",
                          borderRadius: 8,
                          border: active ? "1px solid #06b6d4" : "1px solid rgba(255,255,255,0.08)",
                          background: active ? "rgba(6, 182, 212, 0.14)" : "rgba(255,255,255,0.03)",
                          color: "#f4f4f5",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <strong style={{ fontSize: 13, color: active ? "#22d3ee" : "#fff" }}>{preset.label}</strong>
                        <span style={{ fontSize: 11, color: "#9ca3af" }}>{preset.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 8 }}>
                  Frame Rate (FPS)
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {[
                    { fps: 24, label: "24 FPS", sub: "Cinematic" },
                    { fps: 30, label: "30 FPS", sub: "Standard" },
                    { fps: 60, label: "60 FPS", sub: "Smooth" },
                  ].map((item) => {
                    const active = newProjFps === item.fps;
                    return (
                      <button
                        key={item.fps}
                        type="button"
                        onClick={() => setNewProjFps(item.fps)}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 2,
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: active ? "1px solid #06b6d4" : "1px solid rgba(255,255,255,0.08)",
                          background: active ? "rgba(6, 182, 212, 0.14)" : "rgba(255,255,255,0.03)",
                          color: "#f4f4f5",
                          cursor: "pointer",
                        }}
                      >
                        <strong style={{ fontSize: 13, color: active ? "#22d3ee" : "#fff" }}>{item.label}</strong>
                        <span style={{ fontSize: 10, color: "#9ca3af" }}>{item.sub}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <footer>
              <button className="secondary-btn" onClick={() => setShowNewProjectModal(false)}>
                {t("dialog.cancel") || "Batal"}
              </button>
              <button className="primary" onClick={handleConfirmCreateNew}>
                <Plus size={15} />
                <span>Buat Proyek</span>
              </button>
            </footer>
          </div>
        </div>
      )}

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
