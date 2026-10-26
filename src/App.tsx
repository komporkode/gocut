import SpeechDialog from "./components/SpeechDialog";
import DerivativeDialog from "./components/DerivativeDialog";
import { version as appVersion } from "../package.json";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Columns3,
  AudioLines,
  Check,
  CheckCircle2,
  ChevronDown,
  CloudOff,
  Download,
  FilePlus2,
  FolderOpen,
  Globe,
  Info,
  Keyboard,
  LoaderCircle,
  Monitor,
  Music2,
  MessageSquare,
  Shapes,
  Play,
  Save,
  Settings2,
  Sparkles,
  Subtitles,
  Type,
  Upload,
  Video,
  WandSparkles,
  X,
} from "lucide-react";
import { useEditorStore } from "./editor/store";
import {
  clone,
  createProject,
  createTrack,
  formatTime,
  id,
  projectDuration,
} from "./core/model";
import type {
  CapcutImportSelection,
  Clip,
  ExportOptions,
  ExportProgress,
  MediaAsset,
  Project,
  RecentProject,
} from "./core/types";
import { detachLinkedAudio } from "./core/timelineEdits";
import { parseSubtitles, stringifySubtitles } from "./core/subtitles";
import { importCapcutDraft } from "./core/capcutImport";
import SubtitlePanel from "./components/SubtitlePanel";
import PackageDialog from "./components/PackageDialog";
import { resolveExportRange, selectedClipRange } from "./core/exportRange";
import AssistantPanel from "./components/AssistantPanel";
import AssetLibrary from "./components/AssetLibrary";
import type { BuiltinAsset } from "./core/builtinAssets";
import MediaLibrary from "./components/MediaLibrary";
import SourcePreview from "./components/SourcePreview";
import EditorWorkspace from "./components/EditorWorkspace";
import { captureVideoFrame } from "./core/mediaThumbnail";
import Timeline from "./components/Timeline";
import ErrorBoundary from "./components/ErrorBoundary";
import EffectsPanel from "./components/EffectsPanel";
import { TextLibrary, TransitionLibrary } from "./components/CreativeLibrary";
import { addTextPreset, applyTransition, type TextPreset, type TransitionId } from "./core/creativePresets";
import Player from "./components/Player";
import Inspector from "./components/Inspector";
import { toMediaStreamUrl } from "./wails/wailsBridge";
import { useTranslation, useLanguageStore, type Language, type TranslationKey } from "./i18n";
import "./styles.css";
type Modal = "reverse" | "freeze" | "package" | "export" | "settings" | "shortcuts" | "about" | "capcut" | null;
type PendingCapcutImport = {
  selection: CapcutImportSelection;
  capturedProject: Project;
};
const shortcuts: Array<[TranslationKey, string]> = [
  ["shortcuts.playPause", "Space"],
  ["shortcuts.split", "⌘ / Ctrl + B"],
  ["shortcuts.deleteClip", "Delete / Backspace"],
  ["shortcuts.undoRedo", "⌘ + Z / ⇧ + ⌘ + Z"],
  ["shortcuts.copyPaste", "⌘ + C / ⌘ + V"],
  ["shortcuts.duplicate", "⌘ / Ctrl + D"],
  ["shortcuts.selectAll", "⌘ / Ctrl + A"],
  ["shortcuts.prevNextFrame", "← / →"],
  ["shortcuts.newOpenSave", "⌘ + N / O / S"],
  ["shortcuts.importExport", "⌘ + I / E"],
  ["shortcuts.zoomInOut", "+ / −"],
  ["shortcuts.jumpStartEnd", "Home / End"],
];
function ModalShell({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? "modal-wide" : ""}`}
      >
        <header>
          <h2>{title}</h2>
          <button aria-label={t("dialog.close")} onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function ExportDialog({
  project,
  selectedIds,
  onClose,
  notify,
}: {
  project: Project;
  selectedIds: string[];
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [options, setOptions] = useState<ExportOptions>({
      path: "",
      width: project.width + (project.width % 2),
      height: project.height + (project.height % 2),
      fps: project.fps,
      quality: "standard",
      format: "mp4",
    }),
    [progress, setProgress] = useState<ExportProgress | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [scope, setScope] = useState("all");
  const [rangeStart, setRangeStart] = useState("0"), [rangeEnd, setRangeEnd] = useState(String(projectDuration(project)));
  const selectedRange = selectedClipRange(project, selectedIds);
  const rangeOptions = scope === "all" ? undefined : scope === "selected" ? selectedRange : { start: Number(rangeStart), end: Number(rangeEnd) };
  const exportDuration = rangeOptions ? Math.max(0, rangeOptions.end - rangeOptions.start) : projectDuration(project);
  const job = useRef<string | null>(null);
  const exporting =
    busy &&
    !["complete", "error", "cancelled"].includes(progress?.status ?? "");
  useEffect(
    () =>
      window.editorAPI?.onExportProgress((event) => {
        if (!job.current || event.jobId === job.current) {
          setProgress(event);
          if (["complete", "error", "cancelled"].includes(event.status)) {
            setBusy(false);
            if (event.status === "error") setError(event.message ?? t("export.statusError"));
          }
        }
      }),
    [],
  );
  const choose = async () => {
    try {
      const path = await window.editorAPI?.chooseExportPath(
        project.name,
        options.format,
      );
      if (path) setOptions((p) => ({ ...p, path }));
    } catch (error) {
      setError(String(error));
    }
  };
  const exportVideo = async () => {
    if (!window.editorAPI) {
      setError(t("export.needFfmpeg"));
      return;
    }
    try {
      setError("");
      if (scope === "selected" && !selectedRange) throw new Error(t("export.errorNoClipSelected"));
      if (scope === "custom" && (!rangeStart.trim() || !rangeEnd.trim())) throw new Error(t("export.errorInvalidRange"));
      resolveExportRange(project, { ...options, range: rangeOptions });
      let path = options.path;
      if (!path) {
        path =
          (await window.editorAPI.chooseExportPath(
            project.name,
            options.format,
          )) ?? "";
        if (!path) return;
        setOptions((p) => ({ ...p, path }));
      }
      job.current = null;
      setBusy(true);
      setProgress({ jobId: "", progress: 0, status: "preparing" });
      const result = await window.editorAPI.exportProject(clone(project), {
        ...options,
        range: rangeOptions,
        path,
      });
      job.current = result.jobId;
    } catch (error) {
      setBusy(false);
      setError(error instanceof Error ? error.message : String(error));
    }
  };
  const status = progress?.status;
  return (
    <ModalShell
      title={t("export.title")}
      onClose={() => {
        if (!exporting) onClose();
      }}
    >
      <div className="export-preview">
        <div>
          <Video size={28} />
          <strong>{project.name}</strong>
          <span>
            {formatTime(exportDuration, project.fps)} ·{" "}
            {project.clips.length} {t("export.clipsCount")}
          </span>
        </div>
        <span className="export-badge">{t("export.localRender")}</span>
      </div>
      <div className="modal-body">
        <label className="stacked-label">
          {t("export.location")}
          <div className="file-picker">
            <input
              aria-label={t("export.location")}
              readOnly
              value={options.path}
              placeholder={t("export.locationPlaceholder")}
            />
            <button disabled={exporting} onClick={choose}>
              <FolderOpen size={16} />
            </button>
          </div>
        </label>
        <label className="stacked-label">{t("export.range")}
          <select aria-label={t("export.range")} value={scope} disabled={exporting} onChange={e => setScope(e.target.value)}>
            <option value="all">{t("export.rangeAll")}</option><option value="selected" disabled={!selectedRange}>{t("export.rangeSelected")}</option><option value="custom">{t("export.rangeCustom")}</option>
          </select>
        </label>
        {scope === "custom" && <div className="export-fields"><label>{t("export.startSec")}<input aria-label={t("export.startSec")} type="number" min="0" step={1 / project.fps} disabled={exporting} value={rangeStart} onChange={e => setRangeStart(e.target.value)} /></label><label>{t("export.endSec")}<input aria-label={t("export.endSec")} type="number" min="0" step={1 / project.fps} disabled={exporting} value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} /></label></div>}
        {scope === "selected" && selectedRange && <p className="field-hint">{selectedRange.start.toFixed(3)}–{selectedRange.end.toFixed(3)} {t("export.hintSelected")}</p>}
        <div className="export-fields">
          <label>
            {t("export.resolution")}
            <select
              aria-label={t("export.resolution")}
              disabled={exporting}
              value={`${options.width}:${options.height}`}
              onChange={(e) => {
                const [width, height] = e.target.value.split(":").map(Number);
                setOptions((p) => ({ ...p, width, height }));
              }}
            >
              <option
                value={`${project.width + (project.width % 2)}:${project.height + (project.height % 2)}`}
              >
                {t("export.resolutionOriginal")} · {project.width}×{project.height}
              </option>
              {[720, 1080, 1440, 2160].map((height) => {
                const width =
                  Math.round((height * project.width) / project.height / 2) * 2;
                return (
                  <option key={height} value={`${width}:${height}`}>
                    {height}p · {width}×{height}
                  </option>
                );
              })}
            </select>
          </label>
          <label>
            {t("export.fps")}
            <select
              aria-label={t("export.fps")}
              value={options.fps}
              disabled={exporting}
              onChange={(e) =>
                setOptions((p) => ({ ...p, fps: Number(e.target.value) }))
              }
            >
              {[24, 25, 30, 50, 60].map((fps) => (
                <option key={fps}>{fps}</option>
              ))}
            </select>
          </label>
          <label>
            {t("export.quality")}
            <select
              aria-label={t("export.quality")}
              disabled={exporting}
              value={options.quality}
              onChange={(e) =>
                setOptions((p) => ({
                  ...p,
                  quality: e.target.value as ExportOptions["quality"],
                }))
              }
            >
              <option value="draft">{t("export.quality.draft")}</option>
              <option value="standard">{t("export.quality.standard")}</option>
              <option value="high">{t("export.quality.high")}</option>
            </select>
          </label>
          <label>
            {t("export.format")}
            <select
              aria-label={t("export.format")}
              disabled={exporting}
              value={options.format}
              onChange={(e) => {
                job.current = null;
                setOptions((p) => ({
                  ...p,
                  format: e.target.value as "mp4" | "mov",
                  path: "",
                }));
              }}
            >
              <option value="mp4">MP4 · H.264 / AAC</option>
              <option value="mov">MOV · H.264 / AAC</option>
            </select>
          </label>
          <label>
            Akselerasi GPU
            <select
              aria-label="Akselerasi GPU"
              disabled={exporting}
              value={options.encoder || "auto"}
              onChange={(e) =>
                setOptions((p) => ({
                  ...p,
                  encoder: e.target.value as "auto" | "gpu" | "cpu",
                }))
              }
            >
              <option value="auto">Auto (GPU Hardware / CPU)</option>
              <option value="gpu">Hardware GPU (MFT / NVENC / QSV)</option>
              <option value="cpu">Software CPU (libx264)</option>
            </select>
          </label>
        </div>
        <p className="field-hint">
          {t("export.privacyHint")}
        </p>
        {progress && (
          <div
            className={`export-progress ${status === "complete" ? "is-complete" : ""}`}
          >
            <div>
              <span>
                {status === "complete"
                  ? t("export.statusComplete")
                  : status === "cancelled"
                    ? t("export.statusCancelled")
                    : status === "preparing"
                      ? t("export.statusPreparing")
                      : status === "error"
                        ? t("export.statusError")
                        : t("export.statusRendering")}
              </span>
              <strong>{Math.round(progress.progress * 100)}%</strong>
            </div>
            <progress value={progress.progress} max={1} />
          </div>
        )}
        {error && (
          <div role="alert" className="inline-warning">
            {error}
          </div>
        )}
      </div>
      <footer>
        {exporting ? (
          <>
            <span className="muted">
              <LoaderCircle size={14} className="spin" />
              {t("export.backgroundHint")}
            </span>
            <button
              onClick={() => {
                if (job.current)
                  void window.editorAPI
                    ?.cancelExport(job.current)
                    .catch((error) => setError(String(error)));
              }}
            >
              {t("export.cancelExport")}
            </button>
          </>
        ) : status === "complete" ? (
          <>
            <button
              onClick={() =>
                void window.editorAPI
                  ?.revealPath(progress?.path ?? options.path)
                  .catch((error) => notify(String(error)))
              }
            >
              <FolderOpen size={15} />
              {t("export.revealInFolder")}
            </button>
            <button className="primary" onClick={onClose}>
              <Check size={15} />
              {t("export.done")}
            </button>
          </>
        ) : (
          <>
            <button onClick={onClose}>{t("dialog.cancel")}</button>
            <button
              className="primary"
              onClick={exportVideo}
              disabled={!project.clips.length}
            >
              <Download size={16} />
              {t("export.startExport")}
            </button>
          </>
        )}
      </footer>
    </ModalShell>
  );
}
async function browserAssets(files: File[]): Promise<MediaAsset[]> {
  const results: MediaAsset[] = [];
  for (const file of files) {
    let diskPath = file.name;
    const w = window as unknown as { go?: { main?: { App?: { SaveMediaCache?: (name: string, b64: string) => Promise<string> } } } };
    if (w.go?.main?.App?.SaveMediaCache) {
      try {
        const buffer = await file.arrayBuffer();
        let binary = "";
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        const chunkSize = 0x8000;
        for (let i = 0; i < len; i += chunkSize) {
          binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
        }
        const b64 = btoa(binary);
        const saved = await w.go.main.App.SaveMediaCache(file.name, b64);
        if (saved) {
          diskPath = saved;
        }
      } catch {
        /* fallback to file.name */
      }
    }

    const url = URL.createObjectURL(file);
    const kind = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("audio/")
        ? "audio"
        : "video";
    if (kind === "image") {
      const image = new Image();
      image.src = url;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error(`Failed to read image: ${file.name}`));
      });
      results.push({
        id: id(),
        name: file.name,
        path: diskPath,
        url: diskPath !== file.name ? toMediaStreamUrl(diskPath) : url,
        kind,
        duration: 0,
        width: image.width,
        height: image.height,
        fps: 0,
        hasAudio: false,
        thumbnail: url,
      });
    } else {
      const element = document.createElement(kind);
      element.preload = "metadata";
      element.src = url;
      await new Promise<void>((resolve, reject) => {
        element.onloadedmetadata = () => resolve();
        element.onerror = () => reject(new Error(`Failed to read media: ${file.name}`));
      });
      const video = element instanceof HTMLVideoElement ? element : null;
      let thumb: string | undefined;
      if (kind === "video") {
        try {
          const cap = await captureVideoFrame(url, 0.1);
          if (cap) thumb = cap;
        } catch {}
      }
      results.push({
        id: id(),
        name: file.name,
        path: diskPath,
        url: diskPath !== file.name ? toMediaStreamUrl(diskPath) : url,
        kind,
        duration: element.duration,
        width: video?.videoWidth ?? 0,
        height: video?.videoHeight ?? 0,
        fps: 30,
        thumbnail: thumb,
        hasAudio: true,
      });
      element.removeAttribute("src");
      element.load();
    }
  }
  return results;
}
export default function App() {
  const project = useEditorStore((st) => st.project);
  const selectedIds = useEditorStore((st) => st.selectedIds);
  const zoom = useEditorStore((st) => st.zoom);
  const snapping = useEditorStore((st) => st.snapping);
  const magnetic = useEditorStore((st) => st.magnetic);
  const dirty = useEditorStore((st) => st.dirty);
  const pastLength = useEditorStore((st) => st.past.length);
  const futureLength = useEditorStore((st) => st.future.length);

  const s = {
    ...useEditorStore.getState(),
    project,
    selectedIds,
    zoom,
    snapping,
    magnetic,
    dirty,
    get past() { return useEditorStore.getState().past; },
    get future() { return useEditorStore.getState().future; },
    get playhead() { return useEditorStore.getState().playhead; },
    get playing() { return useEditorStore.getState().playing; },
  };

  const [speechMode, setSpeechMode] = useState<"asr" | "tts" | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [studioPlayerWidth, setStudioPlayerWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("gocut-studio-player-width");
      if (saved) {
        const parsed = parseFloat(saved);
        if (Number.isFinite(parsed) && parsed >= 280 && parsed <= 900) return parsed;
      }
    } catch {}
    return Math.max(340, Math.min(500, Math.round(window.innerWidth * 0.32)));
  });
  const [layoutMode, setLayoutMode] = useState<"studio" | "classic">(() => {
    try {
      return (localStorage.getItem("gocut-layout-mode") as "studio" | "classic") || "classic";
    } catch {
      return "classic";
    }
  });
  const [sourceAssetId, setSourceAssetId] = useState<string | null>(null);
  const sourceAsset = s.project.assets.find(asset => asset.id === sourceAssetId);
  const [addingBuiltin, setAddingBuiltin] = useState<string | null>(null);
  const [tab, setTab] = useState("media"),
    [modal, setModal] = useState<Modal>(null),
    [fileMenu, setFileMenu] = useState(false),
    [toast, setToast] = useState(""),
    [importing, setImporting] = useState(false),
    [system, setSystem] = useState<{
      ffmpeg: boolean;
      version?: string;
      ffmpegVersion?: string;
      ffmpegPath?: string;
    }>({ ffmpeg: false }),
    [recent, setRecent] = useState<RecentProject[]>([]),
    [recover, setRecover] = useState<Project | null>(null),
    [initialized, setInitialized] = useState(false);
  useEffect(() => { setSourceAssetId(null); }, [s.project.id, modal, s.selectedIds]);
  useEffect(() => {
    return useEditorStore.subscribe((state, prev) => {
      if (state.playing && !prev.playing) setSourceAssetId(null);
    });
  }, []);
  const [timelineHeight, setTimelineHeight] = useState(() =>
    Math.max(220, Math.min(420, window.innerHeight * 0.34)),
  );
  const timelineResize = useRef<{ y: number; height: number } | null>(null);
  const resizeTimeline = (height: number) =>
    setTimelineHeight(
      Math.max(190, Math.min(window.innerHeight - 290, height)),
    );
  useEffect(() => {
    const clamp = () =>
      setTimelineHeight((height) =>
        Math.max(190, Math.min(window.innerHeight - 290, height)),
      );
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, []);
  const addBuiltin = async (definition: BuiltinAsset) => {
    if (!window.editorAPI) throw new Error(t("builtin.requiresDesktop") || "Adding built-in assets requires desktop edition");
    if (addingBuiltin) return;
    const projectId = useEditorStore.getState().project.id;
    setAddingBuiltin(definition.id);
    try {
      const imported = await window.editorAPI.importBuiltinAsset(definition.id);
      const state = useEditorStore.getState();
      if (state.project.id !== projectId) throw new Error(t("builtin.projectSwitched") || "Project has switched, please re-add asset");
      state.beginTransaction();
      try {
        state.addAssets([imported]);
        const latest = useEditorStore.getState();
        const asset = latest.project.assets.find(a => a.path === imported.path)!;
        const name = definition.category === "backgrounds" ? "Background" : definition.kind === "audio" ? "Sound Effect" : "Overlay";
        let track = latest.project.tracks.find(t => t.name === name && t.kind === definition.kind && !t.locked);
        if (!track) {
          track = createTrack(definition.kind, name);
          const tracks = [...latest.project.tracks];
          if (definition.category === "backgrounds" || definition.kind === "audio") tracks.push(track);
          else { const at = tracks.findIndex(t => t.kind !== "text"); tracks.splice(at < 0 ? tracks.length : at, 0, track); }
          latest.updateProject({ tracks });
        }
        latest.addAssetClip(asset.id, latest.playhead, track.id);
        const after = useEditorStore.getState();
        if (definition.category === "stickers" && after.selectedIds[0]) after.updateClip(after.selectedIds[0], { transform: { ...after.project.clips.find(c => c.id === after.selectedIds[0])!.transform, scale: .35 } });
      } finally { useEditorStore.getState().endTransaction(); }
    } finally { setAddingBuiltin(null); }
  };
  const saving = useRef(false);
  const [capcutImport, setCapcutImport] =
    useState<PendingCapcutImport | null>(null);
  const [capcutTimelineId, setCapcutTimelineId] = useState("");
  const [capcutBusy, setCapcutBusy] = useState(false);
  const capcutImportRef = useRef<PendingCapcutImport | null>(null);
  const capcutBusyRef = useRef(false);
  useEffect(
    () => () => {
      const token = capcutImportRef.current?.selection.token;
      if (token)
        void window.editorAPI?.discardCapcutProject(token).catch(() => {});
    },
    [],
  );
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subtitleInput = useRef<HTMLInputElement>(null);
  const [subtitleAction, setSubtitleAction] = useState<"import" | "draft">(
    "import",
  );
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 5000);
  }, []);
  const safe = useCallback(
    async (action: () => unknown) => {
      try {
        await action();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        notify(message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ""));
      }
    },
    [notify],
  );
  // Automatically generate video thumbnails for assets in background
  useEffect(() => {
    const videoAssetsWithoutThumb = s.project.assets.filter(
      (a) => a.kind === "video" && !a.thumbnail && !a.missing && a.url
    );
    if (!videoAssetsWithoutThumb.length) return;
    let cancelled = false;
    for (const asset of videoAssetsWithoutThumb) {
      void (async () => {
        try {
          const thumb = await captureVideoFrame(asset.url, 0.1);
          if (!cancelled && thumb) {
            useEditorStore.getState().updateAsset(asset.id, { thumbnail: thumb });
          }
        } catch {}
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [s.project.assets]);

  const active = s.project.clips.find((c) => c.id === s.selectedIds[0]);
  const activeTrack = s.project.tracks.find((t) => t.id === active?.trackId);
  const { t, language } = useTranslation();
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const refreshSystem = async () => {
    if (window.editorAPI) setSystem(await window.editorAPI.getSystemInfo());
  };
  useEffect(() => {
    void safe(async () => {
      await refreshSystem();
      if (window.editorAPI) {
        setRecent(await window.editorAPI.getRecentProjects());
        let startup;
        try {
          startup = await window.editorAPI.getStartupProject();
        } catch (error) {
          notify(
            `Failed to open startup project: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        if (startup) {
          s.setProject(startup.project, startup.path);
          setInitialized(true);
          return;
        }
        const autosave = await window.editorAPI.getAutosave();
        if (autosave && (autosave.clips.length || autosave.assets.length))
          setRecover(autosave);
      }
      setInitialized(true);
    }).finally(() => setInitialized(true));
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);
  useEffect(() => {
    if (window.editorAPI?.onNativeFileDrop) {
      return window.editorAPI.onNativeFileDrop((paths) => {
        void safe(() => importMedia(paths));
      });
    }
  }, []);
  useEffect(() => {
    window.editorAPI?.setDirty(s.dirty);
  }, [s.dirty]);
  useEffect(() => {
    if (!initialized || recover || !window.editorAPI) return;
    const timer = setTimeout(() => {
      void window
        .editorAPI!.autosaveProject(s.project)
        .catch((error) => notify(t("notify.autoSaveFailed", { error: String(error) })));
    }, 1000);
    return () => clearTimeout(timer);
  }, [s.project, initialized, recover]);
  const confirmReplace = () =>
    !useEditorStore.getState().dirty ||
    window.confirm(t("notify.unsavedChanges"));
  const importMedia = async (paths?: string[]) => {
    if (!window.editorAPI) {
      notify(t("notify.browserDropOnly"));
      return;
    }
    const projectId = useEditorStore.getState().project.id;
    setImporting(true);
    try {
      const assets = await window.editorAPI.importMedia(paths);
      if (useEditorStore.getState().project.id !== projectId) {
        notify(t("notify.projectSwitched"));
        return;
      }
      s.addAssets(assets);
      if (assets.length) notify(t("notify.mediaImported", { count: assets.length }));
    } finally {
      setImporting(false);
    }
  };
  const save = async (as = false) => {
    if (saving.current) {
      notify(t("notify.savingWait"));
      return false;
    }
    if (!window.editorAPI) {
      const blob = new Blob([JSON.stringify(s.project, null, 2)], {
          type: "application/json",
        }),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = s.project.name + ".reacut";
      a.click();
      URL.revokeObjectURL(url);
      notify(t("notify.jsonDownloaded"));
      return false;
    }
    saving.current = true;
    try {
      const state = useEditorStore.getState(),
        captured = state.project,
        file = await window.editorAPI.saveProject(
          captured,
          as ? undefined : state.path,
        );
      if (!file) return false;
      setRecent(await window.editorAPI.getRecentProjects());
      const latest = useEditorStore.getState();
      if (latest.project.id !== captured.id) {
        notify(t("notify.snapshotSaved"));
        return false;
      }
      const unchanged = latest.project === captured;
      if (unchanged) latest.markSaved(file);
      else useEditorStore.setState({ path: file, dirty: true });
      notify(unchanged ? t("notify.projectSaved") : t("notify.snapshotSaved"));
      return unchanged;
    } finally {
      saving.current = false;
    }
  };
  const open = async () => {
    if (!confirmReplace()) return;
    if (!window.editorAPI) {
      notify(t("notify.openDesktopRequired"));
      return;
    }
    const result = await window.editorAPI.openProject();
    if (result) s.setProject(result.project, result.path);
  };
  const newProject = () => {
    if (confirmReplace()) s.setProject(createProject());
  };
  const handleAction = async (action: string) => {
    // Native menu accelerators bypass DOM key handlers; keep modal workflows intact.
    if ((modal || speechMode || recover) && action !== "save-and-close") return;
    setFileMenu(false);
    switch (action) {
      case "new":
        newProject();
        break;
      case "open":
        await open();
        break;
      case "open-external":
        if (confirmReplace()) {
          const result = await window.editorAPI?.getStartupProject();
          if (result) s.setProject(result.project, result.path);
        }
        break;
      case "save":
        await save();
        break;
      case "save-as":
        await save(true);
        break;
      case "save-and-close":
        try {
          if (await save()) {
            window.editorAPI?.setDirty(false);
            window.editorAPI?.closeWindow();
          } else window.editorAPI?.cancelCloseRequest();
        } catch (error) {
          window.editorAPI?.cancelCloseRequest();
          throw error;
        }
        break;
      case "import":
        await importMedia();
        break;
      case "import-capcut-file":
        await importDraft("file");
        break;
      case "import-capcut-directory":
        await importDraft("directory");
        break;
      case "export":
        s.setPlaying(false);
        setModal("export");
        break;
      case "undo":
        s.undo();
        break;
      case "redo":
        s.redo();
        break;
      case "shortcuts":
        setModal("shortcuts");
        break;
      case "about":
        setModal("about");
        break;
    }
  };
  const actionRef = useRef(handleAction);
  actionRef.current = handleAction;
  useEffect(
    () =>
      window.editorAPI?.onMenuAction(
        (action) => void safe(() => actionRef.current(action)),
      ),
    [safe],
  );
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (modal === "capcut") {
        if (e.key === "Escape") {
          e.preventDefault();
          cancelCapcutImport();
        }
        return;
      }
      const target = e.target as HTMLElement;
      if (target.closest("input,textarea,select,[contenteditable=true]"))
        return;
      if (modal || speechMode || recover) {
        if (e.key === "Escape" && modal !== "export" && modal !== "package" && modal !== "reverse" && modal !== "freeze") {
          setModal(null);
        }
        return;
      }
      const state = useEditorStore.getState(),
        modifier = e.metaKey || e.ctrlKey;
      let handled = true;
      if (modifier) {
        switch (e.key.toLowerCase()) {
          case "n":
            void safe(() => actionRef.current("new"));
            break;
          case "o":
            void safe(() => actionRef.current("open"));
            break;
          case "s":
            void safe(() => actionRef.current(e.shiftKey ? "save-as" : "save"));
            break;
          case "i":
            void safe(() => actionRef.current("import"));
            break;
          case "e":
            void safe(() => actionRef.current("export"));
            break;
          case "b":
            state.split();
            break;
          case "d":
            state.duplicate();
            break;
          case "z":
            e.shiftKey ? state.redo() : state.undo();
            break;
          case "y":
            state.redo();
            break;
          case "c":
            state.copy();
            break;
          case "v":
            state.paste();
            break;
          case "a":
            state.select(state.project.clips.map((c) => c.id));
            break;
          default:
            handled = false;
        }
      } else
        switch (e.key) {
          case " ":
            if (state.playhead >= projectDuration(state.project)) state.seek(0);
            state.setPlaying(!state.playing && !!state.project.clips.length);
            break;
          case "Backspace":
          case "Delete":
            void safe(() => state.deleteSelected());
            break;
          case "ArrowLeft":
            state.seek(
              Math.max(
                0,
                state.playhead - (e.shiftKey ? 1 : 1 / state.project.fps),
              ),
            );
            break;
          case "ArrowRight":
            state.seek(
              Math.min(
                projectDuration(state.project),
                state.playhead + (e.shiftKey ? 1 : 1 / state.project.fps),
              ),
            );
            break;
          case "Home":
            state.seek(0);
            break;
          case "End":
            state.seek(projectDuration(state.project));
            break;
          case "+":
          case "=":
            state.setZoom(state.zoom * 1.25);
            break;
          case "-":
            state.setZoom(state.zoom / 1.25);
            break;
          case "v":
          case "V":
            state.setActiveTool("select");
            break;
          case "c":
          case "C":
            state.setActiveTool("razor");
            break;
          case "q":
          case "Q": {
            const targetClips = state.selectedIds.length
              ? state.project.clips.filter((c) => state.selectedIds.includes(c.id))
              : state.project.clips.filter(
                  (c) => c.start < state.playhead && c.start + c.duration > state.playhead,
                );
            for (const c of targetClips) {
              state.rippleTrim(c.id, "start", state.playhead);
            }
            break;
          }
          case "w":
          case "W": {
            const targetClips = state.selectedIds.length
              ? state.project.clips.filter((c) => state.selectedIds.includes(c.id))
              : state.project.clips.filter(
                  (c) => c.start < state.playhead && c.start + c.duration > state.playhead,
                );
            for (const c of targetClips) {
              state.rippleTrim(c.id, "end", state.playhead);
            }
            break;
          }
          case "j":
          case "J": {
            if (state.playing) {
              state.setPlaying(false);
            }
            state.seek(Math.max(0, state.playhead - 1));
            break;
          }
          case "k":
          case "K": {
            state.setPlaying(false);
            break;
          }
          case "l":
          case "L": {
            if (!state.playing) {
              state.setPlaying(true);
            } else {
              state.seek(Math.min(projectDuration(state.project), state.playhead + 1));
            }
            break;
          }
          case "Escape":
            state.select([]);
            setFileMenu(false);
            break;
          default:
            handled = false;
        }
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [modal, speechMode, recover, safe]);
  const addStyledText = (preset: TextPreset) => {
    const result = addTextPreset(s.project, preset, s.playhead);
    s.commit(result.project);
    s.select([result.clip.id]);
    setTab("text");
  };
  const readSubtitles = async () => {
    if (!window.editorAPI) {
      setSubtitleAction("import");
      subtitleInput.current?.click();
      return;
    }
    const result = await window.editorAPI.readTextFile(["srt", "vtt"]);
    if (!result) return;
    const cues = parseSubtitles(result.text);
    if (!cues.length) throw new Error("No valid SRT / VTT subtitles found");
    s.addSubtitles(cues);
    notify(t("notify.subtitlesImported", { count: cues.length }));
  };
  const exportSubtitles = async () => {
    const cues = s.project.clips
      .filter((c) => c.text)
      .sort((a, b) => a.start - b.start)
      .map((c) => ({
        start: c.start,
        end: c.start + c.duration,
        text: c.text!.text,
      }));
    if (!cues.length) throw new Error("Project contains no text or subtitles to export");
    const text = stringifySubtitles(cues);
    if (window.editorAPI)
      await window.editorAPI.writeTextFile(text, s.project.name + ".srt");
    else {
      const url = URL.createObjectURL(
          new Blob([text], { type: "text/plain;charset=utf-8" }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download = s.project.name + ".srt";
      a.click();
      URL.revokeObjectURL(url);
    }
  };
  const cancelCapcutImport = () => {
    if (capcutBusyRef.current) return;
    const token = capcutImportRef.current?.selection.token;
    capcutImportRef.current = null;
    setCapcutImport(null);
    setModal(null);
    if (token)
      void window.editorAPI?.discardCapcutProject(token).catch(() => {});
  };
  const finishCapcutImport = async (
    pending: PendingCapcutImport,
    timelineId?: string,
  ) => {
    if (!window.editorAPI) return;
    capcutBusyRef.current = true;
    setCapcutBusy(true);
    try {
      const result = await window.editorAPI.readCapcutDraft(
        pending.selection.token,
        timelineId,
      );
      const imported = importCapcutDraft(result.text, { name: result.name });
      const loaded: MediaAsset[] = [];
      for (const asset of imported.project.assets) {
        try {
          const probed = (await window.editorAPI.importMedia([asset.path]))[0];
          if (!probed) throw new Error("Unable to read media asset");
          loaded.push({ ...asset, ...probed, id: asset.id, kind: asset.kind });
        } catch {
          loaded.push({
            ...asset,
            missing: true,
            url: `reacut-media://asset?path=${encodeURIComponent(asset.path)}`,
          });
        }
      }
      const latest = useEditorStore.getState();
      if (latest.project.id !== pending.capturedProject.id) {
        notify("Project has switched. Please re-import CapCut draft in the current project.");
        return;
      }
      if (latest.project !== pending.capturedProject && !confirmReplace())
        return;
      imported.project.assets = loaded;
      s.setProject(imported.project);
      notify([...new Set([...result.warnings, ...imported.warnings])].join(" "));
    } finally {
      await window.editorAPI
        .discardCapcutProject(pending.selection.token)
        .catch(() => {});
      capcutImportRef.current = null;
      setCapcutImport(null);
      setModal((value) => (value === "capcut" ? null : value));
      capcutBusyRef.current = false;
      setCapcutBusy(false);
    }
  };
  const importDraft = async (mode: "file" | "directory" = "file") => {
    setFileMenu(false);
    if (capcutBusyRef.current || capcutImportRef.current) {
      notify("Please finish the current CapCut import first.");
      return;
    }
    if (!window.editorAPI && mode === "directory") {
      notify("Importing CapCut project folder requires desktop edition.");
      return;
    }
    if (!confirmReplace()) return;
    if (!window.editorAPI) {
      setSubtitleAction("draft");
      subtitleInput.current?.click();
      return;
    }
    const capturedProject = useEditorStore.getState().project;
    capcutBusyRef.current = true;
    setCapcutBusy(true);
    try {
      const selection = await window.editorAPI.chooseCapcutProject(mode);
      if (!selection) return;
      const pending = { selection, capturedProject };
      capcutImportRef.current = pending;
      if (selection.requiresTimelineChoice) {
        setCapcutImport(pending);
        setCapcutTimelineId(
          selection.recommendedTimelineId ?? selection.timelines[0]?.id ?? "",
        );
        setModal("capcut");
      } else {
        await finishCapcutImport(pending, selection.recommendedTimelineId);
      }
    } finally {
      capcutBusyRef.current = false;
      setCapcutBusy(false);
    }
  };
  const detachAudio = () => {
    if (!active) return;
    const result = detachLinkedAudio(s.project, active.id);
    s.commit(result.project);
    s.select([active.id]);
    notify(t("notify.audioSeparated"));
  };
  const applySceneTransition = (transition: TransitionId, seconds: number) => {
    if (!active) throw new Error("Please select a visual clip first");
    const result = applyTransition(s.project, active.id, transition, seconds);
    s.commit(result.project);
    notify(transition === "dissolve"
      ? `Added ${result.duration.toFixed(2)}s dissolve transition`
      : `Added ${result.duration.toFixed(2)}s transition`);
  };
  return (
    <div
      className={`app-shell ${layoutMode === "studio" ? "layout-studio" : "layout-classic"}`}
      style={{
        gridTemplateRows:
          layoutMode === "studio"
            ? "44px 1fr 26px"
            : `44px minmax(180px,1fr) ${timelineHeight}px 26px`,
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files);
        void safe(async () => {
          const validPaths = window.editorAPI
            ? files
                .map((file) => window.editorAPI!.getPathForFile(file))
                .filter(Boolean)
            : [];
          if (validPaths.length > 0) {
            await importMedia(validPaths);
          } else {
            s.addAssets(await browserAssets(files));
          }
        });
      }}
    >
      <header className="titlebar">
        <div className="brand" title="GoCut Video Editor">
          <img src="./icons/gocut_title.png" alt="GoCut" className="brand-logo" />
        </div>
        <div className="titlebar-menus">
          <div className="file-menu-container">
            <button
              aria-label={t("toolbar.fileMenu.aria")}
              onClick={() => setFileMenu(!fileMenu)}
            >
              {t("toolbar.file")}
              <ChevronDown size={12} />
            </button>
            {fileMenu && (
              <div className="file-menu">
                {[
                  ["new", t("toolbar.newProject"), "⌘N"],
                  ["open", t("toolbar.openProject"), "⌘O"],
                  ["save", t("toolbar.saveProject"), "⌘S"],
                  ["save-as", t("toolbar.saveAs"), "⇧⌘S"],
                  ["import", t("toolbar.importMedia"), "⌘I"],
                  ["export", t("toolbar.exportVideo"), "⌘E"],
                ].map(([action, label, shortcut]) => (
                  <button
                    key={action}
                    onClick={() => void safe(() => handleAction(action))}
                  >
                    {label}
                    <kbd>{shortcut}</kbd>
                  </button>
                ))}
                <hr />
                <button onClick={() => { setFileMenu(false); setModal("package"); }}>{t("toolbar.collectAssets")}</button>
                <button onClick={() => void safe(() => importDraft("file"))}>
                  {t("toolbar.importCapcutFile")}<span>{t("toolbar.experimental")}</span>
                </button>
                <button onClick={() => void safe(() => importDraft("directory"))}>
                  {t("toolbar.importCapcutFolder")}<span>{t("toolbar.experimental")}</span>
                </button>
              </div>
            )}
          </div>
          <button onClick={() => setModal("shortcuts")}>{t("toolbar.shortcuts")}</button>
        </div>
        <div className="project-title">
          <input
            aria-label={t("toolbar.projectName.aria")}
            value={s.project.name}
            onFocus={() => s.beginTransaction()}
            onBlur={() => s.endTransaction()}
            onChange={(e) => s.updateProject({ name: e.target.value })}
          />
          <span
            title={s.dirty ? t("toolbar.dirty") : t("toolbar.saved")}
            className={`save-dot ${s.dirty ? "dirty" : ""}`}
          />
        </div>
        <div className="titlebar-actions">
          <button
            title={layoutMode === "studio" ? "Tata Letak: Studio (Vertikal)" : "Tata Letak: Klasik"}
            aria-label="Ganti Tata Letak"
            className={layoutMode === "studio" ? "active" : ""}
            onClick={() => {
              const next = layoutMode === "studio" ? "classic" : "studio";
              setLayoutMode(next);
              try { localStorage.setItem("gocut-layout-mode", next); } catch {}
            }}
          >
            <Columns3 size={15} />
            <span>{layoutMode === "studio" ? "Studio" : "Klasik"}</span>
          </button>
          <button aria-label={t("toolbar.assistant.aria")} className={assistantOpen ? "active" : ""} onClick={() => setAssistantOpen(!assistantOpen)}><MessageSquare size={15} />{t("toolbar.assistant")}</button>
          <span className="offline-pill">
            <CloudOff size={12} />
            {t("toolbar.offline")}
          </span>
          <button
            title={t("toolbar.saveProject.title")}
            aria-label={t("toolbar.saveProject.aria")}
            onClick={() => void safe(() => save())}
          >
            <Save size={16} />
          </button>
          <button
            title={t("toolbar.settings")}
            aria-label={t("toolbar.settings.aria")}
            onClick={() => setModal("settings")}
          >
            <Settings2 size={16} />
          </button>
          <button
            className="primary export-button"
            onClick={() => {
              s.setPlaying(false);
              setModal("export");
            }}
          >
            <Upload size={15} />
            {t("toolbar.export")}
          </button>
        </div>
      </header>
      {/* Common Panels */}
      {(() => {
        const resourcePanelJSX = (
          <section className="resource-panel panel">
            <nav className="resource-tabs">
              {[
                ["media", Video, t("nav.media")],
                ["audio", Music2, t("nav.audio")],
                ["text", Type, t("nav.text")],
                ["stickers", Shapes, t("nav.stickers")],
                ["effects", WandSparkles, t("nav.effects")],
                ["transitions", Sparkles, t("nav.transitions")],
                ["subtitles", Subtitles, t("nav.subtitles")],
              ].map(([key, Icon, label]) => (
                <button
                  key={key as string}
                  className={tab === key ? "active" : ""}
                  onClick={() => setTab(key as string)}
                >
                  {typeof Icon !== "string" && <Icon size={19} />}
                  <span>{label as string}</span>
                </button>
              ))}
            </nav>
            <div className="resource-body">
              {tab === "stickers" && <AssetLibrary onAdd={addBuiltin} addingId={addingBuiltin} />}
              {(tab === "media" || tab === "audio") && (
                <MediaLibrary
                  project={
                    tab === "audio"
                      ? {
                          ...s.project,
                          assets: s.project.assets.filter(
                            (a) => a.kind === "audio",
                          ),
                        }
                      : s.project
                  }
                  onImport={(paths) => void safe(() => importMedia(paths))}
                  onPreviewAsset={(assetId) => { s.setPlaying(false); setSourceAssetId(assetId); }}
                  onAddAsset={(assetId) => { setSourceAssetId(null); s.addAssetClip(assetId); }}
                  onRemoveAsset={(assetId) =>
                    void safe(() => s.removeAsset(assetId))
                  }
                  importing={importing}
                  onImportFiles={(files) =>
                    void safe(async () => s.addAssets(await browserAssets(files)))
                  }
                  onRevealAsset={(assetId) =>
                    void safe(() => {
                      const asset = s.project.assets.find(
                        (a) => a.id === assetId,
                      );
                      if (asset?.missing) return relink(asset);
                      if (asset && window.editorAPI)
                        return window.editorAPI.revealPath(asset.path);
                    })
                  }
                />
              )}
              {tab === "text" && <TextLibrary onAdd={addStyledText} onBlank={s.addText} />}
              {tab === "subtitles" && <SubtitlePanel onSpeech={setSpeechMode} onImport={() => safe(readSubtitles)} onExport={() => safe(exportSubtitles)} />}
              {tab === "effects" && (
                <EffectsPanel
                  clip={active}
                  project={s.project}
                  kind={activeTrack?.kind}
                  locked={activeTrack?.locked}
                  onApply={(patch) => {
                    if (active) s.updateClip(active.id, patch);
                    else notify(t("notify.selectClipFirst"));
                  }}
                />
              )}
              {tab === "transitions" && <TransitionLibrary
                disabled={!active || !!active.text || activeTrack?.kind === "audio" || !!activeTrack?.locked}
                onApply={(transition,seconds)=>void safe(()=>applySceneTransition(transition,seconds))}
              />}
            </div>
          </section>
        );

        const inspectorPanelJSX = assistantOpen ? (
          <AssistantPanel onClose={() => setAssistantOpen(false)} />
        ) : (
          <Inspector
            project={s.project}
            clip={active}
            onUpdate={(patch) => active && s.updateClip(active.id, patch)}
            onProjectUpdate={s.updateProject}
          />
        );

        const playerPanelJSX = sourceAsset ? (
          <SourcePreview
            asset={sourceAsset}
            fps={s.project.fps}
            tracks={s.project.tracks.filter(t => t.kind === sourceAsset.kind || (sourceAsset.kind === "image" && t.kind === "video"))}
            onClose={() => setSourceAssetId(null)}
            onAddRange={(sourceIn, duration, mode, trackId) => void safe(() => {
              s.placeAsset(sourceAsset.id, trackId, { sourceIn, duration }, mode ?? "insert");
              setSourceAssetId(null);
            })}
          />
        ) : (
          <Player
            project={s.project}
            selectedIds={s.selectedIds}
            onSelect={s.select}
            onUpdateClip={s.updateClip}
            onSeek={s.seek}
            onPlayingChange={s.setPlaying}
          />
        );

        const timelinePaneJSX = (
          <div className="timeline-pane" style={{ height: timelineHeight }}>
            <div
              className="timeline-resize"
              role="separator"
              tabIndex={0}
              aria-label={t("timeline.resizeHeight")}
              aria-orientation="horizontal"
              aria-valuenow={Math.round(timelineHeight)}
              aria-valuemin={190}
              aria-valuemax={Math.max(190, window.innerHeight - 290)}
              title={t("timeline.resizeHeight")}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                  event.preventDefault();
                  resizeTimeline(
                    timelineHeight + (event.key === "ArrowUp" ? 20 : -20),
                  );
                }
              }}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                timelineResize.current = {
                  y: event.clientY,
                  height: timelineHeight,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const drag = timelineResize.current;
                if (drag) resizeTimeline(drag.height + drag.y - event.clientY);
              }}
              onPointerUp={(event) => {
                timelineResize.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                timelineResize.current = null;
              }}
            />
            <ErrorBoundary fallbackTitle="Terjadi kendala visual pada Timeline">
              <Timeline
                project={s.project}
                selectedIds={s.selectedIds}
                zoom={s.zoom}
                onSeek={(time) => { setSourceAssetId(null); s.seek(time); }}
                onSelect={(ids) => { setSourceAssetId(null); s.select(ids); }}
                onClipUpdate={s.updateClip}
                onMoveClips={s.moveClips}
                onTrim={s.trim}
                onSplit={s.split}
                onDelete={() => void safe(s.deleteSelected)}
                onZoom={s.setZoom}
                onTrackUpdate={s.updateTrack}
                onTrackDelete={s.deleteTrack}
                onTrackMove={s.reorderTrack}
                onAddTrack={s.addTrack}
                onDropAsset={(assetId, time, trackId) => {
                  setSourceAssetId(null); s.addAssetClip(assetId, time, trackId);
                }}
                snapping={s.snapping}
                onSnappingChange={s.setSnapping}
                magnetic={s.magnetic}
                onMagneticChange={s.setMagnetic}
                onDuplicate={s.duplicate}
                onAddText={s.addText}
                onUndo={s.undo}
                onRedo={s.redo}
                canUndo={pastLength > 0}
                canRedo={futureLength > 0}
              />
            </ErrorBoundary>
          </div>
        );

        if (layoutMode === "studio") {
          return (
            <div className="studio-main-container">
              <div className="studio-left-column">
                <div className="studio-top-workspace">
                  {resourcePanelJSX}
                  {inspectorPanelJSX}
                </div>
                {timelinePaneJSX}
              </div>

              <div
                className="studio-vertical-splitter"
                role="separator"
                tabIndex={0}
                aria-orientation="vertical"
                aria-label="Resize Player Preview"
                title="Tarik untuk mengubah ukuran preview vertikal"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  const startX = e.clientX;
                  const startWidth = studioPlayerWidth;
                  const onMove = (ev: PointerEvent) => {
                    const delta = startX - ev.clientX;
                    const newW = Math.max(280, Math.min(window.innerWidth - 450, startWidth + delta));
                    setStudioPlayerWidth(newW);
                    try { localStorage.setItem("gocut-studio-player-width", String(newW)); } catch {}
                  };
                  const onUp = () => {
                    window.removeEventListener("pointermove", onMove);
                    window.removeEventListener("pointerup", onUp);
                  };
                  window.addEventListener("pointermove", onMove);
                  window.addEventListener("pointerup", onUp);
                }}
              />

              <div className="studio-right-column" style={{ width: studioPlayerWidth }}>
                {playerPanelJSX}
              </div>
            </div>
          );
        }

        return (
          <>
            <EditorWorkspace assistantOpen={assistantOpen} layoutMode="classic">
              {resourcePanelJSX}
              {playerPanelJSX}
              {inspectorPanelJSX}
            </EditorWorkspace>
            {timelinePaneJSX}
          </>
        );
      })()}
      <footer className="app-status">
        <span>
          <span className="status-dot" />{" "}
              {t("toolbar.statusBar.summary", {
                platform: window.editorAPI ? t("toolbar.statusBar.desktop") : t("toolbar.statusBar.browser"),
                assets: s.project.assets.length,
                clips: s.project.clips.length,
              })}
        </span>
        <div>
          {active && s.project.assets.find(a => a.id === active.assetId)?.kind === "video" && <>
            <button disabled={activeTrack?.locked} onClick={() => { s.setPlaying(false); setModal("reverse"); }}>{t("toolbar.reverse")}</button>
            <button disabled={activeTrack?.locked} onClick={() => { s.setPlaying(false); setModal("freeze"); }}>{t("toolbar.freeze")}</button>
          </>}
          {active?.linkId && <button onClick={() => { s.unlinkSelected(); }} disabled={s.project.clips.some(c => c.linkId === active.linkId && s.project.tracks.find(t => t.id === c.trackId)?.locked)}>{t("toolbar.unlinkAudio")}</button>}
          {active?.assetId &&
            s.project.assets.find((a) => a.id === active.assetId)?.kind === "video" &&
            s.project.assets.find((a) => a.id === active.assetId)?.hasAudio && !active.linkId && (
              <button onClick={() => void safe(detachAudio)}>{t("toolbar.separateAudio")}</button>
            )}
          {s.project.assets.some((a) => a.missing) && (
            <button
              onClick={() =>
                void safe(() =>
                  relink(s.project.assets.find((a) => a.missing)!),
                )
              }
            >
              {t("timeline.relinkMissing")}
            </button>
          )}
          <span>{s.dirty ? t("toolbar.status.dirty") : t("toolbar.status.ready")}</span>
          <button title={t("toolbar.recentProjects")} onClick={() => setModal("settings")}>
            <FolderOpen size={12} />
          </button>
        </div>
      </footer>
      {toast && (
        <div role="status" className="toast">
          <Info size={16} />
          <span>{toast}</span>
          <button aria-label={t("dialog.closeButton")} onClick={() => setToast("")}>
            <X size={13} />
          </button>
        </div>
      )}
      {speechMode && <SpeechDialog mode={speechMode} onClose={() => setSpeechMode(null)} />}
      {(modal === "reverse" || modal === "freeze") && <DerivativeDialog mode={modal} onClose={() => setModal(null)} />}
      {modal === "package" && <PackageDialog project={clone(s.project)} onClose={() => setModal(null)} />}
      {modal === "export" && (
        <ExportDialog
          project={s.project}
          selectedIds={s.selectedIds}
          onClose={() => setModal(null)}
          notify={notify}
        />
      )}
      {modal === "capcut" && capcutImport && (
        <ModalShell title={t("capcut.modalTitle")} onClose={cancelCapcutImport}>
          <div className="modal-body">
            <p>
              <strong>{capcutImport.selection.name}</strong>{" "}
              {t("capcut.multipleTimelines") || "contains multiple timelines. Please select which to import."}
            </p>
            <label>
              {t("capcut.timelineLabel") || "Timeline"}
              <select
                aria-label={t("capcut.timelineLabel")}
                value={capcutTimelineId}
                disabled={capcutBusy}
                onChange={(event) => setCapcutTimelineId(event.target.value)}
              >
                {capcutImport.selection.timelines.map((timeline) => (
                  <option key={timeline.id} value={timeline.id}>
                    {timeline.name}
                    {timeline.isActive ? t("capcut.currentEditing") : ""}
                    {timeline.isMain ? t("capcut.mainTimeline") : ""}
                  </option>
                ))}
              </select>
            </label>
            {capcutImport.selection.warnings.map((warning) => (
              <p className="muted" key={warning}>
                {warning}
              </p>
            ))}
            <p className="muted">{t("capcut.notice")}</p>
          </div>
          <footer>
            <button disabled={capcutBusy} onClick={cancelCapcutImport}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={capcutBusy || !capcutTimelineId}
              onClick={() =>
                void safe(() =>
                  finishCapcutImport(capcutImport, capcutTimelineId),
                )
              }
            >
              {capcutBusy ? t("capcut.importing") : t("capcut.importSelected")}
            </button>
          </footer>
        </ModalShell>
      )}
      {modal === "shortcuts" && (
        <ModalShell title={t("shortcuts.title")} onClose={() => setModal(null)}>
          <div className="shortcut-list">
            {shortcuts.map(([action, keys]) => (
              <div key={action}>
                <span>{t(action)}</span>
                <kbd>{keys}</kbd>
              </div>
            ))}
          </div>
          <footer>
            <span className="muted small">
              {t("shortcuts.windowsHint")}
            </span>
            <button className="primary" onClick={() => setModal(null)}>
              {t("dialog.ok")}
            </button>
          </footer>
        </ModalShell>
      )}
      {modal === "about" && (
        <ModalShell title={t("about.title")} onClose={() => setModal(null)}>
          <div className="about-body">
            <div className="about-logo">
              <img src="./icons/gocut.png" width="64" height="64" alt={t("about.title")} style={{ borderRadius: "14px", boxShadow: "0 8px 24px rgba(99, 59, 251, 0.35)" }} />
            </div>
            <h2>GoCut</h2>
            <span>{appVersion} · {t("about.tagline")}</span>
            <p>
              {t("about.description")}
            </p>
            <p className="muted">
              GoCut is an independent open-source creative desktop editor. Completely offline, zero tracking, zero mandatory logins. (Forked & enhanced from ReaCut)
            </p>
          </div>
          <footer>
            <button className="primary" onClick={() => setModal(null)}>
              {t("dialog.closeButton")}
            </button>
          </footer>
        </ModalShell>
      )}
      {modal === "settings" && (
        <ModalShell title={t("settings.title")} onClose={() => setModal(null)}>
          <div className="modal-body">
            {/* Language Selection Card */}
            <div className="settings-section">
              <div className="settings-section-header">
                <Globe size={15} />
                <h3>{t("settings.language")}</h3>
              </div>
              <p className="muted">{t("settings.language.description")}</p>
              <select
                aria-label={t("settings.language")}
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
              >
                <option value="id">🇮🇩 {t("settings.language.id")}</option>
                <option value="en">🇬🇧 {t("settings.language.en")}</option>
                <option value="zh-CN">🇨🇳 {t("settings.language.zh-CN")}</option>
                <option value="tr">🇹🇷 {t("settings.language.tr")}</option>
              </select>
            </div>

            {/* Media Engine Card */}
            <div className="settings-section">
              <div className="settings-section-header">
                <Video size={15} />
                <h3>Mesin Media (FFmpeg & FFprobe)</h3>
              </div>
              <div className={`engine-status-card ${system.ffmpeg ? "" : "missing"}`}>
                {system.ffmpeg ? <CheckCircle2 size={18} /> : <Info size={18} />}
                <div>
                  <strong>
                    {system.ffmpeg ? t("settings.engine.ready") : t("settings.engine.missing")}
                  </strong>
                  <span>
                    {system.ffmpegVersion ?? t("settings.engine.hint")}
                  </span>
                </div>
              </div>
              {system.ffmpegPath && (
                <code className="engine-path-pill">
                  {system.ffmpegPath}
                </code>
              )}
              <div className="button-row" style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() =>
                    void safe(async () => {
                      await window.editorAPI?.chooseMediaTool("ffmpeg");
                      await refreshSystem();
                    })
                  }
                >
                  {t("settings.engine.chooseFfmpeg")}
                </button>
                <button
                  onClick={() =>
                    void safe(async () => {
                      await window.editorAPI?.chooseMediaTool("ffprobe");
                      await refreshSystem();
                    })
                  }
                >
                  {t("settings.engine.chooseFfprobe")}
                </button>
              </div>
            </div>

            {/* Recent Projects Card */}
            <div className="settings-section">
              <div className="settings-section-header">
                <FolderOpen size={15} />
                <h3>{t("settings.recentProjects")}</h3>
              </div>
              {recent.length === 0 ? (
                <p className="muted">{t("settings.recentProjects.empty")}</p>
              ) : (
                <div className="recent-list" style={{ maxHeight: "150px", overflowY: "auto" }}>
                  {recent.map((p) => (
                    <button
                      key={p.path}
                      className="recent-project-item"
                      onClick={() =>
                        void safe(async () => {
                          if (!confirmReplace()) return;
                          const result =
                            await window.editorAPI?.openRecentProject(p.path);
                          if (result) {
                            s.setProject(result.project, result.path);
                            setModal(null);
                          }
                        })
                      }
                    >
                      <FolderOpen size={16} />
                      <div>
                        <strong>{p.name}</strong>
                        <span>{p.path}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Privacy Card */}
            <div className="privacy-badge-box">
              <CloudOff size={16} />
              <div>
                <strong>Privasi Penuh & Operasi 100% Offline</strong>
                <p>GoCut memproses semua video, audio, dan efek langsung di perangkat Anda tanpa telemetri atau pengunggahan cloud.</p>
              </div>
            </div>
          </div>
          <footer>
            <button onClick={() => setModal("about")}>{t("settings.about")}</button>
            <button className="primary" onClick={() => setModal(null)}>
              {t("settings.done")}
            </button>
          </footer>
        </ModalShell>
      )}
      {recover && (
        <ModalShell
          title={t("recover.title")}
          onClose={() => {
            setRecover(null);
          }}
        >
          <div className="modal-body">
            <p>
              {t("recover.found")}{" "}
              <strong>{recover.name}</strong>,{" "}
              {recover.clips.length} {t("recover.clipsCount")}
            </p>
            <p className="muted">{t("recover.hint")}</p>
          </div>
          <footer>
            <button onClick={() => setRecover(null)}>{t("recover.newEmpty")}</button>
            <button
              className="primary"
              onClick={() => {
                s.setProject(recover);
                setRecover(null);
                notify(t("recover.restoredNotify"));
              }}
            >
              {t("recover.restore")}
            </button>
          </footer>
        </ModalShell>
      )}
      <input
        ref={subtitleInput}
        type="file"
        style={{ display: "none" }}
        accept={subtitleAction === "draft" ? ".json" : ".srt,.vtt"}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file)
            void safe(async () => {
              const text = await file.text();
              if (subtitleAction === "draft") {
                const imported = importCapcutDraft(text);
                s.setProject(imported.project);
                notify(imported.warnings.join(" "));
              } else {
                const cues = parseSubtitles(text);
                if (!cues.length) throw new Error("Subtitle file contains no valid subtitles");
                s.addSubtitles(cues);
              }
            });
          e.target.value = "";
        }}
      />
    </div>
  );
  async function relink(asset: MediaAsset) {
    if (!window.editorAPI) return;
    const projectId = useEditorStore.getState().project.id;
    const result = await window.editorAPI.relinkAsset(asset);
    if (!result) return;
    // A separated audio layer still references the same video source. Relink every
    // reference together, preserving its role and identity within the project.
    let source = result;
    if (
      result.kind === "audio" &&
      useEditorStore
        .getState()
        .project.assets.some((a) => a.path === asset.path && a.kind === "video")
    )
      source = (await window.editorAPI.importMedia([result.path]))[0] ?? result;
    const current = useEditorStore.getState();
    if (current.project.id !== projectId) return;
    if (current.project.assets.some((a) => a.id === asset.id))
      current.commit({
        ...current.project,
        assets: current.project.assets.map((a) =>
          a.path === asset.path
            ? {
                ...source,
                id: a.id,
                name: a.name,
                kind: a.kind,
                ...(a.kind === "audio"
                  ? { width: 0, height: 0, thumbnail: undefined }
                  : {}),
              }
            : a,
        ),
      });
  }
}
