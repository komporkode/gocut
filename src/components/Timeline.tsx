import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  AudioLines,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  Film,
  Layers,
  LockKeyhole,
  Link2,
  Magnet,
  MoreHorizontal,
  MousePointer2,
  Music2,
  Pencil,
  Plus,
  Redo2,
  Scissors,
  Trash2,
  Type,
  Undo2,
  UnlockKeyhole,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { Clip, Project, Track, TrackKind } from "../core/types";
import { linkedIds, trimLinked, rippleSnapAllTracks } from "../core/timelineEdits";
import { snapToFrame, createTrack, createClip } from "../core/model";
import { motionPatch, type MotionId, type TextPreset } from "../core/creativePresets";
import "./Timeline.css";
import TimelineContextMenu, { type ContextMenuItem } from "./TimelineContextMenu";
import { useTranslation, type TranslationKey } from "../i18n";
import { useEditorStore, pruneEmptyOverlayTracks } from "../editor/store";

export interface TimelineProps {
  project: Project;
  selectedIds: string[];
  playhead?: number;
  playing?: boolean;
  zoom: number;
  onSeek: (time: number) => void;
  onSelect: (ids: string[]) => void;
  onClipUpdate: (id: string, patch: Partial<Clip>) => void;
  onMoveClips: (ids: string[], delta: number, trackId?: string) => void;
  onTrim: (id: string, edge: "start" | "end", time: number) => void;
  onSplit: () => void;
  onDelete: () => void;
  onZoom: (zoom: number) => void;
  onTrackUpdate: (id: string, patch: Partial<Track>) => void;
  onAddTrack: (kind: TrackKind) => void;
  onTrackDelete?: (id: string) => void;
  onTrackMove?: (id: string, direction: "up" | "down") => void;
  onDropAsset?: (assetId: string, time: number, trackId: string) => void;
  snapping?: boolean;
  onSnappingChange?: (value: boolean) => void;
  magnetic?: boolean;
  onMagneticChange?: (value: boolean) => void;
  onDuplicate?: () => void;
  onAddText?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

const GUTTER = 170;
const ROW = 70;
const RULER = 30;
export const ASSET_DRAG_TYPE = "application/x-reacut-asset";
export function formatTimelineTime(seconds: number, fps = 30) {
  const frames = Math.max(0, Math.round(seconds * fps));
  const secs = Math.floor(frames / fps);
  return `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}:${String(frames % fps).padStart(2, "0")}`;
}
export function snapTimelineTime(
  time: number,
  candidates: number[],
  threshold: number,
) {
  let nearest = time;
  let distance = threshold;
  for (const candidate of candidates) {
    const diff = Math.abs(candidate - time);
    if (diff < distance) {
      nearest = candidate;
      distance = diff;
    }
  }
  return nearest;
}

export function calculateZoomScroll(
  playhead: number,
  oldPps: number,
  newPps: number,
  scrollLeft: number,
  viewportWidth: number,
): number {
  const playheadPxOld = playhead * oldPps;
  const visualOffset = playheadPxOld - scrollLeft;
  if (visualOffset >= 0 && visualOffset <= viewportWidth) {
    return Math.max(0, playhead * newPps - visualOffset);
  }
  return Math.max(0, playhead * newPps - viewportWidth / 2);
}

export function formatTrackName(name: string, kind: string, t: (key: TranslationKey) => string): string {
  if (
    name === "文字" ||
    name === "字幕" ||
    name === "Text" ||
    name === "Teks" ||
    name === "Metin" ||
    name === "Subtitle" ||
    name === "Trek Subtitle"
  ) {
    return t("timeline.textTrack");
  }
  const videoMatch = name.match(/^(?:画面|视频|Video|Trek Video)\s*(\d+)$/i);
  if (videoMatch) {
    return `${t("timeline.videoTrack")} ${videoMatch[1]}`;
  }
  if (name === "画面" || name === "视频" || name === "Video") {
    return t("timeline.videoTrack");
  }
  const audioMatch = name.match(/^(?:音频|Audio|Trek Audio)\s*(\d+)$/i);
  if (audioMatch) {
    return `${t("timeline.audioTrack")} ${audioMatch[1]}`;
  }
  if (name === "音频" || name === "Audio" || name === "分离音频" || name === "Extracted Audio") {
    return t("timeline.audioTrack");
  }
  return name;
}
export function formatRulerTime(seconds: number, fractional = false) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${fractional ? remainder.toFixed(1).padStart(4, "0") : String(Math.round(remainder)).padStart(2, "0")}`;
}
export function rulerInterval(pixelsPerSecond: number) {
  return (
    [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find(
      (n) => n * pixelsPerSecond >= 76,
    ) ?? 1200
  );
}
/** Flat track layout in CapCut style: all clips on a track render on a single row (lane 0) with fixed track height. */
export function layoutTrackClips(clips: Clip[]) {
  const lanes = new Map<string, number>();
  for (const clip of clips) {
    lanes.set(clip.id, 0);
  }
  return {
    lanes,
    count: 1,
    height: ROW,
  };
}
export function calculateInsertionSlot(
  time: number,
  trackClips: Clip[],
  primaryClipId: string,
): { insertTime: number; insertIndex: number } {
  const others = trackClips
    .filter((c) => c.id !== primaryClipId)
    .sort((a, b) => a.start - b.start);
  if (!others.length) return { insertTime: 0, insertIndex: 0 };

  const firstMid = others[0].start + others[0].duration / 2;
  if (time < firstMid) {
    return { insertTime: 0, insertIndex: 0 };
  }

  for (let i = 0; i < others.length - 1; i++) {
    const cur = others[i];
    const next = others[i + 1];
    const mid1 = cur.start + cur.duration / 2;
    const mid2 = next.start + next.duration / 2;
    if (time >= mid1 && time < mid2) {
      return {
        insertTime: cur.start + cur.duration,
        insertIndex: i + 1,
      };
    }
  }

  const last = others[others.length - 1];
  return {
    insertTime: last.start + last.duration,
    insertIndex: others.length,
  };
}

export function canMoveToTrack(clip: Clip, track: Track | undefined, project: Project) {
  if (!track || track.locked) return false;
  if (clip.text) return track.kind === "text";
  const kind =
    project.assets.find((a) => a.id === clip.assetId)?.kind ??
    project.tracks.find((t) => t.id === clip.trackId)?.kind;
  return kind === "audio"
    ? track.kind === "audio"
    : kind === "video"
      ? track.kind === "video"
      : kind === "image" && ["video", "image"].includes(track.kind);
}
export function waveformSamples(
  clip: Clip,
  waveform: number[],
  count: number,
  sourceDuration: number,
) {
  if (!waveform.length || sourceDuration <= 0)
    return Array.from({ length: count }, () => 0);
  return Array.from({ length: count }, (_, i) => {
    const at =
      clip.sourceIn + (i / Math.max(1, count - 1)) * clip.duration * clip.speed;
    const index = Math.max(
      0,
      Math.min(
        waveform.length - 1,
        Math.floor((at / sourceDuration) * waveform.length),
      ),
    );
    return waveform[index];
  });
}
function TrackIcon({ kind }: { kind: TrackKind }) {
  return kind === "audio" ? (
    <Music2 size={15} />
  ) : kind === "text" ? (
    <Type size={15} />
  ) : (
    <Film size={15} />
  );
}
type Gesture =
  | {
      kind: "move";
      ids: string[];
      delta: number;
      primaryId: string;
      trackId: string;
      targetTrackId: string;
      pointerX?: number;
      pointerY?: number;
      insertSlot?: { insertTime: number; insertIndex: number };
    }
  | { kind: "trim"; id: string; edge: "start" | "end"; time: number }
  | { kind: "marquee"; x: number; y: number; width: number; height: number };

export default function Timeline(props: TimelineProps) {
  const { t } = useTranslation();
  const storePlayhead = useEditorStore((s) => s.playhead);
  const storePlaying = useEditorStore((s) => s.playing);
  const storeActiveTool = useEditorStore((s) => s.activeTool);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const splitAt = useEditorStore((s) => s.splitAt);
  const storeCloseGap = useEditorStore((s) => s.closeGap);
  const nestedTimelineScope = useEditorStore((s) => s.nestedTimelineScope);
  const exitCompoundClip = useEditorStore((s) => s.exitCompoundClip);
  const enterCompoundClip = useEditorStore((s) => s.enterCompoundClip);
  const separateAudio = useEditorStore((s) => s.separateAudio);
  const recoverAudio = useEditorStore((s) => s.recoverAudio);
  const ungroupCompoundClip = useEditorStore((s) => s.ungroupCompoundClip);
  const activeTool = storeActiveTool ?? "select";
  const [selectedGap, setSelectedGap] = useState<{ trackId: string; start: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: ContextMenuItem[];
  } | null>(null);
  const playhead = props.playhead ?? storePlayhead;
  const playing = props.playing ?? storePlaying;
  const { project, selectedIds, zoom, onSeek, onSelect } = props;
  const activeCompoundClip = nestedTimelineScope
    ? project.clips.find((c) => c.id === nestedTimelineScope)
    : null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLElement>(null);
  const frozenLayoutsRef = useRef<Array<
    ReturnType<typeof layoutTrackClips> & { id: string; top: number }
  > | null>(null);
  const renameDraftRef = useRef("");
  const renameCancelledRef = useRef(false);
  const pointerCleanupRef = useRef<(() => void) | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [snapLine, setSnapLine] = useState<number | null>(null);
  const [selectedTransition, setSelectedTransition] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    trackId: string;
    time: number;
  } | null>(null);
  const [trackActions, setTrackActions] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleteTrackId, setDeleteTrackId] = useState<string | null>(null);
  const [trackMenu, setTrackMenu] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(800);
  const [viewportHeight, setViewportHeight] = useState(300);
  const [draggedKind, setDraggedKind] = useState<TrackKind | null>(null);
  const [localSnap, setLocalSnap] = useState(true);
  const [localMagnetic, setLocalMagnetic] = useState(false);
  const snapping = props.snapping ?? localSnap;
  const magnetic = props.magnetic ?? localMagnetic;
  const pps = Math.max(5, Math.min(400, zoom));
  const duration = Math.max(
    30,
    (viewportWidth - GUTTER) / pps,
    ...project.clips.map((c) => c.start + c.duration + 10),
    playhead + 8,
  );
  const bodyWidth = duration * pps;
  const interval = rulerInterval(pps);
  const ticks = Array.from(
    { length: Math.ceil(duration / interval) + 1 },
    (_, i) => i * interval,
  );

  useEffect(() => {
    if (!selectedTransition) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        e.stopPropagation();
        useEditorStore.getState().removeTransition(selectedTransition);
        setSelectedTransition(null);
      } else if (e.key === "Escape") {
        setSelectedTransition(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [selectedTransition]);

  const setActiveGesture = (g: Gesture | null) => {
    if (g && g.kind !== "marquee" && !frozenLayoutsRef.current)
      frozenLayoutsRef.current = trackLayouts.map((layout) => ({
        ...layout,
        lanes: new Map(layout.lanes),
      }));
    if (!g) frozenLayoutsRef.current = null;
    gestureRef.current = g;
    setGesture(g);
  };
  const trimPreview = gesture?.kind === "trim" ? trimLinked(project, gesture.id, gesture.edge, gesture.time) : project;
  const displayClip = (clip: Clip) => {
    if (gesture?.kind === "move" && gesture.ids.includes(clip.id)) {
      const targetTrk = project.tracks.find((t) => t.id === gesture.targetTrackId);
      const canMove = targetTrk ? canMoveToTrack(clip, targetTrk, project) : false;
      return {
        ...clip,
        start: Math.max(0, clip.start + gesture.delta),
        trackId:
          gesture.targetTrackId !== gesture.trackId && canMove
            ? gesture.targetTrackId
            : clip.trackId,
      };
    }
    if (gesture?.kind === "trim") return trimPreview.clips.find(c => c.id === clip.id) ?? clip;
    return clip;
  };
  // Dynamic tracks: Keep Video 1 and all video tracks visible, text/audio visible when containing media
  const primaryVideoTrack = project.tracks.find((t) => t.name === "Video 1") ?? [...project.tracks].reverse().find((t) => t.kind === "video") ?? project.tracks[0];
  const visibleTracks = project.tracks.filter((track) => {
    if (track.kind === "video") return true;
    if (track.id === primaryVideoTrack?.id) return true;
    if (project.clips.some((c) => c.trackId === track.id)) return true;
    if (dropTarget?.trackId === track.id) return true;
    if (trackActions?.id === track.id) return true;
    if (gesture?.kind === "move" && gesture.targetTrackId === track.id) return true;
    if (draggedKind && ((track.kind as string) === draggedKind || (draggedKind === "image" && (track.kind as string) === "video"))) return true;
    return false;
  });

  const moveClipVertically = (clip: Clip, direction: "up" | "down") => {
    const p = useEditorStore.getState().project;
    const currentIdx = p.tracks.findIndex((t) => t.id === clip.trackId);
    if (currentIdx < 0) return;
    const currentTrack = p.tracks[currentIdx];

    if (direction === "up") {
      const upperTrack = p.tracks.slice(0, currentIdx).reverse().find((t) => t.kind === currentTrack.kind && !t.locked);
      if (upperTrack) {
        props.onMoveClips([clip.id], 0, upperTrack.id);
      } else {
        const newTrack = createTrack(
          currentTrack.kind,
          `Video ${p.tracks.filter((t) => t.kind === "video").length + 1}`,
        );
        const tracks = [...p.tracks];
        tracks.splice(currentIdx, 0, newTrack);
        const clips = p.clips.map((c) => (c.id === clip.id ? { ...c, trackId: newTrack.id } : c));
        useEditorStore.getState().commit(pruneEmptyOverlayTracks({ ...p, tracks, clips }));
      }
    } else {
      const lowerTrack = p.tracks.slice(currentIdx + 1).find((t) => t.kind === currentTrack.kind && !t.locked);
      if (lowerTrack) {
        props.onMoveClips([clip.id], 0, lowerTrack.id);
      } else {
        const newTrack = createTrack(
          currentTrack.kind,
          `Video ${p.tracks.filter((t) => t.kind === "video").length + 1}`,
        );
        const tracks = [...p.tracks];
        tracks.splice(currentIdx, 0, newTrack);
        const clips = p.clips.map((c) => (c.id === clip.id ? { ...c, trackId: newTrack.id } : c));
        useEditorStore.getState().commit(pruneEmptyOverlayTracks({ ...p, tracks, clips }));
      }
    }
  };

  const moveClipToNewTrack = (clip: Clip) => {
    const p = useEditorStore.getState().project;
    const currentIdx = p.tracks.findIndex((t) => t.id === clip.trackId);
    if (currentIdx < 0) return;
    const currentTrack = p.tracks[currentIdx];
    const newTrack = createTrack(
      currentTrack.kind,
      `Video ${p.tracks.filter((t) => t.kind === "video").length + 1}`,
    );
    const tracks = [...p.tracks];
    // Overlay tracks ALWAYS sit ABOVE the current track (inserted at currentIdx)
    tracks.splice(currentIdx, 0, newTrack);
    const clips = p.clips.map((c) => (c.id === clip.id ? { ...c, trackId: newTrack.id } : c));
    useEditorStore.getState().commit(pruneEmptyOverlayTracks({ ...p, tracks, clips }));
  };

  const effectiveProjectClips = activeCompoundClip ? (activeCompoundClip.nestedClips || []) : project.clips;
  const clips = effectiveProjectClips.map(displayClip);
  const ADD_TRACK_HEIGHT = 55;
  const availableHeight = Math.max(0, viewportHeight - RULER);
  const rawTracksHeight = visibleTracks.reduce((acc, track) => {
    const live = layoutTrackClips(clips.filter((c) => c.trackId === track.id));
    return acc + live.height;
  }, 0);
  const totalTracksBlockHeight = rawTracksHeight + ADD_TRACK_HEIGHT;
  const tracksOffsetY = totalTracksBlockHeight < availableHeight
    ? Math.max(0, Math.floor((availableHeight - totalTracksBlockHeight) / 2))
    : 0;

  let trackTop = tracksOffsetY;
  const trackLayouts = visibleTracks.map((track) => {
    const live = layoutTrackClips(clips.filter((c) => c.trackId === track.id));
    const isAffectedByMove =
      gesture?.kind === "move" &&
      (track.id === gesture.targetTrackId || track.id === gesture.trackId);
    const frozen =
      gesture && gesture.kind !== "marquee" && !isAffectedByMove
        ? frozenLayoutsRef.current?.find((layout) => layout.id === track.id)
        : undefined;
    const layout = frozen
      ? {
          ...live,
          height: frozen.height,
          count: frozen.count,
          lanes: frozen.lanes,
        }
      : live;
    const result = { ...layout, id: track.id, top: trackTop };
    trackTop += layout.height;
    return result;
  });
  const tracksHeight = trackTop - tracksOffsetY;
  const actionTrack = project.tracks.find(
    (track) => track.id === trackActions?.id,
  );
  const actionIndex = project.tracks.findIndex(
    (track) => track.id === actionTrack?.id,
  );
  const deletionTrack = project.tracks.find(
    (track) => track.id === deleteTrackId,
  );
  const deletionCount = project.clips.filter(
    (clip) => clip.trackId === deleteTrackId,
  ).length;
  const beginRename = (track: Track) => {
    if (track.locked) return;
    setTrackActions(null);
    renameDraftRef.current = track.name;
    renameCancelledRef.current = false;
    setRenamingId(track.id);
  };
  const finishRename = () => {
    const track = project.tracks.find((track) => track.id === renamingId);
    const name = renameDraftRef.current.trim();
    if (!renameCancelledRef.current && track && !track.locked && name)
      props.onTrackUpdate(track.id, { name });
    setRenamingId(null);
  };
  const requestTrackDelete = (track: Track) => {
    if (track.locked || !props.onTrackDelete) return;
    setTrackActions(null);
    if (project.clips.some((clip) => clip.trackId === track.id))
      setDeleteTrackId(track.id);
    else props.onTrackDelete(track.id);
  };
  useEffect(() => {
    renameCancelledRef.current = true;
    setRenamingId(null);
    setTrackActions(null);
    setDeleteTrackId(null);
    setTrackMenu(false);
    pointerCleanupRef.current?.();
    gestureRef.current = null;
    frozenLayoutsRef.current = null;
    setGesture(null);
    setSnapLine(null);
  }, [project.id]);
  useEffect(() => {
    if (!trackActions) return;
    actionsMenuRef.current
      ?.querySelector<HTMLButtonElement>("button:not([disabled])")
      ?.focus();
    const outside = (event: PointerEvent) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest(".tl-track-action-menu,.tl-track-more")
      )
        setTrackActions(null);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTrackActions(null);
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", key);
    };
  }, [trackActions]);
  useEffect(() => {
    if (!deleteTrackId) return;
    const key = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === "Tab") {
        const buttons = Array.from(
          confirmRef.current?.querySelectorAll<HTMLButtonElement>(
            "button:not([disabled])",
          ) ?? [],
        );
        const current = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (
          (event.shiftKey && current <= 0) ||
          (!event.shiftKey && current === buttons.length - 1)
        ) {
          event.preventDefault();
          buttons[event.shiftKey ? buttons.length - 1 : 0]?.focus();
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDeleteTrackId(null);
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [deleteTrackId]);
  useEffect(() => () => pointerCleanupRef.current?.(), []);
  useEffect(() => {
    if (!selectedGap) return;
    const handleKey = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        storeCloseGap(selectedGap.trackId, selectedGap.start + 0.01);
        setSelectedGap(null);
      } else if (e.key === "Escape") {
        setSelectedGap(null);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedGap, storeCloseGap]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const updateSize = () => {
      setViewportWidth(el.clientWidth);
      setViewportHeight(el.clientHeight);
    };
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    updateSize();
    return () => observer.disconnect();
  }, []);
  const listenForGesture = (
    move: (event: PointerEvent) => void,
    finish: () => void,
  ) => {
    pointerCleanupRef.current?.();
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      pointerCleanupRef.current = null;
    };
    const end = () => {
      cleanup();
      finish();
    };
    const cancel = () => {
      cleanup();
      setActiveGesture(null);
      setSnapLine(null);
    };
    pointerCleanupRef.current = cleanup;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  };
  const locate = (clientX: number, clientY: number) => {
    const el = scrollRef.current!;
    const rect = el.getBoundingClientRect();
    return {
      x: Math.max(0, clientX - rect.left + el.scrollLeft - GUTTER),
      y: clientY - rect.top + el.scrollTop - RULER,
    };
  };
  const targetTrack = (clientY: number) => {
    const y = locate(0, clientY).y;
    if (y < 20 + tracksOffsetY && visibleTracks.length > 0) return visibleTracks[0];
    const index = trackLayouts.findIndex(
      (layout) => y < layout.top + layout.height + 15,
    );
    return visibleTracks[index < 0 ? visibleTracks.length - 1 : index];
  };
  const snap = (time: number, excluded: string[], offset = 0) => {
    const candidates = [
      0,
      playhead,
      ...project.clips
        .filter((c) => !excluded.includes(c.id))
        .flatMap((c) => [c.start, c.start + c.duration]),
    ];
    const value = snapping
      ? snapTimelineTime(time + offset, candidates, 8 / pps) - offset
      : time;
    setSnapLine(Math.abs(value - time) > 0.0001 ? value + offset : null);
    return value;
  };
  const snapPlayhead = (rawTime: number) => {
    if (!snapping) return rawTime;
    const candidates = [
      0,
      ...project.clips.flatMap((c) => [c.start, c.start + c.duration]),
    ];
    return snapTimelineTime(rawTime, candidates, 10 / pps);
  };
  const getTrackGaps = (trackId: string) => {
    const trackClips = project.clips.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start);
    const gaps: { start: number; duration: number }[] = [];
    if (!trackClips.length) return gaps;
    if (trackClips[0].start > 0.05) {
      gaps.push({ start: 0, duration: trackClips[0].start });
    }
    for (let i = 0; i < trackClips.length - 1; i++) {
      const end1 = trackClips[i].start + trackClips[i].duration;
      const start2 = trackClips[i + 1].start;
      if (start2 - end1 > 0.05) {
        gaps.push({ start: end1, duration: start2 - end1 });
      }
    }
    return gaps;
  };
  const handleZoomWithPlayheadCenter = (newPpsRaw: number) => {
    const el = scrollRef.current;
    const clampedNewPps = Math.max(5, Math.min(400, newPpsRaw));
    if (el) {
      const vWidth = el.clientWidth - GUTTER;
      const newScroll = calculateZoomScroll(playhead, pps, clampedNewPps, el.scrollLeft, vWidth);
      props.onZoom(clampedNewPps);
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollLeft = newScroll;
        }
      });
    } else {
      props.onZoom(clampedNewPps);
    }
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        handleZoomWithPlayheadCenter(pps * (event.deltaY < 0 ? 1.15 : 0.87));
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [pps, playhead, props.onZoom]);
  useEffect(() => {
    if (!playing || gestureRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const x = playhead * pps;
    if (x > el.scrollLeft + el.clientWidth - GUTTER - 32)
      el.scrollLeft = Math.max(0, x - (el.clientWidth - GUTTER) * 0.3);
    else if (x < el.scrollLeft) el.scrollLeft = x;
  }, [playhead, pps, props.playing]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement)?.tagName === "INPUT" ||
        (e.target as HTMLElement)?.tagName === "TEXTAREA"
      ) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "[" || e.key === "]")) {
        const primaryId = selectedIds[0];
        if (primaryId) {
          e.preventDefault();
          useEditorStore
            .getState()
            .swapClipWithAdjacent(primaryId, e.key === "[" ? "prev" : "next");
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [selectedIds]);

  const startClip = (
    event: ReactPointerEvent,
    clip: Clip,
    trim?: "start" | "end",
  ) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    (event.currentTarget as HTMLElement).focus({ preventScroll: true });
    setSelectedGap(null);
    setSelectedTransition(null);
    const track = project.tracks.find((t) => t.id === clip.trackId);
    if (track?.locked) return;
    if (activeTool === "razor" && !trim) {
      const clickTime = locate(event.clientX, event.clientY).x / pps;
      if (clickTime > clip.start && clickTime < clip.start + clip.duration) {
        splitAt(clip.id, clickTime);
        return;
      }
    }
    const additive = event.metaKey || event.ctrlKey || event.shiftKey;
    const groupIds = linkedIds(project, [clip.id]);
    const ids = selectedIds.includes(clip.id)
      ? additive && !trim
        ? selectedIds.filter((id) => !groupIds.includes(id))
        : [clip.id, ...selectedIds.filter(id => id !== clip.id)]
      : additive
        ? [...new Set([...selectedIds, ...groupIds])]
        : groupIds;
    onSelect(ids);
    if (additive && !ids.includes(clip.id)) return;
    const startX = event.clientX,
      startY = event.clientY;
    if (project.clips.some(c => ids.includes(c.id) && project.tracks.find(t => t.id === c.trackId)?.locked)) return;
    const movable = ids.filter(
      (id) =>
        !project.tracks.find(
          (t) => t.id === project.clips.find((c) => c.id === id)?.trackId,
        )?.locked,
    );
    const earliest = Math.min(
      ...project.clips
        .filter((c) => movable.includes(c.id))
        .map((c) => c.start),
    );
    const el = scrollRef.current!;
    const startScroll = el.scrollLeft;
    const move = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      if (e.clientX > rect.right - 28) el.scrollLeft += 12;
      if (e.clientX < rect.left + GUTTER + 20) el.scrollLeft -= 12;
      const delta = (e.clientX - startX + el.scrollLeft - startScroll) / pps;
      if (
        !gestureRef.current &&
        Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) < 3
      )
        return;
      if (trim) {
        let time = snap(
          (trim === "start" ? clip.start : clip.start + clip.duration) + delta,
          groupIds,
        );
        time =
          trim === "start"
            ? Math.max(
                0,
                Math.min(clip.start + clip.duration - 1 / project.fps, time),
              )
            : Math.max(clip.start + 1 / project.fps, time);
        const asset = project.assets.find((a) => a.id === clip.assetId);
        if (asset && asset.kind !== "image") {
          if (trim === "start")
            time = Math.max(clip.start - clip.sourceIn / clip.speed, time);
          else
            time = Math.min(
              clip.start + (asset.duration - clip.sourceIn) / clip.speed,
              time,
            );
        }
        setActiveGesture({
          kind: "trim",
          id: clip.id,
          edge: trim,
          time: snapToFrame(time, project.fps),
        });
      } else {
        let adjusted = Math.max(-earliest, delta);
        const startSnap = snap(clip.start + adjusted, movable);
        if (Math.abs(startSnap - clip.start - adjusted) > 0.0001)
          adjusted = startSnap - clip.start;
        else {
          const endSnap = snap(clip.start + adjusted, movable, clip.duration);
          adjusted = endSnap - clip.start;
        }
        adjusted = Math.max(-earliest, adjusted);
        const yLoc = locate(0, e.clientY).y;
        const firstVideoLayout = trackLayouts.find((l) => {
          const t = visibleTracks.find((tr) => tr.id === l.id);
          return t?.kind === "video";
        });
        const clipAsset = project.assets.find(a => a.id === clip.assetId);
        const isVideoClip = !clip.text && clipAsset?.kind !== "audio";
        const isDraggingAboveVideo =
          isVideoClip &&
          Boolean(firstVideoLayout) &&
          yLoc < (firstVideoLayout?.top ?? 0);

        let targetTrackId: string;
        let isNewTrack = false;
        if (isDraggingAboveVideo) {
          targetTrackId = "new-overlay-track";
          isNewTrack = true;
        } else {
          const candidate = targetTrack(e.clientY);
          const compatible = candidate && canMoveToTrack(clip, candidate, project);
          targetTrackId = compatible ? candidate.id : clip.trackId;
        }

        const isMain = !isNewTrack && targetTrackId === primaryVideoTrack?.id;
        let insertSlot: { insertTime: number; insertIndex: number } | undefined;
        if (isMain) {
          const targetClips = project.clips.filter((c) => c.trackId === targetTrackId);
          insertSlot = calculateInsertionSlot(
            clip.start + adjusted,
            targetClips,
            clip.id,
          );
        }

        setActiveGesture({
          kind: "move",
          ids: movable,
          delta: snapToFrame(adjusted, project.fps),
          primaryId: clip.id,
          trackId: clip.trackId,
          targetTrackId,
          pointerX: e.clientX,
          pointerY: e.clientY,
          insertSlot,
        });
      }
    };
    const finish = () => {
      const g = gestureRef.current;
      if (
        g?.kind === "move" &&
        (Math.abs(g.delta) > 0.001 || g.targetTrackId !== g.trackId || g.insertSlot || g.targetTrackId === "new-overlay-track")
      ) {
        if (g.targetTrackId === "new-overlay-track") {
          const p = useEditorStore.getState().project;
          const firstVideoIdx = p.tracks.findIndex((t) => t.kind === "video");
          const newTrack = createTrack(
            "video",
            `Video ${p.tracks.filter((t) => t.kind === "video").length + 1}`,
          );
          const tracks = [...p.tracks];
          tracks.splice(firstVideoIdx >= 0 ? firstVideoIdx : 0, 0, newTrack);
          const clips = p.clips.map((c) => {
            if (!g.ids.includes(c.id)) return c;
            const isAudio = p.assets.find((a) => a.id === c.assetId)?.kind === "audio" ||
              p.tracks.find((t) => t.id === c.trackId)?.kind === "audio";
            const targetTrackForClip = isAudio ? c.trackId : newTrack.id;
            return {
              ...c,
              trackId: targetTrackForClip,
              start: snapToFrame(Math.max(0, c.start + g.delta), p.fps),
            };
          });
          useEditorStore.getState().commit(pruneEmptyOverlayTracks({ ...p, tracks, clips }));
        } else {
          const isMain = g.targetTrackId === primaryVideoTrack?.id;
          if (isMain && g.insertSlot) {
            useEditorStore
              .getState()
              .reorderClip(
                g.primaryId,
                g.targetTrackId,
                g.insertSlot.insertTime,
                "insert",
              );
          } else {
            props.onMoveClips(
              g.ids,
              g.delta,
              g.targetTrackId !== g.trackId ? g.targetTrackId : undefined,
            );
          }
        }
      }
      if (g?.kind === "trim") props.onTrim(g.id, g.edge, g.time);
      setActiveGesture(null);
      setSnapLine(null);
    };
    listenForGesture(move, finish);
  };
  const scrub = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const raw = Math.max(0, locate(event.clientX, event.clientY).x / pps);
    onSeek(snapPlayhead(raw));
    const move = (e: PointerEvent) => {
      const t = Math.max(0, locate(e.clientX, e.clientY).x / pps);
      onSeek(snapPlayhead(t));
    };
    const finish = () => {};
    listenForGesture(move, finish);
  };
  const startSelection = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    setSelectedGap(null);
    setSelectedTransition(null);
    const start = locate(event.clientX, event.clientY);
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    const previous = additive ? selectedIds : [];
    if (!additive) {
      onSeek(Math.max(0, start.x / pps));
      onSelect([]);
    }
    let moved = false;
    const move = (e: PointerEvent) => {
      const current = locate(e.clientX, e.clientY);
      if (Math.abs(current.x - start.x) + Math.abs(current.y - start.y) < 5)
        return;
      moved = true;
      const x = Math.min(start.x, current.x),
        y = Math.min(start.y, current.y),
        width = Math.abs(start.x - current.x),
        height = Math.abs(start.y - current.y);
      setActiveGesture({ kind: "marquee", x, y, width, height });
      const found = project.clips
        .filter((c) => {
          const row = visibleTracks.findIndex((t) => t.id === c.trackId);
          return (
            !project.tracks[row]?.locked &&
            c.start * pps < x + width &&
            (c.start + c.duration) * pps > x &&
            trackLayouts[row] &&
            trackLayouts[row].top +
              8 +
              (trackLayouts[row].lanes.get(c.id) ?? 0) * 62 +
              54 >
              y &&
            trackLayouts[row].top +
              8 +
              (trackLayouts[row].lanes.get(c.id) ?? 0) * 62 <
              y + height
          );
        })
        .map((c) => c.id);
      onSelect([...new Set([...previous, ...found])]);
    };
    const finish = () => {
      if (!moved) {
        onSeek(start.x / pps);
        if (!additive) onSelect([]);
      }
      setActiveGesture(null);
    };
    listenForGesture(move, finish);
  };
  const selectedUnlocked = selectedIds.some((id) => {
    const c = project.clips.find((c) => c.id === id);
    return c && !project.tracks.find((t) => t.id === c.trackId)?.locked;
  });
  const onDrop = (event: React.DragEvent, track: Track) => {
    event.preventDefault();
    setDropTarget(null);
    const isTextDrag =
      event.dataTransfer.types.includes("application/x-gocut-text") ||
      event.dataTransfer.types.includes("application/x-reacut-text");
    if (isTextDrag && !track.locked) {
      const raw =
        event.dataTransfer.getData("application/x-gocut-text") ||
        event.dataTransfer.getData("application/x-reacut-text");
      if (raw) {
        try {
          const preset: TextPreset = JSON.parse(raw);
          const dropTime = Math.max(0, locate(event.clientX, event.clientY).x / pps);
          const p = useEditorStore.getState().project;
          let targetTrack = p.tracks.find((t) => t.kind === "text" && !t.locked);
          let tracks = [...p.tracks];
          if (!targetTrack) {
            targetTrack = createTrack("text", "Text 1");
            tracks = [targetTrack, ...tracks];
          }
          const textClip = createClip(undefined, targetTrack.id, dropTime, p.fps);
          textClip.name = preset.name;
          textClip.duration = 3;
          textClip.text = { ...textClip.text!, ...preset.style };
          useEditorStore.getState().commit({
            ...p,
            tracks,
            clips: [...p.clips, textClip],
          });
          onSelect([textClip.id]);
        } catch {}
      }
      return;
    }
    const isTransitionDrag =
      event.dataTransfer.types.includes("application/x-reacut-transition") ||
      event.dataTransfer.types.includes("application/x-gocut-transition");

    if (isTransitionDrag && track.kind === "video" && !track.locked) {
      const transitionId = (event.dataTransfer.getData("application/x-gocut-transition") ||
        event.dataTransfer.getData("application/x-reacut-transition")) as any;
      const durationRaw = event.dataTransfer.getData("application/x-transition-duration");
      const duration = durationRaw ? parseFloat(durationRaw) : 0.5;
      const dropTime = Math.max(0, locate(event.clientX, event.clientY).x / pps);

      const trackClips = project.clips
        .filter((c) => c.trackId === track.id)
        .sort((a, b) => a.start - b.start);

      if (trackClips.length === 0) return;

      let frontTarget: Clip | undefined;
      const hitClip = trackClips.find(
        (c) => dropTime >= c.start - 0.2 && dropTime <= c.start + c.duration + 0.2,
      );

      if (hitClip) {
        const hitIndex = trackClips.findIndex((c) => c.id === hitClip.id);
        const prev = trackClips[hitIndex - 1];
        const next = trackClips[hitIndex + 1];

        if (prev && (!next || dropTime - hitClip.start < (hitClip.start + hitClip.duration) - dropTime)) {
          frontTarget = prev;
        } else if (next) {
          frontTarget = hitClip;
        } else if (prev) {
          frontTarget = prev;
        } else {
          frontTarget = hitClip;
        }
      } else {
        let minSeamDist = Infinity;
        for (let i = 0; i < trackClips.length - 1; i++) {
          const c1 = trackClips[i];
          const c2 = trackClips[i + 1];
          const seamTime = (c1.start + c1.duration + c2.start) / 2;
          const dist = Math.abs(dropTime - seamTime);
          if (dist < minSeamDist) {
            minSeamDist = dist;
            frontTarget = c1;
          }
        }
      }

      if (frontTarget) {
        const fIdx = trackClips.findIndex((c) => c.id === frontTarget!.id);
        const nClip = trackClips[fIdx + 1];

        if (nClip) {
          const fEnd = frontTarget.start + frontTarget.duration;
          if (nClip.start > fEnd + 0.001) {
            const gap = nClip.start - fEnd;
            const updatedClips = project.clips.map((c) => {
              if (c.trackId === track.id && c.start >= nClip.start - 1e-4) {
                return { ...c, start: Math.max(0, c.start - gap) };
              }
              return c;
            });
            useEditorStore.getState().commit({ ...project, clips: updatedClips });
          }
          try {
            useEditorStore.getState().applyTransition(frontTarget.id, transitionId, duration);
          } catch (err) {
            console.warn("Could not apply transition between clips:", err);
          }
        } else {
          const isIntro = dropTime <= frontTarget.start + frontTarget.duration / 2;
          if (isIntro) {
            useEditorStore.getState().updateClip(frontTarget.id, { fadeIn: Math.min(duration, frontTarget.duration / 2) });
          } else {
            useEditorStore.getState().updateClip(frontTarget.id, { fadeOut: Math.min(duration, frontTarget.duration / 2) });
          }
        }
      }
      return;
    }
    const id =
      event.dataTransfer.getData(ASSET_DRAG_TYPE) ||
      event.dataTransfer.getData("assetid");
    const asset = project.assets.find((a) => a.id === id);
    if (
      asset &&
      !asset.missing &&
      !track.locked &&
      (asset.kind === track.kind ||
        (asset.kind === "image" && track.kind === "video"))
    ) {
      const rawDropTime = Math.max(0, locate(event.clientX, event.clientY).x / pps);
      let targetTime = rawDropTime;
      if (magnetic) {
        const trackClips = project.clips.filter((c) => c.trackId === track.id).sort((a, b) => a.start - b.start);
        if (trackClips.length === 0) {
          targetTime = 0;
        } else {
          const lastEnd = trackClips.reduce((maxEnd, c) => Math.max(maxEnd, c.start + c.duration), 0);
          if (rawDropTime >= lastEnd - 0.2) {
            targetTime = lastEnd;
          } else if (rawDropTime <= 0.2) {
            targetTime = 0;
          }
        }
      }
      props.onDropAsset?.(
        id,
        snapToFrame(targetTime, project.fps),
        track.id,
      );
    }
  };

  const onDropNewTrack = (event: React.DragEvent) => {
    event.preventDefault();
    setDropTarget(null);
    const id =
      event.dataTransfer.getData(ASSET_DRAG_TYPE) ||
      event.dataTransfer.getData("assetid");
    const asset = project.assets.find((a) => a.id === id);
    if (!asset || asset.missing) return;
    const kind = asset.kind === "image" ? "video" : asset.kind;
    if (kind !== "video") return;
    useEditorStore.getState().addTrack("video");
    const updatedProject = useEditorStore.getState().project;
    const newTrack = updatedProject.tracks.find((t) => t.kind === "video")!;
    props.onDropAsset?.(
      id,
      snapToFrame(
        Math.max(0, locate(event.clientX, event.clientY).x / pps),
        project.fps,
      ),
      newTrack.id,
    );
  };


  return (
    <section
      className={`tl ${activeTool === "razor" ? "is-razor-tool" : ""}`}
      aria-label={t("timeline.title")}
      style={
        {
          "--tl-row": `${ROW}px`,
          "--tl-gutter": `${GUTTER}px`,
        } as CSSProperties
      }
    >
      <div className="tl-toolbar">
        <div className="tl-toolbar-group">
          <button
            title={`${t("toolbar.undo")} · ⌘Z`}
            aria-label={t("toolbar.undo")}
            onClick={props.onUndo}
            disabled={!props.canUndo}
          >
            <Undo2 size={17} />
          </button>
          <button
            title={`${t("toolbar.redo")} · ⇧⌘Z`}
            aria-label={t("toolbar.redo")}
            onClick={props.onRedo}
            disabled={!props.canRedo}
          >
            <Redo2 size={17} />
          </button>
          <span className="tl-divider" />
          <button
            className={activeTool === "select" ? "is-active" : ""}
            title={`${t("timeline.selectTool")} · V`}
            aria-label={`${t("timeline.selectTool")} · V`}
            onClick={() => setActiveTool("select")}
          >
            <MousePointer2 size={16} />
          </button>
          <button
            className={activeTool === "razor" ? "is-active" : ""}
            title="Razor Tool (剪刀工具) · C"
            aria-label="Razor Tool · C"
            onClick={() => setActiveTool(activeTool === "razor" ? "select" : "razor")}
          >
            <Scissors size={16} />
          </button>
          <button
            title={`${t("toolbar.split")} · ⌘B`}
            aria-label={t("toolbar.split")}
            onClick={props.onSplit}
            disabled={
              !project.clips.some(
                (c) =>
                  !project.tracks.find((t) => t.id === c.trackId)?.locked &&
                  (!selectedIds.length || selectedIds.includes(c.id)) &&
                  c.start < playhead &&
                  c.start + c.duration > playhead,
              )
            }
          >
            <Scissors size={17} />
          </button>
          <button
            title={t("shortcuts.duplicate")}
            aria-label={t("shortcuts.duplicate")}
            onClick={props.onDuplicate}
            disabled={!selectedUnlocked || !props.onDuplicate}
          >
            <Copy size={16} />
          </button>
          <button
            title={`${t("toolbar.delete")} · Backspace`}
            aria-label={t("toolbar.delete")}
            onClick={props.onDelete}
            disabled={!selectedUnlocked}
          >
            <Trash2 size={16} />
          </button>
          <span className="tl-divider" />
          <button
            className={magnetic ? "is-active" : ""}
            title={
              magnetic
                ? t("timeline.magneticDeleteOn")
                : t("timeline.magneticDeleteOff")
            }
            aria-label={t("timeline.magneticDelete")}
            aria-pressed={magnetic}
            onClick={() => {
              const next = !magnetic;
              setLocalMagnetic(next);
              props.onMagneticChange?.(next);
              if (next) {
                const snapped = rippleSnapAllTracks(project);
                useEditorStore.getState().commit(snapped);
              }
            }}
          >
            <Magnet size={17} />
          </button>
          <button
            className={snapping ? "is-active" : ""}
            title={snapping ? t("timeline.snappingOn") : t("timeline.snappingOff")}
            aria-label={t("toolbar.snapping")}
            aria-pressed={snapping}
            onClick={() => {
              setLocalSnap(!snapping);
              props.onSnappingChange?.(!snapping);
            }}
          >
            <span className="tl-snap-icon">][</span>
          </button>
        </div>
        <div className="tl-toolbar-end">
          <span className="tl-duration">
            {formatTimelineTime(playhead, project.fps)} <i>/</i>{" "}
            {formatTimelineTime(
              Math.max(0, ...project.clips.map((c) => c.start + c.duration)),
              project.fps,
            )}
          </span>
          <button
            title={t("toolbar.zoomOut")}
            aria-label={t("toolbar.zoomOut")}
            onClick={() => handleZoomWithPlayheadCenter(pps / 1.25)}
          >
            <ZoomOut size={16} />
          </button>
          <input
            aria-label={t("shortcuts.zoomInOut")}
            type="range"
            min="5"
            max="400"
            value={pps}
            onChange={(e) => handleZoomWithPlayheadCenter(Number(e.target.value))}
          />
          <button
            title={t("toolbar.zoomIn")}
            aria-label={t("toolbar.zoomIn")}
            onClick={() => handleZoomWithPlayheadCenter(pps * 1.25)}
          >
            <ZoomIn size={16} />
          </button>
          <button
            className="tl-fit"
            title={t("timeline.fit")}
            onClick={() => {
              const width =
                (scrollRef.current?.clientWidth ?? 900) - GUTTER - 60;
              props.onZoom(
                Math.max(
                  5,
                  Math.min(
                    400,
                    width /
                      Math.max(
                        10,
                        ...project.clips.map((c) => c.start + c.duration),
                      ),
                  ),
                ),
              );
              if (scrollRef.current) scrollRef.current.scrollLeft = 0;
            }}
          >
            {t("timeline.fit")}
          </button>
        </div>
      </div>
      <div
        className="tl-scroll"
        ref={scrollRef}
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
            handleZoomWithPlayheadCenter(pps * factor);
          }
        }}
      >
        <div
          className="tl-content"
          style={{
            width: bodyWidth + GUTTER,
            minWidth: "100%",
            minHeight: "100%",
          }}
          onDragOver={(e) => {
            const kind = (["audio", "video", "image", "text"] as const).find((k) =>
              e.dataTransfer.types.includes(`application/x-reacut-kind-${k}`)
            );
            if (kind && kind !== draggedKind) {
              setDraggedKind(kind);
            }
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setDraggedKind(null);
            }
          }}
          onDropCapture={() => setDraggedKind(null)}
        >
          {nestedTimelineScope && activeCompoundClip && (
            <div className="tl-subtimeline-banner">
              <button
                className="tl-subtimeline-btn"
                onClick={() => exitCompoundClip()}
                title="Kembali ke Timeline Utama"
              >
                🏠 {t("timeline.main")}
              </button>
              <span className="tl-subtimeline-sep">›</span>
              <span className="tl-subtimeline-current">
                📦 {activeCompoundClip.name || "Klip Bersarang"}
              </span>
              <button
                className="tl-subtimeline-exit"
                onClick={() => exitCompoundClip()}
              >
                ← Keluar dari Sub-Timeline
              </button>
            </div>
          )}
          <div className="tl-ruler" style={{ height: RULER }}>
            <div className="tl-ruler-label">
              {t("timeline.main")} <span>{project.fps} FPS</span>
            </div>
            <div
              className="tl-ruler-body"
              onPointerDown={scrub}
              style={{ width: bodyWidth }}
            >
              {ticks.map((t) => (
                <div className="tl-tick" key={t} style={{ left: t * pps }}>
                  <span>{formatRulerTime(t, interval < 1)}</span>
                  <i />
                </div>
              ))}
              <div
                className="tl-ruler-playhead"
                style={{ left: playhead * pps }}
              >
                <div
                  className="tl-playhead-handle"
                  role="slider"
                  tabIndex={0}
                  aria-label={t("timeline.main")}
                  aria-valuenow={playhead}
                  aria-valuemin={0}
                  aria-valuemax={duration}
                  aria-valuetext={formatTimelineTime(playhead, project.fps)}
                  onPointerDown={scrub}
                  onKeyDown={(event) => {
                    if (
                      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key,
                      )
                    ) {
                      event.preventDefault();
                      event.stopPropagation();
                      onSeek(
                        event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? Math.max(
                                0,
                                ...project.clips.map(
                                  (c) => c.start + c.duration,
                                ),
                              )
                            : Math.max(
                                0,
                                playhead +
                                  (event.key === "ArrowLeft" ? -1 : 1) *
                                    (event.shiftKey ? 1 : 1 / project.fps),
                              ),
                      );
                    }
                  }}
                />
              </div>
            </div>
          </div>
          <div
            className="tl-tracks-container"
            style={{
              paddingTop: tracksOffsetY,
              minHeight: availableHeight,
              boxSizing: "border-box",
            }}
          >
            <div
              className={`tl-new-track-dropzone ${dropTarget?.trackId === "new-video-track" || (gesture?.kind === "move" && gesture.targetTrackId === "new-overlay-track") ? "is-active" : ""}`}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes("application/x-reacut-transition") || event.dataTransfer.types.includes("application/x-gocut-transition")) return;
              const id =
                event.dataTransfer.types.includes(ASSET_DRAG_TYPE) ||
                event.dataTransfer.types.includes("assetid");
              const sourceKind = (["audio", "video", "image"] as const).find((kind) =>
                event.dataTransfer.types.includes(`application/x-reacut-kind-${kind}`)
              );
              if (id && sourceKind !== "audio") {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                setDropTarget({
                  trackId: "new-video-track",
                  time: Math.max(0, locate(event.clientX, event.clientY).x / pps),
                });
              }
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                if (dropTarget?.trackId === "new-video-track") {
                  setDropTarget(null);
                }
              }
            }}
            onDrop={onDropNewTrack}
          >
            {(dropTarget?.trackId === "new-video-track" || (gesture?.kind === "move" && gesture.targetTrackId === "new-overlay-track")) && (
              <div className="tl-new-track-hint">
                <Plus size={14} />
                <span>+ Trek Video Overlay Baru (Di Atas)</span>
              </div>
            )}
          </div>
          {visibleTracks.map((track, index) => (
            <div
              className={`tl-track tl-track-${track.kind} ${track.locked ? "is-locked" : ""} ${dropTarget?.trackId === track.id ? "is-drop-target" : ""} ${gesture?.kind === "move" && gesture.targetTrackId === track.id ? "is-drag-target" : ""}`}
              key={track.id}
              data-track-id={track.id}
              style={{ height: trackLayouts[index].height }}
            >
              <div className="tl-track-header">
                <div className="tl-track-title">
                  <TrackIcon kind={track.kind} />
                  {renamingId === track.id ? (
                    <input
                      className="tl-track-name-input"
                      aria-label={t("timeline.renameTrack")}
                      autoFocus
                      defaultValue={track.name}
                      maxLength={256}
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) => {
                        renameDraftRef.current = event.target.value;
                      }}
                      onBlur={finishRename}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.stopPropagation();
                          finishRename();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          event.stopPropagation();
                          renameCancelledRef.current = true;
                          setRenamingId(null);
                        }
                      }}
                    />
                  ) : (
                    <span
                      title={`${formatTrackName(track.name, track.kind, t)}${track.locked ? "" : ` · ${t("timeline.trackRenameHint")}`}`}
                      onDoubleClick={() => beginRename(track)}
                    >
                      {formatTrackName(track.name, track.kind, t)}
                    </span>
                  )}
                  <span className="tl-track-number">
                    {trackLayouts[index].count > 1
                      ? `${trackLayouts[index].count} ${t("timeline.layers")}`
                      : index + 1}
                  </span>
                </div>
                <div className="tl-track-controls">
                  <button
                    title={track.locked ? t("timeline.unlock") : t("timeline.lock")}
                    aria-label={`${track.locked ? t("timeline.unlock") : t("timeline.lock")}: ${track.name}`}
                    className={track.locked ? "is-active" : ""}
                    onClick={() =>
                      props.onTrackUpdate(track.id, { locked: !track.locked })
                    }
                  >
                    {track.locked ? (
                      <LockKeyhole size={13} />
                    ) : (
                      <UnlockKeyhole size={13} />
                    )}
                  </button>
                  <button
                    title={track.hidden ? t("timeline.show") : t("timeline.hide")}
                    aria-label={`${track.hidden ? t("timeline.show") : t("timeline.hide")}: ${track.name}`}
                    className={track.hidden ? "is-active" : ""}
                    onClick={() =>
                      props.onTrackUpdate(track.id, { hidden: !track.hidden })
                    }
                  >
                    {track.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  {track.kind !== "text" && (
                    <button
                      title={track.muted ? t("timeline.unmute") : t("timeline.mute")}
                      aria-label={`${track.muted ? t("timeline.unmute") : t("timeline.mute")}: ${track.name}`}
                      className={track.muted ? "is-active" : ""}
                      onClick={() =>
                        props.onTrackUpdate(track.id, { muted: !track.muted })
                      }
                    >
                      {track.muted ? (
                        <VolumeX size={13} />
                      ) : (
                        <Volume2 size={13} />
                      )}
                    </button>
                  )}
                  <button
                    title={t("timeline.moveTrackUp")}
                    aria-label={`${t("timeline.moveTrackUp")}: ${track.name}`}
                    disabled={index <= 0 || track.locked || visibleTracks[index - 1]?.locked}
                    onClick={() => props.onTrackMove?.(track.id, "up")}
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    title={t("timeline.moveTrackDown")}
                    aria-label={`${t("timeline.moveTrackDown")}: ${track.name}`}
                    disabled={index >= visibleTracks.length - 1 || track.locked || visibleTracks[index + 1]?.locked}
                    onClick={() => props.onTrackMove?.(track.id, "down")}
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    className="tl-track-more"
                    title={t("timeline.trackActions")}
                    aria-label={`${track.name} ${t("timeline.trackActions")}`}
                    aria-expanded={trackActions?.id === track.id}
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      setTrackActions(
                        trackActions?.id === track.id
                          ? null
                          : {
                              id: track.id,
                              x: Math.min(
                                window.innerWidth - 180,
                                Math.max(8, rect.left),
                              ),
                              y: Math.min(
                                window.innerHeight - 180,
                                Math.max(8, rect.bottom + 4),
                              ),
                            },
                      );
                    }}
                  >
                    <MoreHorizontal size={13} />
                  </button>
                </div>
              </div>
              <div
                className="tl-lane"
                style={{
                  width: bodyWidth,
                  backgroundSize: `${interval * pps}px 100%`,
                }}
                onPointerDown={startSelection}
                onContextMenu={(e) => {
                  e.preventDefault();
                  const clickTime = locate(e.clientX, e.clientY).x / pps;
                  const items: ContextMenuItem[] = [
                    {
                      label: t("shortcuts.paste") || "Paste",
                      icon: <Copy size={14} />,
                      shortcut: "⌘V",
                      disabled: track.locked,
                      onClick: () => {
                        onSeek(clickTime);
                        useEditorStore.getState().paste();
                      },
                    },
                    {
                      label: t("timeline.closeGap") || "Close Gap Here",
                      disabled: track.locked,
                      onClick: () => {
                        storeCloseGap(track.id, clickTime);
                      },
                    },
                    { divider: true, label: "", onClick: () => {} },
                    {
                      label: t("timeline.selectTool") || "Select Tool",
                      icon: <MousePointer2 size={14} />,
                      shortcut: "V",
                      onClick: () => setActiveTool("select"),
                    },
                    {
                      label: "Razor Tool",
                      icon: <Scissors size={14} />,
                      shortcut: "C",
                      onClick: () => setActiveTool("razor"),
                    },
                  ];
                  setContextMenu({ x: e.clientX, y: e.clientY, items });
                }}
                onDragOver={(event) => {
                  if (event.dataTransfer.types.includes("application/x-reacut-transition") || event.dataTransfer.types.includes("application/x-gocut-transition")) {
                    if (track.kind === "video" && !track.locked) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "copy";
                    }
                    return;
                  }
                  if (event.dataTransfer.types.includes("application/x-reacut-text") || event.dataTransfer.types.includes("application/x-gocut-text")) {
                    if (!track.locked) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "copy";
                    }
                    return;
                  }
                  const id =
                    event.dataTransfer.types.includes(ASSET_DRAG_TYPE) ||
                    event.dataTransfer.types.includes("assetid");
                  const sourceKind = (
                    ["audio", "video", "image"] as const
                  ).find((kind) =>
                    event.dataTransfer.types.includes(
                      `application/x-reacut-kind-${kind}`,
                    ),
                  );
                  if (
                    track.locked ||
                    !id ||
                    (sourceKind &&
                      !(
                        sourceKind === track.kind ||
                        (sourceKind === "image" && track.kind === "video")
                      ))
                  )
                    return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                  setDropTarget({
                    trackId: track.id,
                    time: Math.max(
                      0,
                      locate(event.clientX, event.clientY).x / pps,
                    ),
                  });
                }}
                onDragLeave={(event) => {
                  if (
                    !event.currentTarget.contains(event.relatedTarget as Node)
                  )
                    setDropTarget(null);
                }}
                onDrop={(event) => onDrop(event, track)}
              >
                {/* Vertical Insertion Beam Indicator */}
                {gesture?.kind === "move" &&
                  gesture.targetTrackId === track.id &&
                  gesture.insertSlot && (
                    <div
                      className="tl-insertion-beam"
                      style={{
                        left: gesture.insertSlot.insertTime * pps,
                      }}
                    />
                  )}
                
                {/* CapCut-style Transition Seam Badges (Non-stacking) */}
                {clips
                  .filter((c) => c.trackId === track.id)
                  .map((clip, ci, trackClips) => {
                    const prev = trackClips[ci - 1];
                    const hasTransition =
                      prev &&
                      (clip.fadeIn > 0 || prev.fadeOut > 0 || (clip.start < prev.start + prev.duration && prev.start + prev.duration - clip.start > 0.05)) &&
                      clip.start <= prev.start + prev.duration + 0.01 &&
                      clip.start >= prev.start + prev.duration - 5;
                    if (!hasTransition) return null;
                    const overlap = Math.max(0, prev.start + prev.duration - clip.start);
                    const transDuration = Math.max(
                      0.1,
                      clip.fadeIn || 0,
                      prev.fadeOut || 0,
                      overlap
                    );
                    const transitionWidth = Math.max(20, transDuration * pps);
                    const seamTime = overlap > 0 ? clip.start + overlap / 2 : clip.start;
                    const transitionLeft = Math.max(0, seamTime * pps - transitionWidth / 2);
                    const isSelected = selectedTransition === clip.id;
                    return (
                      <div
                        key={`trans-${prev.id}-${clip.id}`}
                        className={`tl-transition-block ${isSelected ? "is-selected" : ""}`}
                        style={{
                          left: transitionLeft,
                          width: transitionWidth,
                          top: 8,
                          height: 54,
                        }}
                        title={`Transisi: ${transDuration.toFixed(2)}s · Klik untuk memilih, Tekan Del untuk menghapus`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTransition(clip.id);
                          onSelect([clip.id]);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedTransition(clip.id);
                          setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            items: [
                              {
                                label: t("toolbar.delete") || "Hapus Transisi",
                                icon: <Trash2 size={14} />,
                                shortcut: "Backspace",
                                danger: true,
                                onClick: () => {
                                  useEditorStore.getState().removeTransition(clip.id);
                                  setSelectedTransition(null);
                                },
                              },
                            ],
                          });
                        }}
                      >
                        <div className="tl-transition-center-seam" />
                        <span className="tl-transition-bowtie" aria-hidden="true">
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <polygon points="1,2 8,8 1,14" />
                            <polygon points="15,2 8,8 15,14" />
                          </svg>
                        </span>
                      </div>
                    );
                  })}

                {getTrackGaps(track.id).map((gap, gi) => {
                  const isSelected = selectedGap?.trackId === track.id && Math.abs(selectedGap.start - gap.start) < 0.01;
                  return (
                    <div
                      key={`gap-${gi}`}
                      className={`tl-gap ${isSelected ? "is-selected" : ""}`}
                      style={{
                        left: gap.start * pps,
                        width: gap.duration * pps,
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelectedGap({ trackId: track.id, start: gap.start });
                        onSelect([]);
                      }}
                    />
                  );
                })}
                {clips
                  .filter((c) => c.trackId === track.id)
                  .map((clip) => {
                    const original = project.clips.find(
                      (c) => c.id === clip.id,
                    )!;
                    const asset = project.assets.find(
                      (a) => a.id === clip.assetId,
                    );
                    const selected = selectedIds.includes(clip.id);
                    const dragging =
                      gesture?.kind === "move" && gesture.ids.includes(clip.id);
                    return (
                      <div
                        key={clip.id}
                        data-clip-id={clip.id}
                        className={`tl-clip tl-clip-${track.kind} ${selected ? "is-selected" : ""} ${dragging ? "is-dragging is-drag-source-ghost" : ""} ${track.hidden ? "is-hidden" : ""} ${asset?.missing ? "is-missing" : ""} ${clip.isCompound ? "tl-clip-compound" : ""}`}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (clip.isCompound) {
                            enterCompoundClip(clip.id);
                          } else {
                            onSeek(clip.start);
                          }
                        }}
                        onDragOver={(e) => {
                          if (
                            e.dataTransfer.types.includes("application/x-gocut-effect") ||
                            e.dataTransfer.types.includes("application/x-reacut-effect") ||
                            e.dataTransfer.types.includes("application/x-gocut-motion") ||
                            e.dataTransfer.types.includes("application/x-reacut-motion")
                          ) {
                            if (!track.locked) {
                              e.preventDefault();
                              e.stopPropagation();
                              e.dataTransfer.dropEffect = "copy";
                            }
                          }
                        }}
                        onDrop={(e) => {
                          if (
                            e.dataTransfer.types.includes("application/x-gocut-effect") ||
                            e.dataTransfer.types.includes("application/x-reacut-effect")
                          ) {
                            e.preventDefault();
                            e.stopPropagation();
                            const raw = e.dataTransfer.getData("application/x-gocut-effect") || e.dataTransfer.getData("application/x-reacut-effect");
                            if (raw) {
                              try {
                                const adjustments = JSON.parse(raw);
                                props.onClipUpdate(clip.id, { adjustments: { ...clip.adjustments, ...adjustments } });
                              } catch {}
                            }
                            return;
                          }
                          if (
                            e.dataTransfer.types.includes("application/x-gocut-motion") ||
                            e.dataTransfer.types.includes("application/x-reacut-motion")
                          ) {
                            e.preventDefault();
                            e.stopPropagation();
                            const motionId = e.dataTransfer.getData("application/x-gocut-motion") || e.dataTransfer.getData("application/x-reacut-motion");
                            if (motionId) {
                              const patch = motionPatch(clip, motionId as MotionId, project);
                              props.onClipUpdate(clip.id, patch);
                            }
                            return;
                          }
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onSelect([clip.id]);
                          const canSeparate = track.kind === "video" && (asset?.hasAudio || asset?.kind === "audio") && !clip.linkId;
                          const canRecover = !!clip.linkId;
                          const items: ContextMenuItem[] = [
                            {
                              label: t("toolbar.split") || "Split",
                              icon: <Scissors size={14} />,
                              shortcut: "⌘B",
                              disabled: track.locked,
                              onClick: () => {
                                const clickTime = locate(e.clientX, e.clientY).x / pps;
                                splitAt(clip.id, clickTime);
                              },
                            },
                            {
                              label: t("shortcuts.copy") || "Copy",
                              icon: <Copy size={14} />,
                              shortcut: "⌘C",
                              onClick: () => useEditorStore.getState().copy(),
                            },
                            {
                              label: t("shortcuts.duplicate") || "Duplicate",
                              icon: <Copy size={14} />,
                              shortcut: "⌘D",
                              disabled: track.locked,
                              onClick: () => useEditorStore.getState().duplicate(),
                            },
                            { divider: true, label: "", onClick: () => {} },
                            ...(canSeparate ? [
                              {
                                label: "Pisahkan Audio",
                                icon: <AudioLines size={14} />,
                                disabled: track.locked,
                                onClick: () => separateAudio(clip.id),
                              },
                            ] : []),
                            ...(canRecover ? [
                              {
                                label: "Pulihkan Audio Asal",
                                icon: <Volume2 size={14} />,
                                disabled: track.locked,
                                onClick: () => recoverAudio(clip.id),
                              },
                            ] : []),
                            ...(clip.isCompound ? [
                              {
                                label: "Buka Klip Bersarang (Masuk Sub-Timeline)",
                                icon: <Layers size={14} />,
                                onClick: () => enterCompoundClip(clip.id),
                              },
                              {
                                label: "Pisahkan Klip Bersarang (Ungroup)",
                                icon: <Scissors size={14} />,
                                disabled: track.locked,
                                onClick: () => ungroupCompoundClip(clip.id),
                              },
                            ] : selectedIds.length >= 2 ? [
                              {
                                label: "Buat Klip Bersarang (Compound Clip)",
                                icon: <Layers size={14} />,
                                disabled: track.locked,
                                onClick: () => useEditorStore.getState().createCompoundClip(selectedIds),
                              },
                            ] : []),
                            { divider: true, label: "", onClick: () => {} },
                            {
                              label: "Pindah ke Trek Video Atas",
                              icon: <ArrowUp size={14} />,
                              disabled: track.locked,
                              onClick: () => moveClipVertically(clip, "up"),
                            },
                            {
                              label: "Pindah ke Trek Video Bawah",
                              icon: <ArrowDown size={14} />,
                              disabled: track.locked,
                              onClick: () => moveClipVertically(clip, "down"),
                            },
                            {
                              label: "Pisahkan ke Trek Overlay Baru",
                              icon: <Layers size={14} />,
                              disabled: track.locked,
                              onClick: () => moveClipToNewTrack(clip),
                            },
                            { divider: true, label: "", onClick: () => {} },
                            {
                              label: clip.muted ? (t("timeline.unmute") || "Unmute") : (t("timeline.mute") || "Mute"),
                              icon: clip.muted ? <Volume2 size={14} /> : <VolumeX size={14} />,
                              disabled: track.locked,
                              onClick: () => props.onClipUpdate(clip.id, { muted: !clip.muted }),
                            },
                            {
                              label: t("toolbar.rippleDelete") || "Ripple Delete",
                              shortcut: "Del",
                              danger: true,
                              disabled: track.locked,
                              onClick: () => {
                                const p = useEditorStore.getState().project;
                                const dur = clip.duration;
                                const nextClips = p.clips
                                  .filter((c) => c.id !== clip.id)
                                  .map((c) => c.trackId === clip.trackId && c.start > clip.start ? { ...c, start: c.start - dur } : c);
                                useEditorStore.getState().commit({ ...p, clips: nextClips });
                              },
                            },
                            {
                              label: t("toolbar.delete") || "Delete",
                              icon: <Trash2 size={14} />,
                              shortcut: "Backspace",
                              danger: true,
                              disabled: track.locked,
                              onClick: () => props.onDelete(),
                            },
                            { divider: true, label: "", onClick: () => {} },
                            clip.isCompound
                              ? {
                                  label: t("timeline.ungroupCompound") || "Ungroup Compound Clip",
                                  icon: <Layers size={14} />,
                                  disabled: track.locked,
                                  onClick: () => useEditorStore.getState().ungroupCompoundClip(clip.id),
                                }
                              : {
                                  label: t("timeline.createCompound") || "Create Compound Clip",
                                  icon: <Layers size={14} />,
                                  disabled: track.locked,
                                  onClick: () => {
                                    const ids = selectedIds.includes(clip.id) ? selectedIds : [clip.id];
                                    useEditorStore.getState().createCompoundClip(ids);
                                  },
                                },
                          ];
                          setContextMenu({ x: e.clientX, y: e.clientY, items });
                        }}
                        style={{
                          left: clip.start * pps,
                          width: Math.max(4, clip.duration * pps),
                          top:
                            8 +
                            (trackLayouts[index].lanes.get(clip.id) ?? 0) * 62,
                        }}
                        onPointerDown={(event) => startClip(event, original)}
                        title={`${clip.name}\n${formatTimelineTime(clip.start, project.fps)} · ${clip.duration.toFixed(2)}s${track.locked ? `\n${t("timeline.trackLocked")}` : ""}`}
                        tabIndex={0}
                        role="button"
                        aria-label={`${clip.name}, ${clip.duration.toFixed(1)}s`}
                        aria-pressed={selected}
                        aria-disabled={track.locked}
                        aria-keyshortcuts="Enter Alt+ArrowLeft Alt+ArrowRight"
                        onKeyDown={(event) => {
                          if (
                            event.target !== event.currentTarget ||
                            track.locked
                          )
                            return;
                          if (event.key === "Enter") {
                            event.preventDefault();
                            event.stopPropagation();
                            onSelect(
                              event.shiftKey || event.metaKey || event.ctrlKey
                                ? [...new Set([...selectedIds, clip.id])]
                                : [clip.id],
                            );
                          }
                          if (
                            event.altKey &&
                            ["ArrowLeft", "ArrowRight"].includes(event.key)
                          ) {
                            event.preventDefault();
                            event.stopPropagation();
                            const ids = selected ? selectedIds : [clip.id];
                            onSelect(ids);
                            props.onMoveClips(
                              ids,
                              ((event.key === "ArrowLeft" ? -1 : 1) *
                                (event.shiftKey ? 10 : 1)) /
                                project.fps,
                            );
                          }
                          if (
                            (event.ctrlKey || event.metaKey) &&
                            (event.key === "[" || event.key === "]")
                          ) {
                            event.preventDefault();
                            event.stopPropagation();
                            useEditorStore
                              .getState()
                              .swapClipWithAdjacent(
                                clip.id,
                                event.key === "[" ? "prev" : "next",
                              );
                          }
                        }}
                      >
                        {asset?.thumbnail && track.kind !== "audio" && (
                          <div
                            className="tl-filmstrip"
                            style={{
                              backgroundImage: `url("${asset.thumbnail.replace(/"/g, "%22")}")`,
                            }}
                          />
                        )}
                        <div className="tl-clip-title">
                          {track.kind === "audio" ? (
                            <AudioLines size={12} />
                          ) : track.kind === "text" ? (
                            <Type size={12} />
                          ) : (
                            <Film size={12} />
                          )}
                          {clip.linkId && <Link2 size={12} aria-label={t("timeline.linkVideoAudio")} />}
                          <span>{clip.name}</span>
                          {clip.isCompound && <span className="tl-compound-badge">Compound</span>}
                          {clip.speed !== 1 && <b>{clip.speed}×</b>}
                          {(clip.muted || track.muted) && <VolumeX size={12} />}
                        </div>
                        {track.kind === "text" && (
                          <div className="tl-text-preview">
                            {clip.text?.text ?? clip.name}
                          </div>
                        )}
                        {asset?.waveform &&
                          (track.kind === "audio" ||
                            (asset.hasAudio && clip.duration * pps > 80)) && (
                            <div className="tl-waveform" aria-hidden="true">
                              {waveformSamples(
                                clip,
                                asset.waveform,
                                Math.min(
                                  180,
                                  Math.max(
                                    4,
                                    Math.floor((clip.duration * pps) / 3),
                                  ),
                                ),
                                asset.duration,
                              ).map((value, i) => (
                                <i
                                  key={i}
                                  style={{
                                    height: `${Math.max(3, Math.min(100, value * 100))}%`,
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        {clip.fadeIn > 0 && (
                          <div
                            className="tl-fade-in"
                            style={{
                              width: Math.min(
                                (clip.duration * pps) / 2,
                                clip.fadeIn * pps,
                              ),
                            }}
                          />
                        )}
                        {clip.fadeOut > 0 && (
                          <div
                            className="tl-fade-out"
                            style={{
                              width: Math.min(
                                (clip.duration * pps) / 2,
                                clip.fadeOut * pps,
                              ),
                            }}
                          />
                        )}
                        {!track.locked && (
                          <>
                            <div
                              className="tl-trim tl-trim-start"
                              title={t("timeline.trimInHint")}
                              role="slider"
                              tabIndex={selected ? 0 : -1}
                              aria-label={`${clip.name} ${t("timeline.inPoint")}`}
                              aria-valuenow={clip.start}
                              aria-valuetext={formatTimelineTime(
                                clip.start,
                                project.fps,
                              )}
                              aria-valuemin={0}
                              aria-valuemax={
                                clip.start + clip.duration - 1 / project.fps
                              }
                              onKeyDown={(event) => {
                                if (
                                  ["ArrowLeft", "ArrowRight"].includes(
                                    event.key,
                                  )
                                ) {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  props.onTrim(
                                    clip.id,
                                    "start",
                                    clip.start +
                                      (event.key === "ArrowLeft" ? -1 : 1) *
                                        (event.shiftKey ? 1 : 1 / project.fps),
                                  );
                                }
                              }}
                              onPointerDown={(event) =>
                                startClip(event, original, "start")
                              }
                            />
                            <div
                              className="tl-trim tl-trim-end"
                              title={t("timeline.trimOutHint")}
                              role="slider"
                              tabIndex={selected ? 0 : -1}
                              aria-label={`${clip.name} ${t("timeline.outPoint")}`}
                              aria-valuenow={clip.start + clip.duration}
                              aria-valuetext={formatTimelineTime(
                                clip.start + clip.duration,
                                project.fps,
                              )}
                              aria-valuemin={clip.start + 1 / project.fps}
                              onKeyDown={(event) => {
                                if (
                                  ["ArrowLeft", "ArrowRight"].includes(
                                    event.key,
                                  )
                                ) {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  props.onTrim(
                                    clip.id,
                                    "end",
                                    clip.start +
                                      clip.duration +
                                      (event.key === "ArrowLeft" ? -1 : 1) *
                                        (event.shiftKey ? 1 : 1 / project.fps),
                                  );
                                }
                              }}
                              onPointerDown={(event) =>
                                startClip(event, original, "end")
                              }
                            />
                          </>
                        )}
                      </div>
                    );
                  })}
                {dropTarget?.trackId === track.id && (
                  <div
                    className="tl-drop-marker"
                    style={{ left: dropTarget.time * pps }}
                  >
                    <Plus size={12} /> {t("timeline.addMedia")}
                  </div>
                )}
                {track.locked && (
                  <span className="tl-lock-overlay">
                    <LockKeyhole size={12} /> {t("timeline.trackLocked")}
                  </span>
                )}
              </div>
            </div>
          ))}
          <div className="tl-track-add">
            <div className="tl-track-add-menu">
              <button
                onClick={() => setTrackMenu(!trackMenu)}
                aria-expanded={trackMenu}
              >
                <Plus size={13} /> {t("timeline.addTrack")} <ChevronDown size={11} />
              </button>
              {trackMenu && (
                <div className="tl-popup">
                  {(["video", "audio", "text"] as TrackKind[]).map((kind) => (
                    <button
                      key={kind}
                      onClick={() => {
                        props.onAddTrack(kind);
                        setTrackMenu(false);
                      }}
                    >
                      <TrackIcon kind={kind} />
                      {kind === "video" ? t("timeline.videoTrack") : kind === "audio" ? t("timeline.audioTrack") : t("timeline.textTrack")}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {project.clips.length === 0 && (
              <span className="tl-empty-hint">
                <Film size={16} /> {t("timeline.empty")}
              </span>
            )}
          </div>
        </div>
        <div
          className="tl-playhead"
          style={{
            left: GUTTER + playhead * pps,
            top: RULER,
            height: Math.max(availableHeight, tracksHeight + tracksOffsetY + ADD_TRACK_HEIGHT),
          }}
        >
          <div className="tl-playhead-hitbox" onPointerDown={scrub} />
          <i />
        </div>
        {snapLine !== null && (
          <div
            className="tl-snap-line"
            style={{
              left: GUTTER + snapLine * pps,
              top: RULER,
              height: Math.max(availableHeight, tracksHeight + tracksOffsetY + ADD_TRACK_HEIGHT),
            }}
          />
        )}
          {gesture?.kind === "marquee" && (
            <div
              className="tl-marquee"
              style={{
                left: GUTTER + gesture.x,
                top: RULER + gesture.y,
                width: gesture.width,
                height: gesture.height,
              }}
            />
          )}
        </div>
      </div>
      {trackActions && actionTrack && (
        <div
          ref={actionsMenuRef}
          className="tl-track-action-menu"
          role="menu"
          aria-label={`${actionTrack.name} ${t("timeline.trackActionsMenu")}`}
          style={{ left: trackActions.x, top: trackActions.y }}
          onKeyDown={(event) => {
            if (
              ["ArrowUp", "ArrowDown", "Home", "End", "Escape"].includes(
                event.key,
              )
            ) {
              event.preventDefault();
              event.stopPropagation();
              if (event.key === "Escape") {
                document
                  .querySelector<HTMLButtonElement>(
                    `[data-track-id="${CSS.escape(actionTrack.id)}"] .tl-track-more`,
                  )
                  ?.focus();
                setTrackActions(null);
                return;
              }
              const buttons = Array.from(
                actionsMenuRef.current?.querySelectorAll<HTMLButtonElement>(
                  "button:not([disabled])",
                ) ?? [],
              );
              const index = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              buttons[
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? buttons.length - 1
                    : (index +
                        (event.key === "ArrowUp" ? -1 : 1) +
                        buttons.length) %
                      buttons.length
              ]?.focus();
            }
          }}
        >
          <button
            role="menuitem"
            disabled={actionTrack.locked}
            onClick={() => beginRename(actionTrack)}
          >
            <Pencil size={12} />
            {t("timeline.renameTrack")}
          </button>
          <button
            role="menuitem"
            disabled={
              actionTrack.locked ||
              actionIndex <= 0 ||
              project.tracks[actionIndex - 1]?.locked ||
              !props.onTrackMove
            }
            onClick={() => {
              props.onTrackMove?.(actionTrack.id, "up");
              setTrackActions(null);
            }}
          >
            <ArrowUp size={12} />
            {t("timeline.moveTrackUp")}
          </button>
          <button
            role="menuitem"
            disabled={
              actionTrack.locked ||
              actionIndex >= project.tracks.length - 1 ||
              project.tracks[actionIndex + 1]?.locked ||
              !props.onTrackMove
            }
            onClick={() => {
              props.onTrackMove?.(actionTrack.id, "down");
              setTrackActions(null);
            }}
          >
            <ArrowDown size={12} />
            {t("timeline.moveTrackDown")}
          </button>
          <div className="tl-menu-divider" />
          <button
            role="menuitem"
            className="is-danger"
            disabled={actionTrack.locked || !props.onTrackDelete}
            onClick={() => requestTrackDelete(actionTrack)}
          >
            <Trash2 size={12} />
            {t("timeline.deleteTrack")}
          </button>
        </div>
      )}
      {deletionTrack && (
        <div
          className="tl-confirm-backdrop"
          role="presentation"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setDeleteTrackId(null);
          }}
        >
          <section
            ref={confirmRef}
            className="tl-confirm"
            role="dialog"
            aria-modal="true"
            aria-label={t("timeline.deleteTrackConfirmAria")}
          >
            <h3>{t("timeline.deleteTrackConfirmTitle", { name: deletionTrack.name })}</h3>
            <p>{t("timeline.deleteTrackConfirmDesc", { count: deletionCount })}</p>
            <footer>
              <button autoFocus onClick={() => setDeleteTrackId(null)}>
                {t("dialog.cancel")}
              </button>
              <button
                className="is-danger"
                disabled={deletionTrack.locked}
                onClick={() => {
                  props.onTrackDelete?.(deletionTrack.id);
                  setDeleteTrackId(null);
                }}
              >
                {t("timeline.deleteTrackAndClips")}
              </button>
            </footer>
          </section>
        </div>
      )}
      <div className="tl-status">
        <span>
          {gesture?.kind === "move"
            ? t("timeline.movingClips", { count: gesture.ids.length, delta: (gesture.delta > 0 ? "+" : "") + gesture.delta.toFixed(2) })
            : gesture?.kind === "trim"
              ? t("timeline.trimmingClip", { edge: gesture.edge === "start" ? t("timeline.inPoint") : t("timeline.outPoint"), time: formatTimelineTime(gesture.time, project.fps) })
              : selectedIds.length
                ? t("timeline.clipsSelected", { count: selectedIds.length })
                : t("timeline.statusHint")}
        </span>
        <span>
          {t("timeline.tracksAndClips", { tracks: project.tracks.length, clips: project.clips.length })}{" "}
          <i>·</i> {snapping ? t("timeline.snappingActive") : t("timeline.snappingInactive")}
        </span>
      </div>
      {contextMenu && (
        <TimelineContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
      {gesture?.kind === "move" &&
        gesture.pointerX !== undefined &&
        gesture.pointerY !== undefined && (() => {
          const primaryClip = project.clips.find((c) => c.id === gesture.primaryId);
          const primaryTrack = primaryClip ? project.tracks.find((t) => t.id === primaryClip.trackId) : undefined;
          const primaryAsset = primaryClip ? project.assets.find((a) => a.id === primaryClip.assetId) : undefined;
          const clipKind = primaryTrack?.kind ?? (primaryAsset?.kind === "audio" ? "audio" : primaryClip?.text ? "text" : "video");

          return (
            <div
              className={`tl-floating-drag-item tl-floating-drag-${clipKind} ${primaryAsset?.thumbnail ? "has-thumb" : ""}`}
              style={{
                left: gesture.pointerX,
                top: gesture.pointerY,
              }}
            >
              {primaryAsset?.thumbnail && clipKind !== "audio" ? (
                <div className="tl-floating-drag-thumb-wrapper">
                  <img
                    src={primaryAsset.thumbnail}
                    alt=""
                    className="tl-floating-drag-thumb"
                  />
                  <div className="tl-floating-drag-badge">
                    <Film size={10} />
                  </div>
                </div>
              ) : (
                <div className={`tl-floating-drag-icon tl-floating-drag-icon-${clipKind}`}>
                  {clipKind === "audio" ? (
                    <AudioLines size={14} />
                  ) : clipKind === "text" ? (
                    <Type size={14} />
                  ) : (
                    <Film size={14} />
                  )}
                </div>
              )}
              <div className="tl-floating-drag-info">
                <div className="tl-floating-drag-title-row">
                  {primaryClip?.linkId && (
                    <Link2 size={11} className="tl-floating-drag-link" />
                  )}
                  <span className="tl-floating-drag-name">
                    {primaryClip?.name ?? "Clip"}
                  </span>
                  {gesture.ids.length > 1 && (
                    <span className="tl-floating-drag-count">
                      +{gesture.ids.length - 1}
                    </span>
                  )}
                </div>
                <span className="tl-floating-drag-duration">
                  {formatTimelineTime(
                    primaryClip?.duration ?? 0,
                    project.fps,
                  )}
                </span>
              </div>
            </div>
          );
        })()}
    </section>
  );
}
