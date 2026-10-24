import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AudioLines, Brackets, ChevronLeft, ChevronRight, CircleAlert, Pause, Play, Plus, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import type { PlacementMode } from "../core/timelineEdits";
import type { MediaAsset, Track } from "../core/types";
import { formatTime } from "../core/model";
import "./SourcePreview.css";
import { useTranslation } from "../i18n";

export interface SourcePreviewProps {
  asset: MediaAsset;
  fps: number;
  onClose: () => void;
  tracks?: Track[];
  onAddRange: (sourceIn: number, duration: number, mode?: PlacementMode, trackId?: string) => void;
}
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** A new asset owns a fresh media element and range, so delayed media events cannot affect another source. */
export default function SourcePreview(props: SourcePreviewProps) {
  return <SourcePreviewSession key={`${props.asset.id}:${props.asset.url}:${props.asset.previewUrl ?? ""}`} {...props} />;
}
function SourcePreviewSession({ asset, fps, onClose, onAddRange, tracks }: SourcePreviewProps) {
  const { t } = useTranslation();
  const media = useRef<HTMLMediaElement | null>(null);
  const panel = useRef<HTMLElement>(null);
  const alive = useRef(true);
  const image = asset.kind === "image";
  const frameRate = Number.isFinite(fps) && fps > 0 ? fps : 30;
  const frame = 1 / frameRate;
  const knownDuration = Number.isFinite(asset.duration) && asset.duration > 0 ? asset.duration : 0;
  const [duration, setDuration] = useState(image ? knownDuration || 5 : knownDuration);
  const [sourceIn, setSourceIn] = useState(0);
  const [sourceOut, setSourceOut] = useState(image ? knownDuration || 5 : knownDuration);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<PlacementMode>("insert");
  const [trackId, setTrackId] = useState(tracks?.find(t => !t.locked)?.id ?? "");
  const outRef = useRef(sourceOut);
  outRef.current = sourceOut;
  const sourceUrl = asset.previewUrl || asset.url;
  const minLength = Math.min(frame, duration);
  const unavailable = !!asset.missing || !!error || !ready || (!image && duration < frame - 1e-8);
  const quantize = (value: number) => Math.round(value * frameRate) / frameRate;

  useEffect(() => {
    alive.current = true;
    const element = media.current;
    // React development StrictMode may replay effects while retaining the element.
    if (element && !element.getAttribute("src")) { element.setAttribute("src", sourceUrl);element.load(); }
    return () => {
      alive.current = false;
      if (element) {
        element.pause();
        element.removeAttribute("src");
        element.load();
      }
    };
  }, []);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const element = media.current;
      if (!element || !alive.current) return;
      if (element.currentTime >= outRef.current) {
        element.pause();
        element.currentTime = outRef.current;
        setTime(outRef.current);
        setPlaying(false);
        return;
      }
      setTime(element.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  const pause = () => { media.current?.pause(); setPlaying(false); };
  const seek = (value: number) => {
    if (!Number.isFinite(value)) return;
    const next = clamp(quantize(value), 0, duration);
    pause();
    if (media.current && ready) media.current.currentTime = next;
    setTime(next);
  };
  const setIn = (value: number) => {
    if (!Number.isFinite(value)) return;
    const next = clamp(quantize(value), 0, Math.max(0, sourceOut - minLength));
    setSourceIn(next);seek(next);
  };
  const setOut = (value: number) => {
    if (!Number.isFinite(value)) return;
    const next = clamp(quantize(value), sourceIn + minLength, duration);
    setSourceOut(next);seek(next);
  };
  const playPause = async () => {
    const element = media.current;
    if (!element || unavailable) return;
    if (!element.paused) { pause(); return; }
    if (element.currentTime < sourceIn || element.currentTime >= sourceOut - 1e-6) {
      element.currentTime = sourceIn;setTime(sourceIn);
    }
    try { await element.play(); }
    catch (reason) {
      if (alive.current && !(reason instanceof DOMException && reason.name === "AbortError")) {
        setError(t("player.previewErrorDismiss"));
      }
    }
  };
  const metadata = () => {
    const value = media.current?.duration ?? 0;
    if (!Number.isFinite(value) || value <= 0) { setError(t("player.previewErrorDismiss")); return; }
    const end = knownDuration > 0 ? Math.min(knownDuration, value) : value;
    setDuration(end);setSourceOut(end);setReady(true);
  };
  const mediaError = () => {
    if (!alive.current) return;
    setPlaying(false);setReady(false);
    setError(t("player.previewErrorDismiss"));
  };
  const keyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable=true]") || event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === " " && target.closest("button")) { event.stopPropagation();return; }
    if (key === "escape") { event.preventDefault();event.stopPropagation();pause();onClose();return; }
    if (image || unavailable || !["i", "o", " ", "arrowleft", "arrowright"].includes(key)) return;
    event.preventDefault();event.stopPropagation();
    if (key === "i") setIn(media.current?.currentTime ?? time);
    else if (key === "o") setOut(media.current?.currentTime ?? time);
    else if (key === " ") { if (!event.repeat) void playPause(); }
    else seek(time + (key === "arrowleft" ? -frame : frame));
  };
  const add = () => {
    if (unavailable) return;
    pause();
    onAddRange(image ? 0 : sourceIn, image ? duration : sourceOut - sourceIn, mode, trackId || undefined);
  };
  return (
    <section ref={panel} className="source-preview player-panel panel" aria-label={t("sourcePreview.title")} tabIndex={0} onKeyDown={keyDown}
      onPointerDown={event => { if (!(event.target as HTMLElement).closest("button, input, select")) panel.current?.focus({ preventScroll: true }); }}>
      <header className="panel-heading source-heading">
        <div><span>{t("sourcePreview.title")}</span><strong title={asset.name}>{asset.name}</strong></div>
        <button aria-label={t("sourcePreview.backToTimeline")} title={t("sourcePreview.backToTimeline")} onClick={() => { pause();onClose(); }}><X size={16} /></button>
      </header>
      <div className="source-stage">
        {asset.missing || error ? <div className="source-message source-error" role="alert"><CircleAlert size={26} /><strong>{asset.missing ? t("sourcePreview.fileMissing") : t("sourcePreview.unavailable")}</strong><p>{asset.missing ? t("sourcePreview.relinkHint") : error}</p></div> : image ?
          <img src={sourceUrl} alt={asset.name} onLoad={() => setReady(true)} onError={mediaError} /> : asset.kind === "video" ?
          <video ref={element => { media.current = element; }} src={sourceUrl} preload="auto" playsInline muted={muted} onLoadedMetadata={metadata} onError={mediaError} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false);setTime(duration); }} /> :
          <><audio ref={element => { media.current = element; }} src={sourceUrl} preload="auto" muted={muted} onLoadedMetadata={metadata} onError={mediaError} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false);setTime(duration); }} />
            <div className="source-audio"><AudioLines size={38} /><strong>{asset.name}</strong><div className="source-waveform" aria-hidden="true">{Array.from({length: 80}, (_, i) => <i key={i} style={{height: `${10 + clamp(asset.waveform?.[Math.floor(i / 80 * asset.waveform.length)] ?? .25, 0, 1) * 85}%`}} />)}</div></div></>}
        {!asset.missing && !error && !ready && <div className="source-loading">{t("sourcePreview.loading")}</div>}
      </div>
      {!image && <>
        <div className="source-seek">
          <div className="source-range-highlight" aria-hidden="true" style={{left: `${duration > 0 ? sourceIn / duration * 100 : 0}%`,width: `${duration > 0 ? (sourceOut-sourceIn)/duration*100 : 100}%`}} />
          <input aria-label={t("sourcePreview.seekProgress")} type="range" min={0} max={duration || 1} step={frame} value={time} disabled={unavailable} onChange={event => seek(Number(event.target.value))} />
        </div>
        <div className="source-controls">
          <span className="timecode"><strong>{formatTime(time,frameRate)}</strong><span> / {formatTime(duration,frameRate)}</span></span>
          <div className="source-transport"><button aria-label={t("player.prevFrame")} disabled={unavailable} onClick={() => seek(time-frame)}><ChevronLeft size={16} /></button><button aria-label={playing ? t("player.pause") : t("player.play")} disabled={unavailable} onClick={() => void playPause()}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button><button aria-label={t("player.nextFrame")} disabled={unavailable} onClick={() => seek(time+frame)}><ChevronRight size={16} /></button></div>
          <button aria-label={muted ? t("timeline.unmute") : t("timeline.mute")} onClick={() => setMuted(!muted)} disabled={unavailable}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
        </div>
      </>}
      <footer className="source-range">
        {!image && <div className="source-marks">
          <label><button title={t("sourcePreview.setIn")} aria-label={t("sourcePreview.setIn")} disabled={unavailable} onClick={() => setIn(time)}>{t("sourcePreview.inPoint")} <kbd>I</kbd></button><input aria-label={t("sourcePreview.inPoint")} type="number" min={0} max={Math.max(0,sourceOut-minLength)} step={frame} value={Number(sourceIn.toFixed(6))} disabled={unavailable} onChange={event => {if(event.target.value !== "") setIn(Number(event.target.value));}} /><span>s</span></label>
          <label><button title={t("sourcePreview.setOut")} aria-label={t("sourcePreview.setOut")} disabled={unavailable} onClick={() => setOut(time)}>{t("sourcePreview.outPoint")} <kbd>O</kbd></button><input aria-label={t("sourcePreview.outPoint")} type="number" min={sourceIn+minLength} max={duration} step={frame} value={Number(sourceOut.toFixed(6))} disabled={unavailable} onChange={event => {if(event.target.value !== "") setOut(Number(event.target.value));}} /><span>s</span></label>
          <button title={t("sourcePreview.resetRange")} aria-label={t("sourcePreview.resetRange")} disabled={unavailable} onClick={() => {setSourceIn(0);setSourceOut(duration);seek(0);}}><RotateCcw size={14} /></button>
        </div>}
        {tracks && <div className="source-placement">
          <label>{t("sourcePreview.placementMode")}<select aria-label={t("sourcePreview.placementMode")} value={mode} onChange={e => setMode(e.target.value as PlacementMode)}><option value="insert">{t("sourcePreview.insert")}</option><option value="overwrite">{t("sourcePreview.overwrite")}</option><option value="overlay">{t("sourcePreview.overlay")}</option></select></label>
          <label>{t("sourcePreview.targetTrack")}<select aria-label={t("sourcePreview.targetTrack")} value={trackId} onChange={e => setTrackId(e.target.value)}><option value="">{t("sourcePreview.autoTrack")}</option>{tracks.map(trk => <option key={trk.id} value={trk.id} disabled={trk.locked}>{trk.name}{trk.locked ? ` · ${t("timeline.trackLocked")}` : ""}</option>)}</select></label>
        </div>}
        <div className="source-add-row"><span>{image ? `${asset.width} × ${asset.height} · ${t("nav.media")}` : <><Brackets size={12} /> {t("sourcePreview.selectedSpan", { time: formatTime(Math.max(0, sourceOut-sourceIn), frameRate) })}</>}</span><button className="primary" disabled={unavailable} onClick={add}><Plus size={14} />{image ? t("sourcePreview.addImage") : t("sourcePreview.addClip")}</button></div>
        {!image && <p className="source-tip">{tracks ? (mode === "insert" ? t("sourcePreview.insertTip") : mode === "overwrite" ? t("sourcePreview.overwriteTip") : t("sourcePreview.overlayTip")) : t("sourcePreview.shortcutTip")}</p>}
        {!image && ready && duration < frame - 1e-8 && <p className="source-error">{t("sourcePreview.tooShort")}</p>}
      </footer>
    </section>
  );
}
