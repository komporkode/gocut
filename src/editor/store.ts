import { create } from "zustand";
import type {
  Clip,
  MediaAsset,
  Project,
  Track,
  TrackKind,
} from "../core/types";
import {
  createProject,
  createTrack,
  createClip,
  clone,
  id,
  snapToFrame,
  validateProject,
} from "../core/model";
import { linkedIds, moveLinked, speedLinked, slipLinked, placeAsset, trimLinked, splitLinked, unlinkClips, rippleTrim, closeGap, setClipSpeed, createCompoundClip, ungroupCompoundClip, rippleSnapTrack, rippleSnapAllTracks, reorderClip, swapClips, separateAudio, recoverAudio, type PlacementMode } from "../core/timelineEdits";
import { applyTransition, removeTransition, type TransitionId } from "../core/creativePresets";
import type { Subtitle } from "../core/subtitles";
interface EditorState {
  project: Project;
  path?: string;
  selectedIds: string[];
  playhead: number;
  playing: boolean;
  zoom: number;
  snapping: boolean;
  magnetic: boolean;
  activeTool: "select" | "razor";
  nestedTimelineScope: string | null;
  setActiveTool: (tool: "select" | "razor") => void;
  dirty: boolean;
  revisionId: number;
  past: Project[];
  future: Project[];
  clipboard: Clip[];
  setProject: (project: Project, path?: string) => void;
  commit: (project: Project) => void;
  beginTransaction: () => void;
  endTransaction: () => void;
  transactionOpen: boolean;
  transactionRecorded: boolean;
  updateProject: (patch: Partial<Project>) => void;
  addAssets: (assets: MediaAsset[]) => void;
  updateAsset: (assetId: string, patch: Partial<MediaAsset>) => void;
  removeAsset: (assetId: string) => void;
  addAssetClip: (assetId: string, start?: number, trackId?: string, range?: { sourceIn: number; duration: number }) => void;
  placeAsset: (assetId: string, trackId: string | undefined, range: { sourceIn: number; duration: number }, mode: PlacementMode) => void;
  unlinkSelected: () => void;
  addText: () => void;
  addSubtitles: (cues: Subtitle[]) => void;
  updateClip: (clipId: string, patch: Partial<Clip>) => void;
  updateSelected: (patch: Partial<Clip>) => void;
  moveClips: (ids: string[], delta: number, trackId?: string) => void;
  reorderClip: (
    clipId: string,
    targetTrackId: string,
    targetTime: number,
    mode?: "insert" | "swap" | "overwrite",
  ) => void;
  swapClipWithAdjacent: (clipId: string, direction: "prev" | "next") => void;
  trim: (clipId: string, edge: "start" | "end", time: number) => void;
  split: () => void;
  splitAt: (clipId: string, time: number) => void;
  rippleTrim: (clipId: string, edge: "start" | "end", time?: number) => void;
  closeGap: (trackId: string, atTime: number) => void;
  setClipSpeed: (clipId: string, speed: number, ripple?: boolean) => void;
  applyTransition: (clipId: string, transition: TransitionId, seconds?: number) => void;
  removeTransition: (clipId: string) => void;
  createCompoundClip: (clipIds?: string[]) => void;
  ungroupCompoundClip: (compoundClipId?: string) => void;
  enterCompoundClip: (clipId: string) => void;
  exitCompoundClip: () => void;
  separateAudio: (clipId: string) => void;
  recoverAudio: (clipId: string) => void;
  deleteSelected: () => void;
  duplicate: () => void;
  copy: () => void;
  paste: () => void;
  addTrack: (kind: TrackKind) => void;
  deleteTrack: (trackId: string) => void;
  reorderTrack: (trackId: string, direction: "up" | "down") => void;
  updateTrack: (trackId: string, patch: Partial<Track>) => void;
  select: (ids: string[]) => void;
  seek: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  setZoom: (zoom: number) => void;
  setSnapping: (value: boolean) => void;
  setMagnetic: (value: boolean) => void;
  undo: () => void;
  redo: () => void;
  markSaved: (path: string) => void;
}
const acceptsAsset = (track: Track, asset: MediaAsset) =>
  track.kind === asset.kind ||
  (track.kind === "video" && asset.kind === "image");
