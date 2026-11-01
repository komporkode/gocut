import type {
  CapcutImportSelection,
  EditorAPI,
  ExportOptions,
  ExportProgress,
  MediaAsset,
  MediaKind,
  Project,
  ProjectInfo,
  RecentProject,
} from "../core/types";
import { flattenCompoundClips } from "../core/timelineEdits";
import { createProject as createCoreProject } from "../core/model";
import * as App from "../../wailsjs/go/main/App";
import * as Runtime from "../../wailsjs/runtime/runtime";

let mockProjects: ProjectInfo[] = [];

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
  if (!project || typeof project !== "object") return project;
  if (!project.version) project.version = 1;
  const now = new Date().toISOString();
  if (!project.createdAt) project.createdAt = now;
  if (!project.updatedAt) project.updatedAt = now;
  if (!project.background) project.background = "#101015";
  if (!Array.isArray(project.assets)) project.assets = [];
  if (!Array.isArray(project.tracks)) {
    project.tracks = [
      { id: "t-text-1", kind: "text", name: "Text", muted: false, hidden: false, locked: false },
      { id: "t-video-1", kind: "video", name: "Video 1", muted: false, hidden: false, locked: false },
      { id: "t-audio-1", kind: "audio", name: "Audio 1", muted: false, hidden: false, locked: false },
    ];
  } else {
    for (const track of project.tracks) {
      if (track.muted === undefined) track.muted = false;
      if (track.hidden === undefined) track.hidden = false;
      if (track.locked === undefined) track.locked = false;
    }
  }
  if (!Array.isArray(project.clips)) project.clips = [];

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
        folder: a.folder || undefined,
      }));
    },

    chooseMediaFolder: async (): Promise<string | null> => {
      if (isWailsEnvironment()) {
        try {
          const folder = await App.ChooseMediaFolder();
          return folder || null;
        } catch {
          return null;
        }
      }
      return "/mock/Folder";
    },

    importMediaFolder: async (path?: string): Promise<MediaAsset[]> => {
      let folderPath = path;
      if (!folderPath && isWailsEnvironment()) {
        folderPath = (await App.ChooseMediaFolder()) || undefined;
      }
      if (!folderPath) {
        if (!isWailsEnvironment()) {
          folderPath = "/mock/SampleFolder";
        } else {
          return [];
        }
      }

      if (isWailsEnvironment()) {
        try {
          const res = await App.ScanMediaFolder(folderPath);
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
            folder: a.folder || undefined,
          }));
        } catch {
          return [];
        }
      }

      const baseName = folderPath.split("/").pop() || "Folder";
      return [
        {
          id: `mock-folder-1-${Date.now()}`,
          name: "clip_1.mp4",
          path: `${folderPath}/clip_1.mp4`,
          url: "data:video/mp4;base64,mock",
          kind: "video",
          duration: 5,
          width: 1920,
          height: 1080,
          fps: 30,
          hasAudio: true,
          folder: baseName,
        },
        {
          id: `mock-folder-2-${Date.now()}`,
          name: "clip_2.mp4",
          path: `${folderPath}/clip_2.mp4`,
          url: "data:video/mp4;base64,mock",
          kind: "video",
          duration: 4,
          width: 1920,
          height: 1080,
          fps: 30,
          hasAudio: true,
          folder: baseName,
        },
      ];
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

    listProjects: async (): Promise<ProjectInfo[]> => {
      if (isWailsEnvironment()) {
        try {
          const items = await (App as unknown as { ListProjects?: () => Promise<ProjectInfo[]> }).ListProjects?.();
          if (items) return items;
        } catch {
          /* fallback */
        }
      }
      return [...mockProjects];
    },

    createProject: async (name: string) => {
      const p = createCoreProject(name);
      const safePath = `/projects/${name.replace(/[^\w-]/g, "_")}-${Date.now()}.gct`;
      const info: ProjectInfo = {
        id: p.id,
        name: p.name,
        path: safePath,
        sizeBytes: 1024,
        duration: 0,
        updatedAt: new Date().toISOString(),
      };
      mockProjects = [info, ...mockProjects.filter(x => x.path !== safePath)];
      if (isWailsEnvironment()) {
        try {
          await (App as unknown as { CreateProject?: (n: string) => Promise<unknown> }).CreateProject?.(name);
        } catch {
          /* ignore */
        }
      }
      return { project: p, path: safePath };
    },

    duplicateProject: async (path: string): Promise<ProjectInfo> => {
      const orig = mockProjects.find(p => p.path === path);
      const newName = orig ? `${orig.name} Copy` : "Duplicated Project Copy";
      const newPath = `/projects/${newName.replace(/[^\w-]/g, "_")}-${Date.now()}.gct`;
      const duplicated: ProjectInfo = {
        id: `dup-${Date.now()}`,
        name: newName,
        path: newPath,
        cover: orig?.cover,
        sizeBytes: orig?.sizeBytes ?? 1024,
        duration: orig?.duration ?? 0,
        updatedAt: new Date().toISOString(),
      };
      mockProjects = [duplicated, ...mockProjects];
      if (isWailsEnvironment()) {
        try {
          const res = await (App as unknown as { DuplicateProject?: (p: string) => Promise<ProjectInfo> }).DuplicateProject?.(path);
          if (res) return res;
        } catch {
          /* fallback */
        }
      }
      return duplicated;
    },

    renameProject: async (path: string, newName: string): Promise<ProjectInfo> => {
      const found = mockProjects.find(p => p.path === path);
      if (found) {
        found.name = newName;
        found.updatedAt = new Date().toISOString();
      }
      if (isWailsEnvironment()) {
        try {
          const res = await (App as unknown as { RenameProject?: (p: string, n: string) => Promise<ProjectInfo> }).RenameProject?.(path, newName);
          if (res) return res;
        } catch {
          /* fallback */
        }
      }
      return found || {
        id: "renamed",
        name: newName,
        path,
        sizeBytes: 1024,
        duration: 0,
        updatedAt: new Date().toISOString(),
      };
    },

    deleteProject: async (path: string): Promise<boolean> => {
      mockProjects = mockProjects.filter(p => p.path !== path);
      if (isWailsEnvironment()) {
        try {
          await (App as unknown as { DeleteProject?: (p: string) => Promise<void> }).DeleteProject?.(path);
          return true;
        } catch {
          return false;
        }
      }
      return true;
    },

    saveProjectCover: async (projectPath: string, coverBase64: string): Promise<void> => {
      const target = mockProjects.find(p => p.path === projectPath);
      if (target) {
        target.cover = coverBase64;
      }
      if (isWailsEnvironment()) {
        try {
          await (App as unknown as { SaveProjectCover?: (p: string, c: string) => Promise<void> }).SaveProjectCover?.(projectPath, coverBase64);
        } catch {
          /* fallback */
        }
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
      return "";
    },

    resolveFilePaths: async (files: File[]): Promise<string[]> => {
      const direct = files.map((f) => {
        const p = (f as unknown as { path?: string }).path;
        return p && (p.includes("/") || p.includes("\\") || /^[a-zA-Z]:/.test(p)) ? p : "";
      });
      if (direct.length > 0 && direct.every(Boolean)) {
        return direct;
      }
      try {
        if (Runtime.CanResolveFilePaths()) {
          const res = await (Runtime.ResolveFilePaths as unknown as (files: File[]) => Promise<string[]>)(files);
          if (Array.isArray(res) && res.length > 0 && res.every(Boolean)) {
            return res;
          }
        }
      } catch {
        // CanResolveFilePaths not supported or failed
      }
      return direct.filter(Boolean);
    },

    inspectCapcutPath: async (
      path: string,
    ): Promise<CapcutImportSelection | null> => {
      try {
        const fn = (App as any).InspectCapcutPath || (window as any).go?.main?.App?.InspectCapcutPath;
        if (!fn) return null;
        const res = await fn(path);
        if (!res || !res.token) return null;
        return {
          token: res.token,
          name: res.name,
          requiresTimelineChoice: res.requiresTimelineChoice,
          recommendedTimelineId: res.recommendedTimelineId,
          timelines: (res.timelines || []).map((t: any) => ({
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

    getStorageInfo: async () => {
      try {
        return await App.GetStorageInfo();
      } catch {
        return {
          dataDir: "",
          activeDrive: "C:",
          isPortable: false,
          projectsDir: "",
          cacheDir: "",
          modelsDir: "",
        };
      }
    },

    relocateStorage: async (drive: string) => {
      return await App.RelocateStorage(drive);
    },

    listWhisperModels: async () => {
      try {
        return (await App.ListWhisperModels()) || [];
      } catch {
        return [];
      }
    },

    importWhisperModel: async () => {
      return await App.ImportWhisperModel();
    },
  };
}

export const editorAPI: EditorAPI = createWailsBridge();
if (typeof window !== "undefined" && !window.editorAPI) {
  window.editorAPI = editorAPI;
}
