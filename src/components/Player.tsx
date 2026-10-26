import { useEffect, useRef, useState } from "react";
import {
  Grid,
  Maximize,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  ZoomIn,
} from "lucide-react";
import CanvasTransformGizmo from "./CanvasTransformGizmo";
import SafeZoneOverlay, { type SafeZoneMode } from "./SafeZoneOverlay";
import AudioVuMeter from "./AudioVuMeter";
import type { Clip, MediaAsset, Project } from "../core/types";
import {
  evaluateKeyframes,
  evaluateFade,
  formatTime,
  projectDuration,
} from "../core/model";
import {
  imagePreviewLayer,
  textPreviewLayer,
  clearPreviewLayers,
} from "../editor/previewLayers";
import { useEditorStore } from "../editor/store";
import { useTranslation } from "../i18n";
interface PlayerProps {
  project: Project;
  selectedIds: string[];
  playhead?: number;
  playing?: boolean;
  onSelect: (ids: string[]) => void;
  onUpdateClip: (id: string, patch: Partial<Clip>) => void;
  onSeek: (time: number) => void;
  onPlayingChange: (playing: boolean) => void;
}
interface Source {
  element: HTMLVideoElement | HTMLAudioElement | HTMLImageElement;
  url: string;
  gain?: GainNode;
  decodedTime?: number;
  frameCallback?: number;
}
export default function Player(props: PlayerProps) {
  const { t } = useTranslation();
  const storePlayhead = useEditorStore((s) => s.playhead);
  const storePlaying = useEditorStore((s) => s.playing);
  const updateProject = useEditorStore((s) => s.updateProject);
  const playhead = props.playhead ?? storePlayhead;
  const playing = props.playing ?? storePlaying;
  const {
    project,
    selectedIds,
    onSeek,
    onPlayingChange,
    onSelect,
    onUpdateClip,
  } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null),
    hostRef = useRef<HTMLDivElement>(null);
  const sources = useRef(new Map<string, Source>()),
    audioContext = useRef<AudioContext | null>(null),
    masterGainRef = useRef<GainNode | null>(null),
    analyserRef = useRef<AnalyserNode | null>(null);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [safeZoneMode, setSafeZoneMode] = useState<SafeZoneMode>("none");
  const current = useRef({ project, playhead, playing });
  current.current = { project, playhead, playing };
  const [muted, setMuted] = useState(false),
    [errors, setErrors] = useState<string[]>([]),
    [viewScale, setViewScale] = useState(1),
    [size, setSize] = useState({ w: 720, h: 405 });
  const localMuted = useRef(muted);
  localMuted.current = muted;
  const duration = projectDuration(project);
  const drag = useRef<{
    x: number;
    y: number;
    dx: number;
    dy: number;
    clip: Clip;
  } | null>(null);
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setSize({
        w: Math.max(1, rect.width - 48),
        h: Math.max(1, rect.height - 48),
      });
    });
    if (hostRef.current) observer.observe(hostRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const desired = new Set<string>();
    const allClips: Clip[] = [];
    for (const c of project.clips) {
      allClips.push(c);
      if (c.isCompound && c.nestedClips) {
        allClips.push(...c.nestedClips);
      }
    }
    clearPreviewLayers(new Set(allClips.map((c) => c.id)));
    for (const clip of allClips) {
      const asset = project.assets.find((a) => a.id === clip.assetId);
      if (!asset || asset.missing) continue;
      desired.add(clip.id);
      const url = asset.previewUrl ?? asset.url,
        existing = sources.current.get(clip.id);
      if (existing?.url === url) continue;
      if (existing && existing.element instanceof HTMLMediaElement) {
        if (
          existing.element instanceof HTMLVideoElement &&
          existing.frameCallback !== undefined
        )
          existing.element.cancelVideoFrameCallback(existing.frameCallback);
        existing.element.pause();
        existing.element.removeAttribute("src");
        existing.element.load();
        existing.gain?.disconnect();
      }
      const element =
        asset.kind === "image"
          ? new Image()
          : document.createElement(asset.kind === "audio" ? "audio" : "video");
      const source: Source = { element, url };
      if (element instanceof HTMLMediaElement) {
        element.preload = "auto";
        if (url.startsWith("http://") || url.startsWith("https://")) {
          element.crossOrigin = "anonymous";
        }
        if (element instanceof HTMLVideoElement) {
          element.playsInline = true;
          const video = element;
          const decoded: VideoFrameRequestCallback = (_, metadata) => {
            source.decodedTime = metadata.mediaTime;
            source.frameCallback = video.requestVideoFrameCallback(decoded);
          };
          source.frameCallback = video.requestVideoFrameCallback(decoded);
          video.addEventListener("canplay", () => {
            if (!current.current.playing) {
              renderFrame(current.current.playhead, false);
            }
          });
          video.addEventListener("seeked", () => {
            if (!current.current.playing) {
              renderFrame(current.current.playhead, false);
            }
          });
        }
      } else if (element instanceof HTMLImageElement) {
        if (url.startsWith("http://") || url.startsWith("https://")) {
          element.crossOrigin = "anonymous";
        }
        element.onload = () => {
          if (!current.current.playing) {
            renderFrame(current.current.playhead, false);
          }
        };
      }
      element.src = url;
      element.addEventListener(
        "error",
        () =>
          setErrors((previous) =>
            previous.includes(asset.name)
              ? previous
              : [...previous, asset.name],
          ),
        { once: true },
      );
      sources.current.set(clip.id, source);
    }
    for (const [clipId, source] of sources.current)
      if (!desired.has(clipId)) {
        if (source.element instanceof HTMLMediaElement) {
          if (
            source.element instanceof HTMLVideoElement &&
            source.frameCallback !== undefined
          )
            source.element.cancelVideoFrameCallback(source.frameCallback);
          source.element.pause();
          source.element.removeAttribute("src");
          source.element.load();
        }
        source.gain?.disconnect();
        sources.current.delete(clipId);
      }
  }, [project.assets, project.clips]);
  useEffect(
    () => () => {
      for (const source of sources.current.values()) {
        if (source.element instanceof HTMLMediaElement) {
          if (
            source.element instanceof HTMLVideoElement &&
            source.frameCallback !== undefined
          )
            source.element.cancelVideoFrameCallback(source.frameCallback);
          source.element.pause();
        }
        source.gain?.disconnect();
      }
      sources.current.clear();
      void audioContext.current?.close();
    },
    [],
  );
  const initializeAudio = () => {
    try {
      const context =
        audioContext.current ?? (audioContext.current = new AudioContext());
      void context.resume();

      if (!masterGainRef.current) {
        masterGainRef.current = context.createGain();
      }
      if (!analyserRef.current) {
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        masterGainRef.current.connect(analyser);
        analyser.connect(context.destination);
        analyserRef.current = analyser;
        setAnalyserNode(analyser);
      }

      for (const source of sources.current.values())
        if (source.element instanceof HTMLMediaElement && !source.gain) {
          const media = context.createMediaElementSource(source.element);
          source.gain = context.createGain();
          media.connect(source.gain);
          source.gain.connect(masterGainRef.current);
        }
    } catch {
      /* Media elements still provide ordinary volume. */
    }
  };
  const renderFrame = (time: number, isPlaying: boolean) => {
    const p = current.current.project,
      end = projectDuration(p);
    // Keep the final decoded frame visible when playback reaches the project end.
    const paintTime =
      end > 0 ? Math.min(time, Math.max(0, end - 1 / p.fps)) : time;
    const canvas = canvasRef.current,
      ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const factor = canvas.width / p.width;
    ctx.setTransform(factor, 0, 0, factor, 0, 0);
    ctx.globalAlpha = 1;
    ctx.filter = "none";
    ctx.fillStyle = p.background;
    ctx.fillRect(0, 0, p.width, p.height);
    const clips = [...p.tracks]
      .reverse()
      .flatMap((track) =>
        p.clips
          .filter((c) => c.trackId === track.id)
          .sort((a, b) => a.start - b.start),
      );
    for (const clip of clips) {
      const track = p.tracks.find((t) => t.id === clip.trackId)!;
      const active =
        paintTime >= clip.start && paintTime < clip.start + clip.duration;
      const source = sources.current.get(clip.id);
      const media = source?.element;
      const evaluated = evaluateKeyframes(
        clip,
        Math.max(0, paintTime - clip.start),
      );
      const local = Math.max(0, paintTime - clip.start);
      if (clip.isCompound && clip.nestedClips) {
        const localCompound = Math.max(0, paintTime - clip.start) * clip.speed + clip.sourceIn;
        for (const nc of clip.nestedClips) {
          const ncSource = sources.current.get(nc.id);
          const ncMedia = ncSource?.element;
          const ncActive = active && localCompound >= nc.start && localCompound < nc.start + nc.duration;
          if (ncMedia instanceof HTMLMediaElement) {
            if (!ncActive) {
              ncMedia.pause();
              if (ncSource?.gain) ncSource.gain.gain.value = 0;
            } else {
              if (isPlaying && !ncSource?.gain) initializeAudio();
              const ncLocal = Math.max(0, localCompound - nc.start);
              const ncTarget = nc.sourceIn + ncLocal * nc.speed + 0.000001;
              if (
                Number.isFinite(ncMedia.duration) &&
                Math.abs(ncMedia.currentTime - ncTarget) > (isPlaying ? 0.15 : 0.00001)
              ) {
                try {
                  ncMedia.currentTime = Math.min(ncTarget, ncMedia.duration);
                } catch {}
              }
              ncMedia.playbackRate = nc.speed * clip.speed;
              let gain = (track.muted || clip.muted || nc.muted || localMuted.current) ? 0 : (evaluated.volume * nc.volume);
              if (ncSource?.gain) {
                ncSource.gain.gain.value = gain;
                ncMedia.volume = 1;
              } else ncMedia.volume = Math.min(1, gain);
              if (isPlaying && ncMedia.paused) void ncMedia.play().catch(() => {});
              if (!isPlaying && !ncMedia.paused) ncMedia.pause();
            }
          }
        }
      }
      if (media instanceof HTMLMediaElement) {
        if (!active) {
          media.pause();
          if (source?.gain) source.gain.gain.value = 0;
          continue;
        }
        if (isPlaying && !source?.gain) initializeAudio();
        // Chromium seeks at microsecond precision. Nudge exact frame boundaries
        // inside the intended frame instead of rounding down to its predecessor.
        const target = clip.sourceIn + local * clip.speed + 0.000001;
        if (
          Number.isFinite(media.duration) &&
          Math.abs(media.currentTime - target) >
            (isPlaying ? 0.15 : 0.00001)
        ) {
          try {
            media.currentTime = Math.min(target, media.duration);
          } catch {
            /* Source metadata loading. */
          }
        }
        media.playbackRate = clip.speed;
        let gain =
          track.muted || clip.muted || localMuted.current
            ? 0
            : evaluated.volume;
        gain *= evaluateFade(clip, local, "audio");
        if (source?.gain) {
          source.gain.gain.value = gain;
          media.volume = 1;
        } else media.volume = Math.min(1, gain);
        if (isPlaying && media.paused) void media.play().catch(() => {});
        if (!isPlaying && !media.paused) media.pause();
      }
      if (!active || track.hidden || track.kind === "audio") continue;
      const alpha =
        evaluated.transform.opacity * evaluateFade(clip, local, "video");
      const movement =
        drag.current?.clip.id === clip.id ? drag.current : null;
      const tr = movement
        ? {
            ...evaluated.transform,
            x: evaluated.transform.x + movement.dx,
            y: evaluated.transform.y + movement.dy,
          }
        : evaluated.transform;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.translate(p.width / 2 + tr.x, p.height / 2 + tr.y);
      ctx.rotate((tr.rotation * Math.PI) / 180);
      ctx.scale(
        tr.scale * (tr.flipX ? -1 : 1),
        tr.scale * (tr.flipY ? -1 : 1),
      );
      const a = clip.adjustments;
      const filters: string[] = [];
      if (a.blur > 0) filters.push(`blur(${a.blur * factor}px)`);
      if (!clip.chromaKey?.enabled && !clip.mask && a.temperature === 0) {
        if (a.brightness !== 0) filters.push(`brightness(${Math.max(0, 1 + a.brightness)})`);
        if (a.contrast !== 1) filters.push(`contrast(${Math.max(0, a.contrast)})`);
        if (a.saturation !== 1) filters.push(`saturate(${Math.max(0, a.saturation)})`);
      }
      ctx.filter = filters.length > 0 ? filters.join(" ") : "none";
      if (clip.isCompound && clip.nestedClips) {
        const localCompound = Math.max(0, paintTime - clip.start) * clip.speed + clip.sourceIn;
        const activeNested = clip.nestedClips
          .filter((nc) => localCompound >= nc.start && localCompound < nc.start + nc.duration)
          .sort((a, b) => a.start - b.start);
        for (const nc of activeNested) {
          ctx.save();
          if (nc.transform) {
            ctx.translate(nc.transform.x, nc.transform.y);
            ctx.rotate((nc.transform.rotation * Math.PI) / 180);
            ctx.scale(
              nc.transform.scale * (nc.transform.flipX ? -1 : 1),
              nc.transform.scale * (nc.transform.flipY ? -1 : 1),
            );
            ctx.globalAlpha *= Math.max(0, Math.min(1, nc.transform.opacity));
          }
          if (nc.text) {
            const layer = textPreviewLayer(nc);
            ctx.drawImage(layer.canvas, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
          } else {
            const ncSource = sources.current.get(nc.id);
            const ncMedia = ncSource?.element;
            const asset = p.assets.find((a) => a.id === nc.assetId);
            if (asset && ncMedia) {
              try {
                if (!(
                  (ncMedia instanceof HTMLVideoElement && ncMedia.readyState < 2) ||
                  (ncMedia instanceof HTMLImageElement && !ncMedia.complete)
                )) {
                  const previewScale = Math.min(1, 1920 / asset.width, 1920 / asset.height);
                  const layer = imagePreviewLayer(
                    nc,
                    ncMedia as HTMLImageElement | HTMLVideoElement,
                    Math.max(1, Math.round(asset.width * previewScale)),
                    Math.max(1, Math.round(asset.height * previewScale)),
                    ncSource?.decodedTime,
                  );
                  const contain = Math.min(p.width / layer.width, p.height / layer.height);
                  const w = layer.width * contain, h = layer.height * contain;
                  ctx.drawImage(layer, -w / 2, -h / 2, w, h);
                }
              } catch {
                /* Source not ready */
              }
            }
          }
          ctx.restore();
        }
      } else if (clip.text) {
        const layer = textPreviewLayer(clip);
        ctx.drawImage(
          layer.canvas,
          -layer.width / 2,
          -layer.height / 2,
          layer.width,
          layer.height,
        );
      } else if (media) {
        const asset = p.assets.find((a) => a.id === clip.assetId)!;
        try {
          if (!(
            (media instanceof HTMLVideoElement && media.readyState < 2) ||
            (media instanceof HTMLImageElement && !media.complete)
          )) {
            const previewScale = Math.min(
              1,
              1920 / asset.width,
              1920 / asset.height,
            );
            const layer = imagePreviewLayer(
              clip,
              media as HTMLImageElement | HTMLVideoElement,
              Math.max(1, Math.round(asset.width * previewScale)),
              Math.max(1, Math.round(asset.height * previewScale)),
              source?.decodedTime,
            );
            const contain = Math.min(
              p.width / layer.width,
              p.height / layer.height,
            );
            const w = layer.width * contain,
              h = layer.height * contain;
            ctx.drawImage(layer, -w / 2, -h / 2, w, h);
          }
        } catch {
          /* Decoded source is not ready yet. */
        }
      }
      ctx.restore();
    }
  };

  useEffect(() => {
    if (!playing) {
      renderFrame(playhead, false);
      return;
    }
    let frame = 0,
      previous = performance.now();
    const paint = (now: number) => {
      const state = current.current;
      const elapsed = Math.min((now - previous) / 1000, 0.12);
      previous = now;
      let time = state.playhead + elapsed;
      const end = projectDuration(state.project);
      if (time >= end) {
        time = end;
        useEditorStore.setState({ playing: false, playhead: end });
        current.current = { ...state, playhead: end, playing: false };
        renderFrame(end, false);
        return;
      }
      useEditorStore.setState({ playhead: time });
      current.current = { ...state, playhead: time, playing: true };
      renderFrame(time, true);
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  useEffect(() => {
    if (!playing) {
      renderFrame(playhead, false);
    }
  }, [playing, playhead, project, size, viewScale]);
  const aspect = project.width / project.height,
    displayW = Math.min(size.w, size.h * aspect) * viewScale,
    displayH = displayW / aspect;
  return (
    <section className="player-panel panel" aria-label={t("player.title")}>
      <div className="panel-heading">
        <span>{t("player.title")}</span>
        <span className="muted small">
          {project.width} × {project.height} · {project.fps} fps
        </span>
      </div>
      <div className="player-stage" ref={hostRef}>
        <div className="player-stage-content">
          <div className="player-canvas-wrapper" style={{ width: displayW, height: displayH }}>
            <canvas
          ref={canvasRef}
          aria-label={t("player.preview")}
          width={Math.max(
            2,
            Math.round(Math.min(1920, displayW * devicePixelRatio)),
          )}
          height={Math.max(
            2,
            Math.round(Math.min(1920, displayW * devicePixelRatio) / aspect),
          )}
          style={{ width: displayW, height: displayH }}
          onPointerDown={(event) => {
            if (selectedIds.length !== 1 || event.button !== 0) return;
            const clip = project.clips.find((c) => c.id === selectedIds[0]);
            if (
              !clip ||
              clip.start > playhead ||
              playhead >= clip.start + clip.duration ||
              project.tracks.find((t) => t.id === clip.trackId)?.locked
            )
              return;
            onPlayingChange(false);
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              dx: 0,
              dy: 0,
              clip,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const d = drag.current;
            if (!d) return;
            const ratio = project.width / displayW;
            d.dx = (event.clientX - d.x) * ratio;
            d.dy = (event.clientY - d.y) * ratio;
            renderFrame(current.current.playhead, false);
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onPointerUp={(event) => {
            const d = drag.current;
            if (!d) return;
            drag.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
            const latest = current.current.project.clips.find(
              (c) => c.id === d.clip.id,
            );
            if (
              !latest ||
              current.current.project.tracks.find(
                (t) => t.id === latest.trackId,
              )?.locked
            )
              return;
            if (
              Math.abs(event.clientX - d.x) + Math.abs(event.clientY - d.y) >
              2
            )
              onUpdateClip(latest.id, {
                transform: {
                  ...latest.transform,
                  x: latest.transform.x + d.dx,
                  y: latest.transform.y + d.dy,
                },
                keyframes: latest.keyframes.map((key) =>
                  key.property === "x"
                    ? { ...key, value: key.value + d.dx }
                    : key.property === "y"
                      ? { ...key, value: key.value + d.dy }
                      : key,
                ),
              });
          }}
        />
        {safeZoneMode !== "none" && (
          <SafeZoneOverlay mode={safeZoneMode} width={displayW} height={displayH} />
        )}
        {selectedIds.length === 1 &&
          (() => {
            const clip = project.clips.find(
              (c) =>
                c.id === selectedIds[0] &&
                playhead >= c.start &&
                playhead < c.start + c.duration,
            );
            const trk = clip ? project.tracks.find((t) => t.id === clip.trackId) : null;
            if (!clip || !trk || trk.locked || trk.kind === "audio") return null;
            return (
              <CanvasTransformGizmo
                clip={clip}
                project={project}
                displayW={displayW}
                displayH={displayH}
                onUpdateClip={onUpdateClip}
                renderFrame={renderFrame}
                playhead={playhead}
              />
            );
          })()}
        </div>
        <AudioVuMeter analyser={analyserNode} playing={playing} />
      </div>
        {!project.clips.length && (
          <div className="player-empty" style={{ width: displayW, maxWidth: displayW, padding: "0 14px", boxSizing: "border-box" }}>
            <div className="preview-mark">
              <img src="./icons/gocut.png" width={Math.max(40, Math.min(68, Math.round(displayW * 0.28)))} height={Math.max(40, Math.min(68, Math.round(displayW * 0.28)))} alt="GoCut" />
            </div>
            <p>{t("player.emptyTitle")}</p>
            <span>{t("player.emptyDesc")}</span>
          </div>
        )}
        {selectedIds.length === 1 &&
          project.clips.some(
            (c) =>
              c.id === selectedIds[0] &&
              playhead >= c.start &&
              playhead < c.start + c.duration,
          ) && (
            <div className="player-selection-hint">
              {t("player.dragHint")}
            </div>
          )}
        {errors.length > 0 && (
          <button
            className="preview-error"
            onClick={() => setErrors([])}
            title={errors.join("、")}
          >
            {t("player.previewErrorDismiss")}
          </button>
        )}
      </div>
      <div className="player-controls">
        <div className="timecode">
          <strong>{formatTime(playhead, project.fps)}</strong>
          <span> / {formatTime(duration, project.fps)}</span>
        </div>
        <div className="transport">
          <button
            title={`${t("player.prevFrame")} ←`}
            onClick={() => onSeek(Math.max(0, playhead - 1 / project.fps))}
          >
            <SkipBack size={15} />
          </button>
          <button
            className="play-button"
            aria-label={playing ? t("player.pause") : t("player.play")}
            onClick={() => {
              initializeAudio();
              if (!playing && playhead >= duration) onSeek(0);
              onPlayingChange(!playing);
            }}
            disabled={!duration}
          >
            {playing ? (
              <Pause size={19} fill="currentColor" />
            ) : (
              <Play size={19} fill="currentColor" />
            )}
          </button>
          <button
            title={`${t("player.nextFrame")} →`}
            onClick={() =>
              onSeek(Math.min(duration, playhead + 1 / project.fps))
            }
          >
            <SkipForward size={15} />
          </button>
        </div>
        <div className="player-tools">
          <div className="player-safe-picker" title="Panduan Safe Zone (TikTok / Reels / 16:9)">
            <select
              value={safeZoneMode}
              onChange={(e) => setSafeZoneMode(e.target.value as SafeZoneMode)}
              aria-label="Safe Zone Guide"
            >
              <option value="none">Safe: Off</option>
              <option value="tiktok">TikTok</option>
              <option value="reels">Reels</option>
              <option value="16:9">16:9 TV</option>
            </select>
          </div>
          <div className="player-ratio-picker">
            <select
              aria-label="Aspect Ratio"
              value={
                project.width === 1080 && project.height === 1920 ? "9:16" :
                project.width === 1920 && project.height === 1080 ? "16:9" :
                project.width === 1080 && project.height === 1080 ? "1:1" :
                project.width === 1440 && project.height === 1080 ? "4:3" :
                project.width === 1080 && project.height === 1440 ? "3:4" : "custom"
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === "9:16") updateProject({ width: 1080, height: 1920 });
                else if (v === "16:9") updateProject({ width: 1920, height: 1080 });
                else if (v === "1:1") updateProject({ width: 1080, height: 1080 });
                else if (v === "4:3") updateProject({ width: 1440, height: 1080 });
                else if (v === "3:4") updateProject({ width: 1080, height: 1440 });
              }}
            >
              <option value="9:16">9:16</option>
              <option value="16:9">16:9</option>
              <option value="1:1">1:1</option>
              <option value="4:3">4:3</option>
              <option value="3:4">3:4</option>
              {!(
                (project.width === 1080 && project.height === 1920) ||
                (project.width === 1920 && project.height === 1080) ||
                (project.width === 1080 && project.height === 1080) ||
                (project.width === 1440 && project.height === 1080) ||
                (project.width === 1080 && project.height === 1440)
              ) && (
                <option value="custom">{project.width}:{project.height}</option>
              )}
            </select>
          </div>
          <button
            title={muted ? t("player.unmute") : t("player.mute")}
            onClick={() => setMuted(!muted)}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button
            title={t("player.zoom")}
            onClick={() => setViewScale(viewScale === 1 ? 1.5 : 1)}
          >
            <ZoomIn size={16} />
          </button>
          <button
            title={t("player.fullscreen")}
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void hostRef.current?.requestFullscreen();
            }}
          >
            <Maximize size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}