const acceptsClip = (p: Project, track: Track, clip: Clip) =>
  clip.text
    ? track.kind === "text"
    : !!p.assets.find((a) => a.id === clip.assetId && acceptsAsset(track, a));
const editable = (p: Project, clip: Clip) =>
  !!p.tracks.find((t) => t.id === clip.trackId && !t.locked);
function copyLink(group: string | undefined, copies: Map<string, string>) {
  if (!group) return undefined;
  if (!copies.has(group)) copies.set(group, id());
  return copies.get(group);
}
const freshCopy = (clip: Clip): Clip => ({
  ...clone(clip),
  id: id(),
  linkId: undefined,
  keyframes: clip.keyframes.map((k) => ({ ...clone(k), id: id() })),
});
function patchClip(
  project: Project,
  clipId: string,
  patch: Partial<Clip>,
): Project {
  let p = project;
  let original = p.clips.find((c) => c.id === clipId);
  if (!original) {
    const compound = p.clips.find(
      (c) => c.isCompound && c.nestedClips?.some((nc) => nc.id === clipId),
    );
    if (compound && compound.nestedClips) {
      const updatedNested = compound.nestedClips.map((nc) =>
        nc.id === clipId ? { ...nc, ...clone(patch) } : nc,
      );
      return {
        ...p,
        clips: p.clips.map((c) =>
          c.id === compound.id ? { ...c, nestedClips: updatedNested } : c,
        ),
      };
    }
    return p;
  }
  if (!editable(p, original)) return p;
  const rest = { ...clone(patch) };
  delete rest.id;
  if (rest.trackId !== undefined) {
    const target = p.tracks.find((t) => t.id === rest.trackId && !t.locked);
    if (!target || !acceptsClip(p, target, { ...original, ...rest })) return p;
  }
  if (
    Object.prototype.hasOwnProperty.call(rest, "fadeIn") ||
    Object.prototype.hasOwnProperty.call(rest, "fadeOut")
  )
    rest.videoFadeWindow = undefined;
  if (
    Object.prototype.hasOwnProperty.call(rest, "audioFadeIn") ||
    Object.prototype.hasOwnProperty.call(rest, "audioFadeOut")
  )
    rest.audioFadeWindow = undefined;
  if (rest.speed !== undefined) {
    p = speedLinked(p, clipId, rest.speed);
    delete rest.speed;
  }
  if (rest.start !== undefined) { p = moveLinked(p, [clipId], rest.start - original.start); delete rest.start; }
  if (rest.sourceIn !== undefined) { p = slipLinked(p, clipId, rest.sourceIn); delete rest.sourceIn; }
  if (!Object.keys(rest).length) return p;
  return {
    ...p,
    clips: p.clips.map((c) => (c.id === clipId ? { ...c, ...rest } : c)),
  };
}

