import type {
  CapcutImportSelection,
  EditorAPI,
  ExportOptions,
  ExportProgress,
  MediaAsset,
  MediaKind,
  Project,
  RecentProject,
} from "../core/types";
import { flattenCompoundClips } from "../core/timelineEdits";
import * as App from "../../wailsjs/go/main/App";
import * as Runtime from "../../wailsjs/runtime/runtime";

export function isWailsEnvironment(): boolean {
  return (
    typeof window !== "undefined" &&
    (Boolean((window as unknown as { go?: { main?: { App?: unknown } } }).go?.main?.App) ||
      Boolean((window as unknown as { runtime?: unknown }).runtime))
  );
}

export function toMediaStreamUrl(filePathOrUrl: string): string {
  if (!filePathOrUrl) return "";
  if (filePathOrUrl.startsWith("/media-stream")) return filePathOrUrl;
  if (filePathOrUrl.startsWith("blob:") || filePathOrUrl.startsWith("data:")) return filePathOrUrl;

  let targetPath = filePathOrUrl;
  if (targetPath.startsWith("reacut-media://")) {
    try {
      const u = new URL(targetPath);
      targetPath = u.searchParams.get("path") || targetPath;
    } catch {
      const idx = targetPath.indexOf("path=");
      if (idx !== -1) {
        targetPath = decodeURIComponent(targetPath.slice(idx + 5));
      }
    }
  } else if (targetPath.startsWith("file:///")) {
    targetPath = decodeURIComponent(targetPath.replace(/^file:\/\/\/?/, ""));
  }

  return `/media-stream?path=${encodeURIComponent(targetPath)}`;
}

export function normalizeProjectAssets(project: Project): Project {
  if (!project || !Array.isArray(project.assets)) return project;
  for (const asset of project.assets) {
    if (asset.path) {
      asset.url = toMediaStreamUrl(asset.path);
    } else if (asset.url) {
      asset.url = toMediaStreamUrl(asset.url);
    }
  }
  return project;
}

