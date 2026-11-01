import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  AudioLines,
  Check,
  ChevronDown,
  FileImage,
  Film,
  Folder,
  FolderOpen,
  FolderPlus,
  Grid2X2,
  Image,
  List,
  LoaderCircle,
  MoreHorizontal,
  Music2,
  Palette,
  Plus,
  Play,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { MediaAsset, MediaKind, Project } from "../core/types";
import { createSolidColorAsset } from "../core/model";
import { useEditorStore } from "../editor/store";
import { ASSET_DRAG_TYPE } from "./Timeline";
import "./MediaLibrary.css";
import { useTranslation } from "../i18n";

export interface FolderItem {
  path: string;
  name: string;
  count: number;
}

export function extractFolderTree(assets: MediaAsset[]): FolderItem[] {
  const map = new Map<string, number>();
  for (const asset of assets) {
    if (asset.folder) {
      const normalized = asset.folder.replace(/\\/g, "/").trim();
      if (normalized) {
        map.set(normalized, (map.get(normalized) || 0) + 1);
      }
    }
  }
  const result: FolderItem[] = [];
  const sortedPaths = [...map.keys()].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
  for (const p of sortedPaths) {
    const name = p.split("/").pop() || p;
    result.push({ path: p, name, count: map.get(p) || 0 });
  }
  return result;
}