export function isProjectEqual(a: Project, b: Project): boolean {
  if (a === b) return true;
  if (
    a.id !== b.id ||
    a.name !== b.name ||
    a.width !== b.width ||
    a.height !== b.height ||
    a.fps !== b.fps ||
    a.background !== b.background ||
    a.tracks.length !== b.tracks.length ||
    a.clips.length !== b.clips.length ||
    a.assets.length !== b.assets.length
  ) {
    return false;
  }
  for (let i = 0; i < a.tracks.length; i++) {
    const tA = a.tracks[i], tB = b.tracks[i];
    if (tA === tB) continue;
    if (
      tA.id !== tB.id ||
      tA.name !== tB.name ||
      tA.kind !== tB.kind ||
      tA.muted !== tB.muted ||
      tA.hidden !== tB.hidden ||
      tA.locked !== tB.locked
    ) return false;
  }
  for (let i = 0; i < a.assets.length; i++) {
    const asA = a.assets[i], asB = b.assets[i];
    if (asA === asB) continue;
    if (
      asA.id !== asB.id ||
      asA.path !== asB.path ||
      asA.name !== asB.name ||
      asA.kind !== asB.kind ||
      asA.duration !== asB.duration ||
      asA.missing !== asB.missing
    ) return false;
  }
  for (let i = 0; i < a.clips.length; i++) {
    const cA = a.clips[i], cB = b.clips[i];
    if (cA === cB) continue;
    if (
      cA.id !== cB.id ||
      cA.linkId !== cB.linkId ||
      cA.trackId !== cB.trackId ||
      cA.assetId !== cB.assetId ||
      cA.name !== cB.name ||
      cA.start !== cB.start ||
      cA.duration !== cB.duration ||
      cA.sourceIn !== cB.sourceIn ||
      cA.speed !== cB.speed ||
      cA.volume !== cB.volume ||
      cA.muted !== cB.muted ||
      cA.fadeIn !== cB.fadeIn ||
      cA.fadeOut !== cB.fadeOut ||
      cA.audioFadeIn !== cB.audioFadeIn ||
      cA.audioFadeOut !== cB.audioFadeOut
    ) return false;
    if (cA.transform !== cB.transform) {
      const tA = cA.transform, tB = cB.transform;
      if (
        tA.x !== tB.x ||
        tA.y !== tB.y ||
        tA.scale !== tB.scale ||
        tA.rotation !== tB.rotation ||
        tA.opacity !== tB.opacity ||
        tA.flipX !== tB.flipX ||
        tA.flipY !== tB.flipY
      ) return false;
    }
    if (cA.adjustments !== cB.adjustments) {
      const adA = cA.adjustments, adB = cB.adjustments;
      if (
        adA.brightness !== adB.brightness ||
        adA.contrast !== adB.contrast ||
        adA.saturation !== adB.saturation ||
        adA.temperature !== adB.temperature ||
        adA.blur !== adB.blur
      ) return false;
    }
    if (cA.keyframes !== cB.keyframes) {
      if (cA.keyframes.length !== cB.keyframes.length) return false;
      for (let k = 0; k < cA.keyframes.length; k++) {
        const kA = cA.keyframes[k], kB = cB.keyframes[k];
        if (
          kA.id !== kB.id ||
          kA.time !== kB.time ||
          kA.value !== kB.value ||
          kA.property !== kB.property ||
          kA.easing !== kB.easing
        ) return false;
      }
    }
    if (cA.text !== cB.text) {
      if (!cA.text || !cB.text) return false;
      if (
        cA.text.text !== cB.text.text ||
        cA.text.fontSize !== cB.text.fontSize ||
        cA.text.color !== cB.text.color ||
        cA.text.fontFamily !== cB.text.fontFamily ||
        cA.text.align !== cB.text.align
      ) return false;
    }
    if (cA.videoFadeWindow !== cB.videoFadeWindow) {
      if (!cA.videoFadeWindow || !cB.videoFadeWindow) return false;
      if (
        cA.videoFadeWindow.offset !== cB.videoFadeWindow.offset ||
        cA.videoFadeWindow.duration !== cB.videoFadeWindow.duration ||
        cA.videoFadeWindow.fadeIn !== cB.videoFadeWindow.fadeIn ||
        cA.videoFadeWindow.fadeOut !== cB.videoFadeWindow.fadeOut
      ) return false;
    }
    if (cA.audioFadeWindow !== cB.audioFadeWindow) {
      if (!cA.audioFadeWindow || !cB.audioFadeWindow) return false;
      if (
        cA.audioFadeWindow.offset !== cB.audioFadeWindow.offset ||
        cA.audioFadeWindow.duration !== cB.audioFadeWindow.duration ||
        cA.audioFadeWindow.fadeIn !== cB.audioFadeWindow.fadeIn ||
        cA.audioFadeWindow.fadeOut !== cB.audioFadeWindow.fadeOut
      ) return false;
    }
    if (cA.crop !== cB.crop) {
      if (!cA.crop || !cB.crop) return false;
      if (
        cA.crop.x !== cB.crop.x ||
        cA.crop.y !== cB.crop.y ||
        cA.crop.width !== cB.crop.width ||
        cA.crop.height !== cB.crop.height
      ) return false;
    }
    if (cA.chromaKey !== cB.chromaKey) {
      if (!cA.chromaKey || !cB.chromaKey) return false;
      if (
        cA.chromaKey.enabled !== cB.chromaKey.enabled ||
        cA.chromaKey.color !== cB.chromaKey.color ||
        cA.chromaKey.similarity !== cB.chromaKey.similarity ||
        cA.chromaKey.blend !== cB.chromaKey.blend
      ) return false;
    }
    if (cA.mask !== cB.mask) {
      if (!cA.mask || !cB.mask) return false;
      if (
        cA.mask.shape !== cB.mask.shape ||
        cA.mask.width !== cB.mask.width ||
        cA.mask.height !== cB.mask.height ||
        cA.mask.feather !== cB.mask.feather ||
        cA.mask.invert !== cB.mask.invert
      ) return false;
    }
  }
  return true;
}