export function createWailsBridge(): EditorAPI {
  return {
    getSpeechInfo: async () => ({
      ready: false,
      voices: [],
      error: "Speech synthesis not configured in desktop mode",
    }),
    chooseSpeechDependency: async () => ({
      ready: false,
      voices: [],
      error: "Speech dependency choice not available",
    }),
    generateSpeech: async () => {
      throw new Error("Speech generation is not enabled.");
    },
    cancelSpeech: async () => {},
    onSpeechProgress: () => () => {},
    deriveMedia: async () => {
      throw new Error("Media derivation is not implemented in desktop mode.");
    },
    cancelDerivative: async () => {},
    onDerivativeProgress: () => () => {},
    packageProject: async () => null,
    cancelPackage: async () => {},
    onPackageProgress: () => () => {},
    importBuiltinAsset: async (id: string) => {
      throw new Error(`Builtin asset ${id} not found.`);
    },
    getAssistantProviders: async () => [],
    chooseAssistantCLI: async () => [],
    startAssistant: async () => {},
    cancelAssistant: async () => {},
    onAssistantEvent: () => () => {},
    getAssistantHistory: async () => [],
    saveAssistantHistory: async () => {},

    importMedia: async (paths?: string[]): Promise<MediaAsset[]> => {
      let filesToImport = paths;
      if (!filesToImport || filesToImport.length === 0) {
        filesToImport = await App.ChooseMediaFiles();
      }
      if (!filesToImport || filesToImport.length === 0) return [];
      const res = await App.ImportMedia(filesToImport);
      return (res || []).map((a) => ({
        id: a.id,
        name: a.name,
        path: a.path,
        url: toMediaStreamUrl(a.path),
        kind: a.kind as MediaKind,
        duration: a.duration,
        width: a.width,
        height: a.height,
        fps: a.fps,
        hasAudio: a.hasAudio,
        missing: a.missing || false,
      }));
    },

    relinkAsset: async (asset: MediaAsset): Promise<MediaAsset | null> => {
      try {
        const res = await App.RelinkAsset(JSON.stringify(asset));
        if (!res) return null;
        return {
          id: res.id,
          name: res.name,
          path: res.path,
          url: toMediaStreamUrl(res.path),
          kind: res.kind as MediaKind,
          duration: res.duration,
          width: res.width,
          height: res.height,
          fps: res.fps,
          hasAudio: res.hasAudio,
          missing: res.missing || false,
        };
      } catch {
        return null;
      }
    },

    onMenuAction: (callback: (action: string) => void) => {
      return Runtime.EventsOn("menu-action", (action: string) => callback(action));
    },

    setDirty: (dirty: boolean) => {
      void App.SetDirty(dirty);
    },

    cancelCloseRequest: () => {},

    closeWindow: () => {
      void App.CloseWindow();
    },

    chooseMediaTool: async (name: "ffmpeg" | "ffprobe") => {
      try {
        const res = await App.ChooseMediaTool(name);
        return res || null;
      } catch {
        return null;
      }
    },

    getFontFamilies: async () => {
      return await App.GetFontFamilies();
    },

    getStartupProject: async () => {
      try {
        const res = await App.GetStartupProject();
        if (!res || !res.json || !res.path) return null;
        return {
          project: normalizeProjectAssets(JSON.parse(res.json) as Project),
          path: res.path,
        };
      } catch {
        return null;
      }
    },

    openProject: async () => {
      try {
        const res = await App.OpenProject("");
        if (!res || !res.json || !res.path) return null;
        return {
          project: normalizeProjectAssets(JSON.parse(res.json) as Project),
          path: res.path,
        };
      } catch {
        return null;
      }
    },

    saveProject: async (project: Project, path?: string) => {
      try {
        const res = await App.SaveProject(JSON.stringify(project), path ?? "");
        return res || null;
      } catch {
        return null;
      }
    },

    autosaveProject: async (project: Project) => {
      await App.AutosaveProject(JSON.stringify(project));
    },

    getAutosave: async () => {
      try {
        const raw = await App.GetAutosave();
        if (!raw) return null;
        return normalizeProjectAssets(JSON.parse(raw) as Project);
      } catch {
        return null;
      }
    },

    getRecentProjects: async (): Promise<RecentProject[]> => {
      try {
        const items = await App.GetRecentProjects();
        return (items || []).map((r) => ({
          name: r.name,
          path: r.path,
          updatedAt: r.updatedAt,
        }));
      } catch {
        return [];
      }
    },

    openRecentProject: async (path: string) => {
      const res = await App.OpenProject(path);
      if (!res || !res.json) throw new Error("Failed to open project: " + path);
      return {
        project: normalizeProjectAssets(JSON.parse(res.json) as Project),
        path: res.path,
      };
    },

    chooseExportPath: async (name: string, format: "mp4" | "mov") => {
      try {
        const res = await App.ChooseExportPath(name, format);
        return res || null;
      } catch {
        return null;
      }
    },

    exportProject: async (project: Project, options: ExportOptions) => {
      const flattened = flattenCompoundClips(project);
      const jobId = await App.StartExport(
        JSON.stringify(flattened),
        JSON.stringify(options)
      );
      return { jobId };
    },

    cancelExport: async (jobId: string) => {
      await App.CancelExport(jobId);
    },

    onExportProgress: (callback: (event: ExportProgress) => void) => {
      return Runtime.EventsOn("export-progress", (event: ExportProgress) => {
        callback(event);
      });
    },

    getSystemInfo: async () => {
      const info = await App.GetSystemInfo();
      return {
        version: info.version,
        platform: "win32",
        ffmpeg: info.ffmpeg,
        ffmpegVersion: info.ffmpegVersion,
        ffmpegPath: info.ffmpegPath,
        ffprobePath: info.ffprobePath,
      };
    },

    readTextFile: async (extensions: string[]) => {
      try {
        const res = await App.ReadTextFile(extensions);
        if (!res || !res.path) return null;
        return {
          text: res.text,
          name: res.path,
        };
      } catch {
        return null;
      }
    },

    chooseCapcutProject: async (
      mode: "file" | "directory"
    ): Promise<CapcutImportSelection | null> => {
      try {
        const res = await App.ChooseCapcutProject(mode);
        if (!res || !res.token) return null;
        return {
          token: res.token,
          name: res.name,
          requiresTimelineChoice: res.requiresTimelineChoice,
          recommendedTimelineId: res.recommendedTimelineId,
          timelines: (res.timelines || []).map((t) => ({
            id: t.id,
            name: t.name,
            isMain: t.isMain,
            isActive: t.isActive,
          })),
          warnings: res.warnings || [],
        };
      } catch {
        return null;
      }
    },

    readCapcutDraft: async (token: string, timelineId?: string) => {
      const res = await App.ReadCapcutDraft(token, timelineId || "");
      return {
        name: res.name,
        text: res.text,
        warnings: res.warnings || [],
      };
    },

    discardCapcutProject: async (token: string) => {
      await App.DiscardCapcutProject(token);
    },

    writeTextFile: async (text: string, name: string) => {
      try {
        const res = await App.WriteTextFile(text, name);
        return res || null;
      } catch {
        return null;
      }
    },

    revealPath: async (path: string) => {
      await App.RevealPath(path);
    },

    getPathForFile: (file: File) => {
      const p = (file as unknown as { path?: string }).path;
      if (p && (p.includes("/") || p.includes("\\") || /^[a-zA-Z]:/.test(p))) {
        return p;
      }
      if (file.name) {
        return file.name;
      }
      return "";
    },

    onNativeFileDrop: (callback: (paths: string[]) => void) => {
      const w = window as unknown as { runtime?: { OnFileDrop?: (cb: (x: number, y: number, paths: string[]) => void, target: boolean) => void } };
      if (w.runtime?.OnFileDrop) {
        try {
          w.runtime.OnFileDrop((_x: number, _y: number, paths: string[]) => {
            if (paths && paths.length) callback(paths);
          }, false);
        } catch {
          /* ignore */
        }
      }
      return Runtime.EventsOn("wails:file-drop", (_x: number, _y: number, paths: string[]) => {
        if (paths && paths.length) callback(paths);
      });
    },
  };
}
