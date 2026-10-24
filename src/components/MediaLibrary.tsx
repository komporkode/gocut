import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  AudioLines,
  Check,
  FileImage,
  Film,
  FolderOpen,
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

export interface MediaLibraryProps {
  project: Project;
  onImport: (paths?: string[]) => void;
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
  const dragCounter = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setSelected(null);
    setMenu(null);
    setQuery("");
  }, [project.id]);
  const filtered = project.assets.filter(
    (asset) =>
      (kind === "all" || asset.kind === kind) &&
      asset.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const startImport = () => {
    if (!window.editorAPI && onImportFiles) fileInput.current?.click();
    else onImport();
  };
  const receiveFiles = (files: File[]) => {
    if (!files.length) return;
    const paths = window.editorAPI
      ? files
          .map((file) => window.editorAPI!.getPathForFile(file))
          .filter(Boolean)
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
    receiveFiles(Array.from(event.dataTransfer.files));
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
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            className="media-import"
            style={{ padding: "0 8px" }}
            title="Create Solid Color (Color Matte)"
            aria-label="Create Solid Color"
            onClick={() => setShowColorPicker(!showColorPicker)}
          >
            <Palette size={13} />
          </button>
          <button
            className="media-import"
            onClick={startImport}
            disabled={importing}
          >
            {importing ? (
              <LoaderCircle size={13} className="media-spin" />
            ) : (
              <Plus size={13} />
            )}{" "}
            {importing ? t("media.importing") : t("media.import")}
          </button>
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