export function pruneEmptyOverlayTracks(project: Project): Project {
  const primaryVideoTrack =
    project.tracks.find((t) => t.name === "Video 1") ??
    [...project.tracks].reverse().find((t) => t.kind === "video");

  if (!primaryVideoTrack) return project;

  // An overlay video track is any video track other than the primary video track.
  // It is empty if no clip in project has clip.trackId === track.id.
  const emptyOverlayTracks = project.tracks.filter(
    (t) =>
      t.kind === "video" &&
      t.id !== primaryVideoTrack.id &&
      !project.clips.some((c) => c.trackId === t.id),
  );

  if (emptyOverlayTracks.length === 0) return project;

  const emptyTrackIds = new Set(emptyOverlayTracks.map((t) => t.id));
  const remainingTracks = project.tracks.filter((t) => !emptyTrackIds.has(t.id));

  // Re-index video track names cleanly
  const videoTracks = remainingTracks.filter((t) => t.kind === "video");
  const n = videoTracks.length;

  const updatedTracks = remainingTracks.map((t) => {
    if (t.kind !== "video") return t;
    const i = videoTracks.findIndex((vt) => vt.id === t.id);
    if (i < 0) return t;
    const standardNamePattern = /^(?:画面|视频|Video|Trek Video)\s*\d+$/i;
    if (t.id === primaryVideoTrack.id) {
      if (standardNamePattern.test(t.name) || t.name === "Video 1") {
        return { ...t, name: "Video 1" };
      }
      return t;
    }
    const expectedName = `Video ${n - i}`;
    if (standardNamePattern.test(t.name)) {
      return { ...t, name: expectedName };
    }
    return t;
  });

  return {
    ...project,
    tracks: updatedTracks,
  };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  project: createProject(),
  selectedIds: [],
  playhead: 0,
  playing: false,
  zoom: 60,
  snapping: true,
  magnetic: false,
  activeTool: "select",
  nestedTimelineScope: null,
  setActiveTool: (tool) => set({ activeTool: tool }),
  dirty: false,
  revisionId: 0,
  past: [],
  future: [],
  clipboard: [],
  transactionOpen: false,
  transactionRecorded: false,
  beginTransaction: () => {
    if (!get().transactionOpen)
      set({ transactionOpen: true, transactionRecorded: false });
  },
  endTransaction: () =>
    set({ transactionOpen: false, transactionRecorded: false }),
  setProject: (project, path) =>
    set({
      project: validateProject(project),
      path,
      selectedIds: [],
      nestedTimelineScope: null,
      playhead: 0,
      playing: false,
      dirty: false,
      revisionId: get().revisionId + 1,
      past: [],
      future: [],
      clipboard: [],
      transactionOpen: false,
      transactionRecorded: false,
    }),
  commit: (project) => {
    const s = get();
    if (isProjectEqual(project, s.project)) return;
    set({
      project: { ...clone(project), updatedAt: new Date().toISOString() },
      dirty: true,
      revisionId: s.revisionId + 1,
      past:
        s.transactionOpen && s.transactionRecorded
          ? s.past
          : [...s.past, clone(s.project)].slice(-50),
      future: [],
      transactionRecorded: s.transactionOpen,
    });
  },
  updateProject: (patch) => get().commit({ ...get().project, ...clone(patch) }),
  addAssets: (assets) => {
    const p = get().project,
      paths = new Set(p.assets.map((a) => a.path)),
      ids = new Set(p.assets.map((a) => a.id));
    const fresh = assets.filter((a) => {
      if (paths.has(a.path) || ids.has(a.id)) return false;
      paths.add(a.path);
      ids.add(a.id);
      return true;
    });
    if (fresh.length) get().commit({ ...p, assets: [...p.assets, ...fresh] });
  },
  updateAsset: (assetId, patch) => {
    const p = get().project;
    const assets = p.assets.map((a) => (a.id === assetId ? { ...a, ...patch } : a));
    set({ project: { ...p, assets } });
  },
  removeAsset: (assetId) => {
    const p = get().project;
    if (p.clips.some((c) => c.assetId === assetId))
      throw new Error("Asset is still in use by timeline clips. Please delete them first. (素材仍被时间线使用，请先删除对应片段)");
    get().commit({ ...p, assets: p.assets.filter((a) => a.id !== assetId) });
  },
  addAssetClip: (assetId, start, trackId, range) => {
    let p = get().project;
    const asset = p.assets.find((a) => a.id === assetId);
    if (!asset || (start !== undefined && !Number.isFinite(start))) return;
    if (range && (asset.missing || !Number.isFinite(range.sourceIn) || !Number.isFinite(range.duration) ||
        range.sourceIn < 0 || range.duration < 1 / p.fps - 1e-9 || range.duration > 86400 ||
        (asset.kind === "image" ? range.sourceIn !== 0 : range.sourceIn + range.duration > asset.duration + 1e-9)))
      throw new Error("Source range is invalid or exceeds asset duration. (素材选段无效或超出源素材范围)");
    let track: Track | undefined;
    if (trackId !== undefined) {
      track = p.tracks.find(
        (t) => t.id === trackId && !t.locked && acceptsAsset(t, asset),
      );
      if (!track) return;
    } else track = p.tracks.find((t) => !t.locked && acceptsAsset(t, asset));
    if (!track) {
      track = createTrack(asset.kind);
      p = { ...p, tracks: [...p.tracks, track] };
    }
    const trackClips = p.clips
      .filter((c) => c.trackId === track!.id)
      .sort((a, b) => a.start - b.start);
    const end = trackClips.reduce((maxEnd, c) => Math.max(maxEnd, c.start + c.duration), 0);

    let clipStart: number;
    if (get().magnetic) {
      if (trackClips.length === 0) {
        clipStart = 0;
      } else if (start === undefined || start >= end - 0.05) {
        clipStart = end;
      } else if (start <= 0.05) {
        clipStart = 0;
      } else {
        const seamClip = trackClips.find(c => start >= c.start && start <= c.start + c.duration);
        if (seamClip) {
          const distToStart = Math.abs(start - seamClip.start);
          const distToEnd = Math.abs(start - (seamClip.start + seamClip.duration));
          clipStart = distToStart < distToEnd ? seamClip.start : seamClip.start + seamClip.duration;
        } else {
          clipStart = start;
        }
      }
    } else {
      clipStart = start ?? end;
    }

    const clip = createClip(asset, track.id, clipStart, p.fps);
    if (range) { clip.sourceIn = range.sourceIn; clip.duration = range.duration; }

    let nextClips = [...p.clips, clip];
    if (get().magnetic && trackClips.length > 0 && clipStart < end) {
      nextClips = nextClips.map(c => {
        if (c.id !== clip.id && c.trackId === track!.id && c.start >= clipStart - 1e-4) {
          return { ...c, start: c.start + clip.duration };
        }
        return c;
      });
    }

    let nextProject = { ...p, clips: nextClips };
    if (get().magnetic) {
      nextProject = rippleSnapTrack(nextProject, track.id);
    }
    get().commit(nextProject);
    set({ selectedIds: [clip.id], playhead: clip.start });
  },
  placeAsset: (assetId, trackId, range, mode) => {
    const result = placeAsset(get().project, assetId, trackId, get().playhead, range, mode);
    get().commit(result.project);
    set({ selectedIds: [result.clipId] });
  },
  unlinkSelected: () => {
    const s = get(), next = unlinkClips(s.project, s.selectedIds);
    if (next === s.project) return;
    s.commit(next);
    set({ selectedIds: s.selectedIds.slice(0, 1) });
  },
  addText: () => {
    let p = get().project;
    let track = p.tracks.find((t) => t.kind === "text" && !t.locked);
    if (!track) {
      track = createTrack("text");
      p = { ...p, tracks: [track, ...p.tracks] };
    }
    const clip = createClip(undefined, track.id, get().playhead, p.fps);
    get().commit({ ...p, clips: [...p.clips, clip] });
    set({ selectedIds: [clip.id] });
  },
  addSubtitles: (cues) => {
    const p = get().project,
      track = createTrack("text", "Subtitles");
    const clips = cues
      .filter(
        (c) =>
          Number.isFinite(c.start) &&
          Number.isFinite(c.end) &&
          c.start >= 0 &&
          c.end > c.start,
      )
      .map((c) => {
        const clip = createClip(undefined, track.id, c.start, p.fps);
        return {
          ...clip,
          name: c.text,
          duration: Math.max(1 / p.fps, snapToFrame(c.end, p.fps) - clip.start),
          transform: { ...clip.transform, y: p.height * 0.36 },
          text: { ...clip.text!, text: c.text, fontSize: p.height * 0.05 },
        };
      });
    if (!clips.length) return;
    get().commit({
      ...p,
      tracks: [track, ...p.tracks],
      clips: [...p.clips, ...clips],
    });
    set({ selectedIds: clips.slice(0, 1).map((c) => c.id) });
  },
  updateClip: (clipId, patch) =>
    get().commit(patchClip(get().project, clipId, patch)),
  updateSelected: (patch) => {
    let p = get().project;
    for (const clipId of get().selectedIds) p = patchClip(p, clipId, patch);
    get().commit(p);
  },
  moveClips: (ids, delta, trackId) => {
    let next = moveLinked(get().project, ids, delta, trackId);
    if (get().magnetic) {
      const mainTrack = next.tracks.find(t => t.name === "Video 1") ?? next.tracks.find(t => t.kind === "video");
      if (mainTrack) {
        next = rippleSnapTrack(next, mainTrack.id);
      }
    }
    next = pruneEmptyOverlayTracks(next);
    get().commit(next);
  },
  reorderClip: (clipId, targetTrackId, targetTime, mode = "insert") => {
    let next = reorderClip(
      get().project,
      clipId,
      targetTrackId,
      targetTime,
      mode,
    );
    if (get().magnetic) {
      const mainTrack = next.tracks.find(t => t.name === "Video 1") ?? next.tracks.find(t => t.kind === "video");
      if (mainTrack) {
        next = rippleSnapTrack(next, mainTrack.id);
      }
    }
    next = pruneEmptyOverlayTracks(next);
    get().commit(next);
  },
  swapClipWithAdjacent: (clipId, direction) => {
    let next = swapClips(get().project, clipId, direction);
    if (get().magnetic) {
      const mainTrack = next.tracks.find(t => t.name === "Video 1") ?? next.tracks.find(t => t.kind === "video");
      if (mainTrack) {
        next = rippleSnapTrack(next, mainTrack.id);
      }
    }
    next = pruneEmptyOverlayTracks(next);
    get().commit(next);
  },
  trim: (clipId, edge, time) => {
    if (get().magnetic) {
      get().rippleTrim(clipId, edge, time);
    } else {
      get().commit(trimLinked(get().project, clipId, edge, time));
    }
  },
  split: () => {
    let p = get().project;
    const ids = get().selectedIds.length
      ? get().selectedIds
      : p.clips
          .filter(
            (c) =>
              c.start < get().playhead && c.start + c.duration > get().playhead,
          )
          .map((c) => c.id);
    p = splitLinked(p, ids, get().playhead);
    get().commit(p);
  },
  splitAt: (clipId, time) => {
    let p = get().project;
    p = splitLinked(p, [clipId], time);
    get().commit(p);
  },
  rippleTrim: (clipId, edge, time) => {
    const p = get().project;
    const t = time ?? get().playhead;
    const next = rippleTrim(p, clipId, edge, t);
    get().commit(next);
  },
  closeGap: (trackId, atTime) => {
    const next = closeGap(get().project, trackId, atTime);
    get().commit(next);
  },
  setClipSpeed: (clipId, speed, ripple) => {
    const isRipple = ripple !== undefined ? ripple : get().magnetic;
    const next = setClipSpeed(get().project, clipId, speed, isRipple);
    get().commit(next);
  },
  applyTransition: (clipId, transition, seconds = 0.5) => {
    const next = applyTransition(get().project, clipId, transition, seconds, true);
    get().commit(next.project);
  },
  removeTransition: (clipId) => {
    const next = removeTransition(get().project, clipId);
    get().commit(next);
  },
  createCompoundClip: (clipIds) => {
    const ids = clipIds && clipIds.length ? clipIds : get().selectedIds;
    if (!ids.length) return;
    const next = createCompoundClip(get().project, ids);
    get().commit(next);
    const compound = next.clips.find(
      (c) => c.isCompound && !get().project.clips.some((old) => old.id === c.id),
    );
    if (compound) {
      set({ selectedIds: [compound.id] });
    }
  },
  ungroupCompoundClip: (compoundClipId) => {
    const targetId = compoundClipId ?? get().selectedIds[0];
    if (!targetId) return;
    const next = ungroupCompoundClip(get().project, targetId);
    get().commit(next);
    set({ selectedIds: [] });
  },
  enterCompoundClip: (clipId) => {
    set({ nestedTimelineScope: clipId, selectedIds: [] });
  },
  exitCompoundClip: () => {
    set({ nestedTimelineScope: null, selectedIds: [] });
  },
  separateAudio: (clipId) => {
    try {
      const result = separateAudio(get().project, clipId);
      get().commit(result.project);
      set({ selectedIds: [clipId] });
    } catch (e) {
      console.error("separateAudio error:", e);
    }
  },
  recoverAudio: (clipId) => {
    try {
      const next = recoverAudio(get().project, clipId);
      get().commit(next);
      set({ selectedIds: [clipId] });
    } catch (e) {
      console.error("recoverAudio error:", e);
    }
  },
  deleteSelected: () => {
    const s = get(),
      p = s.project,
      selected = new Set(linkedIds(p, s.selectedIds)),
      removed = p.clips.filter(
        (c) => selected.has(c.id),
      );
    if (!removed.length || removed.some(c => !editable(p, c))) return;
    let clips = p.clips.filter((c) => !removed.includes(c));
    if (s.magnetic) {
      const ranges = new Map<string, [number, number][]>();
      for (const deleted of [...removed].sort((a, b) => a.start - b.start)) {
        const list = ranges.get(deleted.trackId) ?? [],
          last = list.at(-1),
          end = deleted.start + deleted.duration;
        if (last && deleted.start <= last[1]) last[1] = Math.max(last[1], end);
        else list.push([deleted.start, end]);
        ranges.set(deleted.trackId, list);
      }
      clips = clips.map((c) => ({
        ...c,
        start: Math.max(
          0,
          c.start -
            (ranges.get(c.trackId) ?? []).reduce(
              (sum, [start, end]) => sum + (c.start >= end ? end - start : 0),
              0,
            ),
        ),
      }));
    }
    if (s.magnetic) {
      const offsets = new Map<string, number>();
      for (const c of clips) {
        if (!c.linkId) continue;
        const delta = c.start - p.clips.find(original => original.id === c.id)!.start;
        const previous = offsets.get(c.linkId);
        if (previous !== undefined && Math.abs(previous - delta) > 1e-8)
          throw new Error("Ripple delete would desynchronize linked audio. Disable ripple delete or unlink clips first. (磁性删除会使后续画声错位)");
        offsets.set(c.linkId, delta);
      }
    }
    const nextProject = pruneEmptyOverlayTracks({ ...p, clips });
    get().commit(nextProject);
    set({
      selectedIds: s.selectedIds.filter(
        (selected) => !removed.some((c) => c.id === selected),
      ),
    });
  },
  duplicate: () => {
    const s = get(),
      selected = new Set(linkedIds(s.project, s.selectedIds)),
      originals = s.project.clips.filter((c) => selected.has(c.id));
    if (originals.some(c => !editable(s.project, c))) return;
    const copyGroups = new Map<string, string>();
    const copies = originals.map((c) => ({
      ...freshCopy(c),
      linkId: copyLink(c.linkId, copyGroups),
      start: c.start + c.duration,
    }));
    if (copies.length) {
      get().commit({ ...s.project, clips: [...s.project.clips, ...copies] });
      set({ selectedIds: copies.map((c) => c.id) });
    }
  },
  copy: () =>
    set({
      clipboard: clone(
        get().project.clips.filter((c) => get().selectedIds.includes(c.id)),
      ),
    }),
  paste: () => {
    const s = get();
    if (!s.clipboard.length) return;
    const copyGroups = new Map<string, string>();
    const min = Math.min(...s.clipboard.map((c) => c.start)),
      clips = s.clipboard
        .filter((c) =>
          s.project.tracks.some(
            (t) =>
              t.id === c.trackId && !t.locked && acceptsClip(s.project, t, c),
          ),
        )
        .map((c) => ({
          ...freshCopy(c),
          linkId: copyLink(c.linkId, copyGroups),
          start: Math.max(
            0,
            snapToFrame(s.playhead + c.start - min, s.project.fps),
          ),
        }));
    if (!clips.length) return;
    // Never paste just one half of an associated group when its other track is locked or missing.
    for (const group of new Set(s.clipboard.map(c => c.linkId).filter(Boolean))) {
      const originalCount = s.clipboard.filter(c => c.linkId === group).length;
      const pastedGroup = copyGroups.get(group!);
      const pastedCount = pastedGroup ? clips.filter(c => c.linkId === pastedGroup).length : 0;
      if (pastedCount !== originalCount) return;
    }
    get().commit({ ...s.project, clips: [...s.project.clips, ...clips] });
    set({ selectedIds: clips.map((c) => c.id) });
  },
  addTrack: (kind) => {
    const p = get().project,
      count = p.tracks.filter((t) => t.kind === kind).length + 1,
      name = `${{ video: "Video", image: "Video", audio: "Audio", text: "Text" }[kind]} ${count}`,
      track = createTrack(kind, name);
    let tracks: Track[];
    if (kind === "audio") {
      tracks = [...p.tracks, track];
    } else if (kind === "video") {
      const firstVideoIdx = p.tracks.findIndex((t) => t.kind === "video");
      tracks = [...p.tracks];
      tracks.splice(firstVideoIdx >= 0 ? firstVideoIdx : 0, 0, track);
    } else {
      tracks = [track, ...p.tracks];
    }
    get().commit({ ...p, tracks });
  },
  deleteTrack: (trackId) => {
    const s = get(),
      p = s.project,
      track = p.tracks.find((t) => t.id === trackId);
    if (!track || track.locked) return;
    const removed = new Set(
      p.clips.filter((c) => c.trackId === trackId).map((c) => c.id),
    );
    get().commit({
      ...p,
      tracks: p.tracks.filter((t) => t.id !== trackId),
      clips: p.clips.filter((c) => c.trackId !== trackId),
    });
    set({ selectedIds: s.selectedIds.filter((id) => !removed.has(id)) });
  },
  reorderTrack: (trackId, direction) => {
    const p = get().project,
      index = p.tracks.findIndex((t) => t.id === trackId),
      target = index + (direction === "up" ? -1 : 1);
    if (
      index < 0 ||
      target < 0 ||
      target >= p.tracks.length ||
      p.tracks[index].locked ||
      p.tracks[target].locked
    )
      return;
    const tracks = [...p.tracks];
    [tracks[index], tracks[target]] = [tracks[target], tracks[index]];
    get().commit({ ...p, tracks });
  },
  updateTrack: (trackId, patch) => {
    const p = get().project,
      track = p.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const rest = { ...clone(patch) };
    delete rest.id;
    delete rest.kind;
    if (rest.name !== undefined) {
      if (track.locked || !rest.name.trim()) delete rest.name;
      else rest.name = rest.name.trim();
    }
    get().commit({
      ...p,
      tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, ...rest } : t)),
    });
  },
  select: (selectedIds) => set({ selectedIds: linkedIds(get().project, selectedIds) }),
  seek: (time) => {
    if (Number.isFinite(time))
      set({ playhead: Math.max(0, time), playing: false });
  },
  setPlaying: (playing) => set({ playing }),
  setZoom: (zoom) => {
    if (Number.isFinite(zoom)) set({ zoom: Math.min(400, Math.max(5, zoom)) });
  },
  setSnapping: (snapping) => set({ snapping }),
  setMagnetic: (magnetic) => set({ magnetic }),
  undo: () => {
    const s = get();
    if (s.past.length)
      set({
        project: clone(s.past[s.past.length - 1]),
        past: s.past.slice(0, -1),
        future: [clone(s.project), ...s.future],
        dirty: true,
        selectedIds: [],
        playing: false,
        transactionOpen: false,
        transactionRecorded: false,
      });
  },
  redo: () => {
    const s = get();
    if (s.future.length)
      set({
        project: clone(s.future[0]),
        past: [...s.past, clone(s.project)].slice(-150),
        future: s.future.slice(1),
        dirty: true,
        selectedIds: [],
        playing: false,
        transactionOpen: false,
        transactionRecorded: false,
      });
  },
  markSaved: (path) => set({ path, dirty: false }),
}));