export interface MediaLibraryProps {
  project: Project;
  onImport: (paths?: string[]) => void;
  onImportFolder?: (path?: string) => void;
  onAddAsset: (assetId: string) => void;
  onRemoveAsset: (assetId: string) => void;
  importing?: boolean;
  onImportFiles?: (files: File[]) => void;
  onRevealAsset?: (assetId: string) => void;
  onPreviewAsset?: (assetId: string) => void;
}
export function formatMediaDuration(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
function KindIcon({ kind, size = 12 }: { kind: MediaKind; size?: number }) {
  return kind === "audio" ? (
    <Music2 size={size} />
  ) : kind === "image" ? (
    <Image size={size} />
  ) : (
    <Film size={size} />
  );
}

export default function MediaLibrary({
  project,
  onImport,
  onImportFolder,
  onAddAsset,
  onRemoveAsset,
  importing = false,
  onImportFiles,
  onRevealAsset,
  onPreviewAsset,
}: MediaLibraryProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<MediaKind | "all">("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [customColor, setCustomColor] = useState("#000000");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const dragCounter = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const folders = extractFolderTree(project.assets);

  useEffect(() => {
    setSelected(null);
    setMenu(null);
    setQuery("");
    setActiveFolder(null);
  }, [project.id]);

  const filtered = project.assets.filter((asset) => {
    if (kind !== "all" && asset.kind !== kind) return false;
    if (activeFolder !== null) {
      if (asset.folder !== activeFolder && !asset.folder?.startsWith(activeFolder + "/")) {
        return false;
      }
    }
    return asset.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  });
  const startImport = () => {
    if (!window.editorAPI && onImportFiles) fileInput.current?.click();
    else onImport();
  };
  const receiveFiles = async (files: File[]) => {
    if (!files.length) return;
    const paths = window.editorAPI?.resolveFilePaths
      ? await window.editorAPI.resolveFilePaths(files)
      : window.editorAPI
        ? files.map((file) => window.editorAPI!.getPathForFile(file)).filter(Boolean)
        : [];
    if (paths.length) {
      onImport(paths);
    } else {
      onImportFiles?.(files);
    }
  };
  const dropFiles = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current = 0;
    setDraggingFiles(false);
    void receiveFiles(Array.from(event.dataTransfer.files));
  };
  const addSolid = (hex: string, name?: string) => {
    const asset = createSolidColorAsset(hex, name ?? `Solid ${hex}`, project.width, project.height);
    useEditorStore.getState().addAssets([asset]);
    setShowColorPicker(false);
  };
  const item = (asset: MediaAsset) => {
    const inTimeline = project.clips.some((c) => c.assetId === asset.id);
    const kindLabel =
      asset.kind === "audio"
        ? t("media.filterAudio")
        : asset.kind === "image"
          ? t("media.filterImage")
          : t("media.filterVideo");
    return (
      <div
        key={asset.id}
        data-asset-id={asset.id}
        role="button"
        tabIndex={0}
        aria-label={`${asset.name}，${kindLabel}${asset.missing ? `，${t("media.missing")}` : ""}`}
        aria-pressed={selected === asset.id}
        className={`media-item media-item-${asset.kind} ${selected === asset.id ? "is-selected" : ""} ${asset.missing ? "is-missing" : ""}`}
        draggable={!asset.missing}
        onDragStart={(event) => {
          event.dataTransfer.setData(ASSET_DRAG_TYPE, asset.id);
          event.dataTransfer.setData(
            `application/x-reacut-kind-${asset.kind}`,
            asset.kind,
          );
          event.dataTransfer.effectAllowed = "copy";
          setSelected(asset.id);
          setMenu(null);
        }}
        onClick={(event) => {
          setSelected(asset.id);
          setMenu(null);
          if (!(event.target as HTMLElement).closest("button")) onPreviewAsset?.(asset.id);
        }}
        onDoubleClick={(event) => {
          if (
            !(event.target as HTMLElement).closest("button") &&
            !asset.missing
          )
            onAddAsset(asset.id);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          setSelected(asset.id);
          setMenu(asset.id);
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === " " && onPreviewAsset) {
            event.preventDefault();
            event.stopPropagation();
            setSelected(asset.id);
            onPreviewAsset(asset.id);
          }
          if (event.key === "Enter" && !asset.missing) {
            event.preventDefault();
            onAddAsset(asset.id);
          }
          if (event.key === "Delete") {
            event.preventDefault();
            onRemoveAsset(asset.id);
          }
        }}
      >
        <div className="media-preview">
          {asset.kind !== "audio" &&
          (asset.thumbnail || asset.kind === "image") ? (
            <img
              src={asset.thumbnail || asset.url}
              alt=""
              draggable={false}
              loading="lazy"
            />
          ) : (
            <div className="media-placeholder">
              {asset.kind === "audio" ? (
                <AudioLines size={27} />
              ) : (
                <Film size={27} />
              )}
            </div>
          )}
          {asset.kind === "audio" && asset.waveform && (
            <div className="media-audio-wave" aria-hidden="true">
              {Array.from({ length: 40 }, (_, i) => (
                <i
                  key={i}
                  style={{
                    height: `${8 + (asset.waveform![Math.floor((i / 40) * asset.waveform!.length)] ?? 0.3) * 75}%`,
                  }}
                />
              ))}
            </div>
          )}
          <span className="media-kind">
            <KindIcon kind={asset.kind} />
          </span>
          <span className="media-time">
            {asset.kind === "image"
              ? t("media.filterImage")
              : formatMediaDuration(asset.duration)}
          </span>
          {inTimeline && (
            <span className="media-used" title={t("media.usedInTimeline")}>
              <Check size={10} />
            </span>
          )}
          {asset.missing && <span className="media-missing">{t("media.missing")}</span>}
          <button
            className="media-add"
            aria-label={`${t("media.addToTimeline")}: ${asset.name}`}
            title={t("media.footerHint")}
            disabled={asset.missing}
            onClick={(event) => {
              event.stopPropagation();
              onAddAsset(asset.id);
            }}
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="media-info">
          <span className="media-name" title={asset.name}>
            {asset.name}
          </span>
          <span className="media-metadata">
            {asset.kind === "audio"
              ? t("media.filterAudio")
              : `${asset.width} × ${asset.height}`}{" "}
            {asset.kind === "video" && asset.fps > 0
              ? `· ${Math.round(asset.fps * 100) / 100} fps`
              : ""}
          </span>
        </div>
        <button
          className="media-more"
          title={t("media.title")}
          aria-label={`${asset.name} ${t("media.title")}`}
          aria-expanded={menu === asset.id}
          onClick={(event) => {
            event.stopPropagation();
            setMenu(menu === asset.id ? null : asset.id);
            setSelected(asset.id);
          }}
        >
          <MoreHorizontal size={15} />
        </button>
        {menu === asset.id && (
          <div
            className="media-context"
            onClick={(event) => event.stopPropagation()}
          >
            {onPreviewAsset && <button onClick={() => { onPreviewAsset(asset.id);setMenu(null); }}><Play size={13} /> {t("media.previewMedia")}</button>}
            <button
              disabled={asset.missing}
              onClick={() => {
                onAddAsset(asset.id);
                setMenu(null);
              }}
            >
              <Plus size={13} /> {t("media.addToTimeline")}
            </button>
            {onRevealAsset && (
              <button
                onClick={() => {
                  onRevealAsset(asset.id);
                  setMenu(null);
                }}
              >
                <FolderOpen size={13} />{" "}
                {asset.missing ? t("media.relink") : t("media.revealInFolder")}
              </button>
            )}
            <button
              className="media-context-remove"
              onClick={() => {
                onRemoveAsset(asset.id);
                setMenu(null);
                if (selected === asset.id) setSelected(null);
              }}
            >
              <Trash2 size={13} /> {t("media.delete")}
            </button>
          </div>
        )}
      </div>
    );
  };
  return (
    <section
      className={`media-library ${draggingFiles ? "is-file-drop" : ""}`}
      aria-label={t("media.title")}
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          dragCounter.current++;
          setDraggingFiles(true);
        }
      }}
      onDragLeave={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          dragCounter.current--;
          if (dragCounter.current <= 0) setDraggingFiles(false);
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={dropFiles}
    >
      <input
        ref={fileInput}
        className="media-file-input"
        type="file"
        multiple
        accept="video/*,audio/*,image/*,.mkv,.mov,.mp4,.webm,.mp3,.wav,.aac,.flac,.m4a,.ogg"
        onChange={(event) => {
          receiveFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <div className="media-top">
        <div className="media-top-title">
          <FolderOpen size={15} />
          <span>{t("media.projectMedia")}</span>
          <b>{project.assets.length}</b>
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <button
            className="media-import"
            style={{ padding: "0 8px" }}
            title="Create Solid Color (Color Matte)"
            aria-label="Create Solid Color"
            onClick={() => setShowColorPicker(!showColorPicker)}
          >
            <Palette size={13} />
          </button>
          <div className="media-import-split" style={{ position: "relative", display: "inline-flex" }}>
            <button
              className="media-import"
              onClick={startImport}
              disabled={importing}
              style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
            >
              {importing ? (
                <LoaderCircle size={13} className="media-spin" />
              ) : (
                <Plus size={13} />
              )}{" "}
              {importing ? t("media.importing") : t("media.import")}
            </button>
            <button
              className="media-import media-import-arrow"
              style={{
                padding: "0 6px",
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
                borderLeft: "1px solid rgba(255,255,255,0.15)",
              }}
              onClick={() => setImportMenuOpen(!importMenuOpen)}
              title="Import Options"
              aria-label="Import Options"
            >
              <ChevronDown size={12} />
            </button>
            {importMenuOpen && (
              <div
                className="media-import-dropdown"
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: "4px",
                  background: "#1c1c22",
                  border: "1px solid #333",
                  borderRadius: "6px",
                  padding: "4px",
                  zIndex: 60,
                  boxShadow: "0 6px 18px rgba(0,0,0,0.6)",
                  display: "flex",
                  flexDirection: "column",
                  minWidth: "140px",
                  gap: "2px",
                }}
              >
                <button
                  className="media-import-menu-item"
                  onClick={() => {
                    setImportMenuOpen(false);
                    startImport();
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "6px 10px",
                    background: "transparent",
                    border: "none",
                    color: "#ddd",
                    fontSize: "12px",
                    cursor: "pointer",
                    textAlign: "left",
                    borderRadius: "4px",
                  }}
                >
                  <Plus size={13} /> {t("media.importFiles")}
                </button>
                <button
                  className="media-import-menu-item"
                  onClick={() => {
                    setImportMenuOpen(false);
                    onImportFolder?.();
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "6px 10px",
                    background: "transparent",
                    border: "none",
                    color: "#ddd",
                    fontSize: "12px",
                    cursor: "pointer",
                    textAlign: "left",
                    borderRadius: "4px",
                  }}
                >
                  <FolderPlus size={13} /> {t("media.importFolder")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {showColorPicker && (
        <div
          className="media-color-popover"
          style={{
            position: "absolute",
            top: "44px",
            right: "12px",
            background: "#222",
            border: "1px solid #444",
            borderRadius: "8px",
            padding: "10px",
            zIndex: 50,
            boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            width: "200px",
          }}
        >
          <strong style={{ fontSize: "11px", color: "#ccc" }}>Solid Color (Color Matte)</strong>
          <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
            {[
              { color: "#000000", name: "Black" },
              { color: "#ffffff", name: "White" },
              { color: "#00ff00", name: "Green Screen" },
              { color: "#0078d7", name: "Blue" },
              { color: "#e11d48", name: "Red" },
              { color: "#7c3aed", name: "Purple" },
            ].map((p) => (
              <button
                key={p.color}
                title={p.name}
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "4px",
                  background: p.color,
                  border: "1px solid #555",
                  cursor: "pointer",
                }}
                onClick={() => addSolid(p.color, p.name)}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "4px" }}>
            <input
              type="color"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              style={{ width: "32px", height: "24px", padding: 0, border: "0", cursor: "pointer", borderRadius: "4px" }}
            />
            <button
              className="media-import"
              style={{ flex: 1, padding: "4px 8px", fontSize: "11px" }}
              onClick={() => addSolid(customColor, `Solid ${customColor}`)}
            >
              Add Custom
            </button>
          </div>
        </div>
      )}
      <div className="media-folder-bar">
        <button
          className={`media-folder-pill ${activeFolder === null ? "is-active" : ""}`}
          onClick={() => setActiveFolder(null)}
          title={t("media.allMedia")}
        >
          <FolderOpen size={12} />
          <span>{t("media.allMedia")}</span>
          <span className="media-folder-badge">{project.assets.length}</span>
        </button>
        {folders.map((f) => (
          <div key={f.path} className="media-folder-pill-group">
            <button
              className={`media-folder-pill ${activeFolder === f.path ? "is-active" : ""}`}
              onClick={() => setActiveFolder(f.path)}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-gocut-folder", f.path);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                const assetId = e.dataTransfer.getData(ASSET_DRAG_TYPE);
                if (assetId) {
                  useEditorStore.getState().moveAssetToFolder(assetId, f.path);
                }
              }}
              title={f.path}
            >
              <Folder size={12} />
              <span>{f.name}</span>
              <span className="media-folder-badge">{f.count}</span>
            </button>
            <button
              className="media-folder-add-btn"
              title={t("media.addAllToTimeline")}
              aria-label={`${t("media.addAllToTimeline")} ${f.name}`}
              onClick={(e) => {
                e.stopPropagation();
                useEditorStore.getState().addFolderToTimeline(f.path, "append");
              }}
            >
              <Plus size={11} />
            </button>
            <button
              className="media-folder-more-btn"
              title="Folder options"
              aria-label={`Options for ${f.name}`}
              onClick={(e) => {
                e.stopPropagation();
                setEditingFolder(editingFolder === f.path ? null : f.path);
              }}
            >
              <MoreHorizontal size={11} />
            </button>
            {editingFolder === f.path && (
              <div className="media-folder-menu" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => {
                    const promptName = window.prompt(t("media.renameFolder"), f.name);
                    if (promptName && promptName.trim() && promptName.trim() !== f.name) {
                      useEditorStore.getState().renameFolder(f.path, promptName.trim());
                    }
                    setEditingFolder(null);
                  }}
                >
                  {t("media.renameFolder")}
                </button>
                <button
                  className="is-danger"
                  onClick={() => {
                    if (window.confirm(`${t("media.deleteFolder")} "${f.name}"?`)) {
                      useEditorStore.getState().deleteFolder(f.path);
                      if (activeFolder === f.path) setActiveFolder(null);
                    }
                    setEditingFolder(null);
                  }}
                >
                  {t("media.deleteFolder")}
                </button>
              </div>
            )}
          </div>
        ))}
        <button
          className="media-folder-new-btn"
          title={t("media.newFolder") || "New Folder"}
          onClick={() => {
            const name = window.prompt(t("media.newFolder") || "New Folder", "New Folder");
            if (name && name.trim()) {
              useEditorStore.getState().createFolder(name.trim());
            }
          }}
        >
          <FolderPlus size={12} />
        </button>
      </div>
      <div className="media-tools">
        <div className="media-search">
          <Search size={13} />
          <input
            aria-label={t("media.searchPlaceholder")}
            placeholder={t("media.searchPlaceholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button aria-label={t("media.clearSearch")} onClick={() => setQuery("")}>
              <X size={12} />
            </button>
          )}
        </div>
        <div className="media-view">
          <button
            title={t("media.gridView")}
            aria-label={t("media.gridView")}
            className={view === "grid" ? "is-active" : ""}
            onClick={() => setView("grid")}
          >
            <Grid2X2 size={14} />
          </button>
          <button
            title={t("media.listView")}
            aria-label={t("media.listView")}
            className={view === "list" ? "is-active" : ""}
            onClick={() => setView("list")}
          >
            <List size={15} />
          </button>
        </div>
      </div>
      <div className="media-filters" role="tablist" aria-label={t("media.title")}>
        {(["all", "video", "audio", "image"] as const).map((value) => (
          <button
            role="tab"
            aria-selected={kind === value}
            key={value}
            className={kind === value ? "is-active" : ""}
            onClick={() => setKind(value)}
          >
            {value === "all"
              ? t("media.filterAll")
              : value === "video"
                ? t("media.filterVideo")
                : value === "audio"
                  ? t("media.filterAudio")
                  : t("media.filterImage")}
            {value !== "all" && (
              <span>
                {project.assets.filter((a) => a.kind === value).length}
              </span>
            )}
          </button>
        ))}
      </div>
      <div
        className={`media-content media-${view}`}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setMenu(null);
            setSelected(null);
          }
        }}
      >
        {filtered.length > 0 ? (
          filtered.map(item)
        ) : project.assets.length > 0 ? (
          <div className="media-empty">
            <Search size={26} />
            <strong>{t("media.noMatchTitle")}</strong>
            <p>{t("media.noMatchDesc")}</p>
            <button
              onClick={() => {
                setQuery("");
                setKind("all");
              }}
            >
              {t("media.viewAll")}
            </button>
          </div>
        ) : (
          <div className="media-empty">
            <div className="media-empty-illustration">
              <Film size={31} />
              <Music2 size={18} />
              <FileImage size={19} />
            </div>
            <strong>{t("media.emptyInspiration")}</strong>
            <p style={{ whiteSpace: "pre-line" }}>
              {t("media.emptyDesc")}
            </p>
            <button
              className="media-empty-import"
              onClick={startImport}
              disabled={importing}
            >
              <Upload size={13} /> {importing ? t("media.importing") : t("media.import")}
            </button>
            <span>{t("media.importHint")}</span>
          </div>
        )}
      </div>
      <div className="media-footer">
        <span>{filtered.length} {t("speech.assets")}</span>
        <span>{t("media.footerHint")}</span>
      </div>
      {draggingFiles && (
        <div className="media-drop-overlay">
          <Upload size={31} />
          <strong>{t("media.dropOverlayTitle")}</strong>
          <span>{t("media.dropOverlayDesc")}</span>
        </div>
      )}
    </section>
  );
}
