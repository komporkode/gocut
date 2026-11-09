import KeyframeCurveEditor from "./KeyframeCurveEditor";
import { useEffect, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Diamond,
  Film,
  FlipHorizontal2,
  FlipVertical2,
  Image,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Type,
  Volume2,
  WandSparkles,
} from "lucide-react";
import type {
  BlendMode,
  BlurEffect,
  Clip,
  FilmGrainEffect,
  Keyframe,
  Project,
  StylizeEffect,
} from "../core/types";
import {
  DEFAULT_TRANSFORM,
  DEFAULT_ADJUSTMENTS,
  DEFAULT_FILM_GRAIN,
  DEFAULT_BLUR_EFFECT,
  DEFAULT_STYLIZE_EFFECT,
} from "../core/defaults";
import {
  ActiveEffectsInspector,
  BlurStylizeControlsSection,
  GrainControlsSection,
} from "./ProEffectsControls";
import { resolveEffects } from "./EffectsPanel";
import { evaluateKeyframes, formatTime, id } from "../core/model";
import VisualTools from "./VisualTools";
import TransitionInspector from "./TransitionInspector";
import "./Inspector.css";
import "./EffectsPanel.css";
import { useEditorStore } from "../editor/store";
import { useTranslation } from "../i18n";
interface Props {
  project: Project;
  clip?: Clip;
  playhead?: number;
  onUpdate: (patch: Partial<Clip>) => void;
  onProjectUpdate: (patch: Partial<Project>) => void;
}
function NumberField({
  label,
  value,
  min = -100000,
  max = 100000,
  step = 1,
  onChange,
  suffix,
  diamond,
  range = false,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  suffix?: string;
  diamond?: () => void;
  range?: boolean;
}) {
  return (
    <label className="property-row">
      <span className="property-label">{label}</span>
      {range && (
        <input
          className="property-range"
          aria-label={label}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onPointerDown={() => useEditorStore.getState().beginTransaction()}
          onPointerUp={() => useEditorStore.getState().endTransaction()}
          onPointerCancel={() => useEditorStore.getState().endTransaction()}
          onKeyDown={() => useEditorStore.getState().beginTransaction()}
          onKeyUp={() => useEditorStore.getState().endTransaction()}
          onBlur={() => useEditorStore.getState().endTransaction()}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      )}
      <div className="numeric-field">
        <input
          aria-label={label}
          type="number"
          value={Number(value.toFixed(1))}
          min={min}
          max={max}
          step={step}
          onFocus={() => useEditorStore.getState().beginTransaction()}
          onBlur={() => useEditorStore.getState().endTransaction()}
          onChange={(e) => {
            if (e.target.value === "") return;
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v >= min && v <= max) onChange(v);
          }}
        />
        {suffix && <span className="numeric-suffix">{suffix}</span>}
      </div>
      {diamond && (
        <button
          className="diamond-btn"
          title={label}
          onClick={(e) => {
            e.preventDefault();
            diamond();
          }}
        >
          <Diamond size={12} />
        </button>
      )}
    </label>
  );
}

function CoordinateRow({
  label,
  x,
  y,
  onChangeX,
  onChangeY,
  diamondX,
  diamondY,
}: {
  label: string;
  x: number;
  y: number;
  onChangeX: (v: number) => void;
  onChangeY: (v: number) => void;
  diamondX?: () => void;
  diamondY?: () => void;
}) {
  return (
    <div className="property-row coordinate-row">
      <span className="property-label">{label}</span>
      <div className="coordinate-group">
        <div className="coordinate-pill">
          <span className="coord-axis">X</span>
          <input
            aria-label={`${label} X`}
            type="number"
            value={Number(x.toFixed(1))}
            onFocus={() => useEditorStore.getState().beginTransaction()}
            onBlur={() => useEditorStore.getState().endTransaction()}
            onChange={(e) => {
              if (e.target.value === "") return;
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onChangeX(v);
            }}
          />
          {diamondX && (
            <button
              className="diamond-btn"
              title={`${label} X`}
              onClick={(e) => {
                e.preventDefault();
                diamondX();
              }}
            >
              <Diamond size={11} />
            </button>
          )}
        </div>
        <div className="coordinate-pill">
          <span className="coord-axis">Y</span>
          <input
            aria-label={`${label} Y`}
            type="number"
            value={Number(y.toFixed(1))}
            onFocus={() => useEditorStore.getState().beginTransaction()}
            onBlur={() => useEditorStore.getState().endTransaction()}
            onChange={(e) => {
              if (e.target.value === "") return;
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onChangeY(v);
            }}
          />
          {diamondY && (
            <button
              className="diamond-btn"
              title={`${label} Y`}
              onClick={(e) => {
                e.preventDefault();
                diamondY();
              }}
            >
              <Diamond size={11} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <label className="property-row">
      <span className="property-label">{label}</span>
      <input
        className="property-range"
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={() => useEditorStore.getState().beginTransaction()}
        onPointerUp={() => useEditorStore.getState().endTransaction()}
        onPointerCancel={() => useEditorStore.getState().endTransaction()}
        onKeyDown={() => useEditorStore.getState().beginTransaction()}
        onKeyUp={() => useEditorStore.getState().endTransaction()}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="numeric-field slider-numeric-field">
        <input
          aria-label={label}
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number(value.toFixed(step >= 1 ? 0 : 2))}
          onFocus={() => useEditorStore.getState().beginTransaction()}
          onBlur={() => useEditorStore.getState().endTransaction()}
          onChange={(e) => {
            if (e.target.value === "") return;
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v >= min && v <= max) onChange(v);
          }}
        />
      </div>
    </label>
  );
}
function AlignLeftIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="3" y1="2" x2="3" y2="14" />
      <rect x="6" y="5" width="7" height="6" rx="1" fill="currentColor" fillOpacity="0.2" />
    </svg>
  );
}

function AlignCenterHIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="8" y1="2" x2="8" y2="14" />
      <rect x="4.5" y="5" width="7" height="6" rx="1" fill="currentColor" fillOpacity="0.2" />
    </svg>
  );
}

function AlignRightIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="13" y1="2" x2="13" y2="14" />
      <rect x="3" y="5" width="7" height="6" rx="1" fill="currentColor" fillOpacity="0.2" />
    </svg>
  );
}

function AlignTopIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="2" y1="3" x2="14" y2="3" />
      <rect x="5" y="6" width="6" height="7" rx="1" fill="currentColor" fillOpacity="0.2" />
    </svg>
  );
}

function AlignCenterVIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="2" y1="8" x2="14" y2="8" />
      <rect x="5" y="4.5" width="6" height="7" rx="1" fill="currentColor" fillOpacity="0.2" />
    </svg>
  );
}

function AlignBottomIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="2" y1="13" x2="14" y2="13" />
      <rect x="5" y="3" width="6" height="7" rx="1" fill="currentColor" fillOpacity="0.2" />
    </svg>
  );
}

export default function Inspector(props: Props) {
  const { t } = useTranslation();
  const storePlayhead = useEditorStore((s) => s.playhead);
  const playhead = props.playhead ?? storePlayhead;
  const { project, clip, onUpdate, onProjectUpdate } = props;
  const [tab, setTab] = useState("画面"),
    [uniformScale, setUniformScale] = useState(true),
    [fonts, setFonts] = useState<string[]>([
      "Noto Sans SC",
      "sans-serif",
      "PingFang SC",
      "Arial",
      "Georgia",
    ]);
  useEffect(() => {
    void window.editorAPI
      ?.getFontFamilies()
      .then((fonts) => setFonts(fonts))
      .catch(() => {});
  }, []);
  useEffect(() => {
    const hasEffects = Boolean(
      clip?.isAdjustmentLayer ||
      (clip?.effects?.grain && (clip.effects.grain.enabled || clip.effects.grain.intensity > 0)) ||
      (clip?.effects?.blur && (clip.effects.blur.enabled || clip.effects.blur.radius > 0)) ||
      (clip?.effects?.stylize?.enabled && (
        (clip.effects.stylize.vignette ?? 0) > 0 ||
        (clip.effects.stylize.chromaticAberration ?? 0) > 0 ||
        (clip.effects.stylize.scanlines ?? 0) > 0 ||
        (clip.effects.stylize.bloom ?? 0) > 0 ||
        (clip.effects.stylize.sharpen ?? 0) > 0
      ))
    );
    setTab(
      clip?.isAdjustmentLayer || hasEffects
        ? "efek"
        : clip?.text
          ? "文本"
          : project.assets.find((a) => a.id === clip?.assetId)?.kind === "audio"
            ? "音频"
            : "画面",
    );
  }, [clip?.id, !!clip?.text, !!clip?.isAdjustmentLayer]);
  const selectedTransitionId = useEditorStore((s) => s.selectedTransitionId);
  if (selectedTransitionId) {
    return <TransitionInspector transitionId={selectedTransitionId} />;
  }

  if (!clip)
    return (
      <aside className="inspector panel">
        <div className="panel-heading">
          <span>{t("inspector.projectSettings")}</span>
          <SlidersHorizontal size={16} />
        </div>
        <div className="inspector-content">
          <div className="section-title">
            <h3>{t("inspector.canvasSettings")}</h3>
          </div>
          <label className="stacked-label">
            <span>{t("inspector.projectName")}</span>
            <input
              value={project.name === "未命名项目" || project.name === "Untitled Project" ? t("project.untitled") : project.name}
              onFocus={() => useEditorStore.getState().beginTransaction()}
              onBlur={() => useEditorStore.getState().endTransaction()}
              onChange={(e) => onProjectUpdate({ name: e.target.value })}
            />
          </label>
          <label className="property-row">
            <span className="property-label">{t("inspector.aspectRatio")}</span>
            <div className="select-wrapper">
              <select
                aria-label={t("inspector.aspectRatio")}
                value={`${project.width}:${project.height}`}
                onChange={(e) => {
                  const [width, height] = e.target.value.split(":").map(Number);
                  onProjectUpdate({ width, height });
                }}
              >
                {![
                  "1920:1080",
                  "1080:1920",
                  "1080:1080",
                  "1440:1080",
                  "2560:1440",
                  "3840:2160",
                ].includes(`${project.width}:${project.height}`) && (
                  <option value={`${project.width}:${project.height}`}>
                    {t("inspector.aspectCustom")}
                  </option>
                )}
                <option value="1920:1080">{t("inspector.aspectLandscape")}</option>
                <option value="1080:1920">{t("inspector.aspectPortrait")}</option>
                <option value="1080:1080">{t("inspector.aspectSquare")}</option>
                <option value="1440:1080">{t("inspector.aspectClassic")}</option>
                <option value="2560:1440">16:9 · 2K</option>
                <option value="3840:2160">16:9 · 4K</option>
              </select>
              <ChevronDown size={14} className="select-arrow" />
            </div>
          </label>
          <NumberField
            label={t("inspector.width")}
            value={project.width}
            min={16}
            max={7680}
            step={2}
            suffix="px"
            onChange={(width) => onProjectUpdate({ width })}
          />
          <NumberField
            label={t("inspector.height")}
            value={project.height}
            min={16}
            max={7680}
            step={2}
            suffix="px"
            onChange={(height) => onProjectUpdate({ height })}
          />
          <label className="property-row">
            <span className="property-label">{t("inspector.fps")}</span>
            <div className="select-wrapper">
              <select
                aria-label={t("inspector.fps")}
                value={project.fps}
                onChange={(e) => onProjectUpdate({ fps: Number(e.target.value) })}
              >
                {[24, 25, 30, 50, 60].map((fps) => (
                  <option key={fps} value={fps}>
                    {fps} fps
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="select-arrow" />
            </div>
          </label>
          <div className="property-row">
            <span className="property-label">{t("inspector.backgroundColor")}</span>
            <div className="color-picker-group">
              <input
                aria-label={t("inspector.backgroundColor")}
                type="color"
                className="color-picker-input"
                value={project.background}
                onChange={(e) => onProjectUpdate({ background: e.target.value })}
              />
              <code className="color-hex-tag">{project.background}</code>
            </div>
          </div>
          <div className="inspector-guide">
            <Image size={30} />
            <p>{t("inspector.selectClipHint")}</p>
            <span>{t("inspector.selectClipDesc")}</span>
          </div>
          <div className="offline-note">
            <span className="status-dot" />
            {t("inspector.offlineGuarantee")}
          </div>
        </div>
      </aside>
    );
  const track = project.tracks.find((t) => t.id === clip.trackId)!,
    asset = project.assets.find((a) => a.id === clip.assetId);
  const local = Math.max(0, Math.min(clip.duration, playhead - clip.start)),
    evaluated = evaluateKeyframes(clip, local),
    locked = track.locked;
  const key = (property: Keyframe["property"], value: number) => {
    const at = Math.min(
      clip.duration,
      Math.round(local * project.fps) / project.fps,
    );
    const existing = clip.keyframes.find(
      (k) =>
        k.property === property && Math.abs(k.time - at) < 0.5 / project.fps,
    );
    onUpdate({
      keyframes: existing
        ? clip.keyframes.filter((k) => k.id !== existing.id)
        : [
            ...clip.keyframes,
            { id: id(), property, time: at, value, easing: "linear" },
          ],
    });
  };
  const animate = (property: Keyframe["property"], value: number) => {
    if (clip.keyframes.some((k) => k.property === property)) {
      const at = Math.min(
          clip.duration,
          Math.round(local * project.fps) / project.fps,
        ),
        existing = clip.keyframes.find(
          (k) =>
            k.property === property &&
            Math.abs(k.time - at) < 0.5 / project.fps,
        );
      onUpdate({
        keyframes: existing
          ? clip.keyframes.map((k) =>
              k.id === existing.id ? { ...k, value } : k,
            )
          : [
              ...clip.keyframes,
              { id: id(), property, time: at, value, easing: "linear" },
            ],
      });
    } else if (property === "volume") onUpdate({ volume: value });
    else onUpdate({ transform: { ...clip.transform, [property]: value } });
  };
  const visual = Boolean(clip.isAdjustmentLayer || asset?.kind !== "audio");
  const pictureTabs = clip.isAdjustmentLayer
    ? ["画面"]
    : ["画面", "裁剪", "抠像", "蒙版"];
  const pictureActive = pictureTabs.includes(tab);
  const tabs = clip.isAdjustmentLayer
    ? ["efek", "调色", "画面"]
    : clip.text
      ? ["文本", "画面", "动画", "速度"]
      : visual
        ? ["画面", "音频", "速度", "动画", "调色", "efek"]
        : ["音频", "速度", "动画"];
  const tabLabelMap: Record<string, string> = {
    "画面": t("inspector.tabVideo"),
    "音频": t("inspector.tabAudio"),
    "文本": t("inspector.tabText"),
    "速度": t("inspector.tabSpeed"),
    "动画": t("inspector.tabAnimation"),
    "调色": t("inspector.tabColor"),
    "裁剪": t("inspector.tabCrop"),
    "抠像": t("inspector.tabCutout"),
    "蒙版": t("inspector.tabMask"),
    "efek": t("inspector.tabEffects") || "Efek",
  };
  const tabLabel = (value: string) => tabLabelMap[value] || value;
  return (
    <aside className="inspector panel">
      <div className="inspector-tabs">
        <nav className="inspector-main-tabs" aria-label={t("inspector.title")}>
          {tabs.map((tb) => (
            <button
              key={tb}
              aria-label={tabLabel(tb)}
              aria-pressed={tab === tb || (tb === "画面" && pictureActive)}
              className={tab === tb || (tb === "画面" && pictureActive) ? "active" : ""}
              onClick={() => setTab(tb)}
            >
              {tabLabel(tb)}
            </button>
          ))}
        </nav>
        {visual && !clip.text && (
          <nav className="inspector-picture-tabs" aria-label={t("inspector.transform")} hidden={!pictureActive}>
            {pictureTabs.map((pt) => (
              <button
                key={pt}
                aria-label={pt === "画面" ? t("inspector.tabBasic") : tabLabel(pt)}
                aria-pressed={tab === pt}
                className={tab === pt ? "active" : ""}
                onClick={() => setTab(pt)}
              >
                {pt === "画面" ? t("inspector.tabBasic") : tabLabel(pt)}
              </button>
            ))}
          </nav>
        )}
      </div>
      <div className="inspector-content">
        <div className="clip-info">
          <div className="clip-info-primary">
            <Film size={14} className="clip-info-icon" />
            <strong title={clip.name}>{clip.name}</strong>
            {clip.isCompound && (
              <span className="tl-compound-badge">Compound</span>
            )}
            {clip.isAdjustmentLayer && (
              <span className="tl-adjustment-badge">Adjustment</span>
            )}
          </div>
          <div className="clip-info-meta">
            <span className="meta-tag">{track.name}</span>
            <span className="meta-divider">·</span>
            <span className="meta-time">{formatTime(clip.duration, project.fps)}</span>
          </div>
          {clip.isCompound && (
            <button
              type="button"
              className="secondary-btn"
              style={{ marginTop: 6, fontSize: 11, padding: "3px 8px" }}
              onClick={() => useEditorStore.getState().ungroupCompoundClip(clip.id)}
            >
              {t("timeline.ungroupCompound") || "Ungroup Compound Clip"}
            </button>
          )}
        </div>
        {locked && (
          <div className="inline-warning">{t("inspector.lockedNotice")}</div>
        )}
        <fieldset disabled={locked}>
          {["裁剪", "抠像", "蒙版"].includes(tab) && (
            <VisualTools
              mode={
                tab === "裁剪" ? "crop" : tab === "抠像" ? "chroma" : "mask"
              }
              clip={clip}
              asset={asset}
              onUpdate={onUpdate}
              locked={locked}
            />
          )}
          {tab === "画面" && (
            <>
              <div className="section-title">
                <h3>{t("inspector.transform")}</h3>
                <button
                  title={t("inspector.reset")}
                  onClick={() =>
                    onUpdate({
                      transform: { ...DEFAULT_TRANSFORM },
                      keyframes: clip.keyframes.filter(
                        (k) => k.property === "volume",
                      ),
                    })
                  }
                >
                  <RotateCcw size={13} />
                </button>
              </div>
              <NumberField
                label={t("inspector.scale")}
                range
                value={evaluated.transform.scale * 100}
                min={1}
                max={1000}
                suffix="%"
                onChange={(v) => animate("scale", v / 100)}
                diamond={() => key("scale", evaluated.transform.scale)}
              />
              <div className="property-row uniform-scale-row">
                <span className="property-label">{t("inspector.uniformScale")}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={uniformScale}
                  aria-label={t("inspector.uniformScale")}
                  className={`toggle-switch ${uniformScale ? "is-on" : ""}`}
                  onClick={() => setUniformScale(!uniformScale)}
                >
                  <span className="toggle-thumb" />
                </button>
              </div>
              <CoordinateRow
                label={t("inspector.position")}
                x={evaluated.transform.x}
                y={evaluated.transform.y}
                onChangeX={(v) => animate("x", v)}
                onChangeY={(v) => animate("y", v)}
                diamondX={() => key("x", evaluated.transform.x)}
                diamondY={() => key("y", evaluated.transform.y)}
              />
              <NumberField
                label={t("inspector.rotation")}
                range
                value={evaluated.transform.rotation}
                min={-180}
                max={180}
                step={1}
                suffix="°"
                onChange={(v) => animate("rotation", v)}
                diamond={() => key("rotation", evaluated.transform.rotation)}
              />
              <div className="inspector-align-toolbar" aria-label="Transform Alignment" data-testid="inspector-align-toolbar">
                <div className="align-subgroup">
                  <button
                    type="button"
                    title={t("inspector.alignLeft") || "Rata Kiri"}
                    aria-label={t("inspector.alignLeft") || "Rata Kiri"}
                    onClick={() => animate("x", -project.width / 4)}
                  >
                    <AlignLeftIcon />
                  </button>
                  <button
                    type="button"
                    title={t("inspector.alignCenterH") || "Tengah Horisontal"}
                    aria-label={t("inspector.alignCenterH") || "Tengah Horisontal"}
                    onClick={() => animate("x", 0)}
                  >
                    <AlignCenterHIcon />
                  </button>
                  <button
                    type="button"
                    title={t("inspector.alignRight") || "Rata Kanan"}
                    aria-label={t("inspector.alignRight") || "Rata Kanan"}
                    onClick={() => animate("x", project.width / 4)}
                  >
                    <AlignRightIcon />
                  </button>
                </div>
                <div className="align-divider" />
                <div className="align-subgroup">
                  <button
                    type="button"
                    title={t("inspector.alignTop") || "Rata Atas"}
                    aria-label={t("inspector.alignTop") || "Rata Atas"}
                    onClick={() => animate("y", -project.height / 4)}
                  >
                    <AlignTopIcon />
                  </button>
                  <button
                    type="button"
                    title={t("inspector.alignCenterV") || "Tengah Vertikal"}
                    aria-label={t("inspector.alignCenterV") || "Tengah Vertikal"}
                    onClick={() => animate("y", 0)}
                  >
                    <AlignCenterVIcon />
                  </button>
                  <button
                    type="button"
                    title={t("inspector.alignBottom") || "Rata Bawah"}
                    aria-label={t("inspector.alignBottom") || "Rata Bawah"}
                    onClick={() => animate("y", project.height / 4)}
                  >
                    <AlignBottomIcon />
                  </button>
                </div>
              </div>
              <div className="section-title" style={{ marginTop: 14 }}>
                <h3>{t("inspector.opacity")}</h3>
                <button
                  title={t("inspector.reset")}
                  onClick={() => animate("opacity", 1)}
                >
                  <RotateCcw size={13} />
                </button>
              </div>
              <NumberField
                label={t("inspector.opacity")}
                range
                value={evaluated.transform.opacity * 100}
                min={0}
                max={100}
                step={1}
                suffix="%"
                onChange={(v) => animate("opacity", v / 100)}
                diamond={() => key("opacity", evaluated.transform.opacity)}
              />
              <label className="property-row">
                <span className="property-label">Blend Mode</span>
                <div className="select-wrapper">
                  <select
                    aria-label="Blend Mode"
                    value={clip.blendMode ?? "normal"}
                    onChange={(e) =>
                      onUpdate({ blendMode: e.target.value as BlendMode })
                    }
                  >
                    <option value="normal">Normal</option>
                    <option value="screen">Screen</option>
                    <option value="multiply">Multiply</option>
                    <option value="overlay">Overlay</option>
                    <option value="soft-light">Soft Light</option>
                    <option value="hard-light">Hard Light</option>
                    <option value="color-dodge">Color Dodge</option>
                  </select>
                  <ChevronDown size={14} className="select-arrow" />
                </div>
              </label>
              <div className="property-row">
                <span className="property-label">{t("inspector.flip")}</span>
                <div className="flip-segmented">
                  <button
                    type="button"
                    className={`flip-btn ${clip.transform.flipX ? "is-active" : ""}`}
                    title={t("inspector.flipH") || "Cermin Horisontal"}
                    aria-label={t("inspector.flipH") || "Cermin Horisontal"}
                    onClick={() =>
                      onUpdate({
                        transform: {
                          ...clip.transform,
                          flipX: !clip.transform.flipX,
                        },
                      })
                    }
                  >
                    <FlipHorizontal2 size={15} />
                    <span>Horisontal</span>
                  </button>
                  <button
                    type="button"
                    className={`flip-btn ${clip.transform.flipY ? "is-active" : ""}`}
                    title={t("inspector.flipV") || "Cermin Vertikal"}
                    aria-label={t("inspector.flipV") || "Cermin Vertikal"}
                    onClick={() =>
                      onUpdate({
                        transform: {
                          ...clip.transform,
                          flipY: !clip.transform.flipY,
                        },
                      })
                    }
                  >
                    <FlipVertical2 size={15} />
                    <span>Vertikal</span>
                  </button>
                </div>
              </div>
              {asset?.color && (
                <div className="property-row">
                  <span>{t("creative.solidColor") || "Solid Color"}</span>
                  <input
                    aria-label={t("creative.solidColor") || "Solid Color"}
                    type="color"
                    value={asset.color}
                    onChange={(e) => {
                      const newColor = e.target.value;
                      const svgUri = `data:image/svg+xml;utf8,${encodeURIComponent(
                        `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="100%" height="100%" fill="${newColor}"/></svg>`
                      )}`;
                      const updatedAssets = project.assets.map((a) =>
                        a.id === asset.id
                          ? {
                              ...a,
                              color: newColor,
                              path: `solid:${newColor}`,
                              src: svgUri,
                            }
                          : a
                      );
                      onProjectUpdate({ assets: updatedAssets });
                    }}
                  />
                  <code>{asset.color}</code>
                </div>
              )}
              <div className="section-title" style={{ marginTop: 14 }}>
                <h3>{t("inspector.fadeIn")} / {t("inspector.fadeOut")}</h3>
              </div>
              <NumberField
                label={t("inspector.fadeIn")}
                range
                value={clip.fadeIn}
                min={0}
                max={clip.duration}
                step={0.1}
                suffix="s"
                onChange={(fadeIn) => onUpdate({ fadeIn })}
              />
              <NumberField
                label={t("inspector.fadeOut")}
                range
                value={clip.fadeOut}
                min={0}
                max={clip.duration}
                step={0.1}
                suffix="s"
                onChange={(fadeOut) => onUpdate({ fadeOut })}
              />
            </>
          )}
          {tab === "音频" && (
            <>
              <div className="section-title">
                <h3>{t("inspector.volume")}</h3>
                <button
                  title={t("inspector.reset")}
                  onClick={() => animate("volume", 1)}
                >
                  <RotateCcw size={13} />
                </button>
              </div>
              <NumberField
                label={t("inspector.volume")}
                range
                value={evaluated.volume * 100}
                min={0}
                max={400}
                step={1}
                suffix="%"
                onChange={(v) => animate("volume", v / 100)}
                diamond={() => key("volume", evaluated.volume)}
              />
              <div className="property-row">
                <span className="property-label">{t("timeline.mute")}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={clip.muted}
                  aria-label={t("timeline.mute")}
                  className={`toggle-switch ${clip.muted ? "is-on" : ""}`}
                  onClick={() => onUpdate({ muted: !clip.muted })}
                >
                  <span className="toggle-thumb" />
                </button>
              </div>
              <div className="section-title" style={{ marginTop: 14 }}>
                <h3>{t("inspector.fadeIn")} / {t("inspector.fadeOut")}</h3>
              </div>
              <NumberField
                label={t("inspector.fadeIn")}
                range
                value={clip.audioFadeIn}
                min={0}
                max={clip.duration}
                step={0.1}
                suffix="s"
                onChange={(audioFadeIn) => onUpdate({ audioFadeIn })}
              />
              <NumberField
                label={t("inspector.fadeOut")}
                range
                value={clip.audioFadeOut}
                min={0}
                max={clip.duration}
                step={0.1}
                suffix="s"
                onChange={(audioFadeOut) => onUpdate({ audioFadeOut })}
              />
              {!asset?.hasAudio && (
                <p className="muted">{t("inspector.noAudioStream")}</p>
              )}
            </>
          )}
          {tab === "调色" && (
            <>
              <div className="section-title">
                <h3>{t("inspector.color")}</h3>
                <button
                  title={t("inspector.reset")}
                  onClick={() =>
                    onUpdate({ adjustments: { ...DEFAULT_ADJUSTMENTS } })
                  }
                >
                  <RotateCcw size={13} />
                </button>
              </div>
              <Slider
                label={t("inspector.brightness")}
                value={clip.adjustments.brightness}
                min={-1}
                max={1}
                onChange={(v) =>
                  onUpdate({
                    adjustments: { ...clip.adjustments, brightness: v },
                  })
                }
              />
              <Slider
                label={t("inspector.contrast")}
                value={clip.adjustments.contrast}
                min={0}
                max={3}
                onChange={(v) =>
                  onUpdate({
                    adjustments: { ...clip.adjustments, contrast: v },
                  })
                }
              />
              <Slider
                label={t("inspector.saturation")}
                value={clip.adjustments.saturation}
                min={0}
                max={3}
                onChange={(v) =>
                  onUpdate({
                    adjustments: { ...clip.adjustments, saturation: v },
                  })
                }
              />
              <Slider
                label={t("inspector.temperature")}
                value={clip.adjustments.temperature}
                min={-1}
                max={1}
                onChange={(v) =>
                  onUpdate({
                    adjustments: { ...clip.adjustments, temperature: v },
                  })
                }
              />
              <Slider
                label={t("inspector.blur")}
                value={clip.adjustments.blur}
                min={0}
                max={100}
                step={1}
                onChange={(v) =>
                  onUpdate({ adjustments: { ...clip.adjustments, blur: v } })
                }
              />
              <p className="field-hint">{t("inspector.colorHint")}</p>

              <div className="inspector-effects-footer">
                <button
                  type="button"
                  className="inspector-effects-link-btn"
                  onClick={() => setTab("efek")}
                >
                  <WandSparkles size={14} /> Atur Efek (Film Grain, Blur & Stylize) →
                </button>
              </div>
            </>
          )}
          {tab === "efek" && visual && (
            <ActiveEffectsInspector clip={clip} onUpdate={onUpdate} />
          )}
          {tab === "文本" && clip.text && (
            <>
              <div className="section-title">
                <h3>{t("inspector.textContent")}</h3>
              </div>
              <textarea
                className="inspector-textarea"
                aria-label={t("inspector.textContent")}
                value={clip.text.text}
                rows={3}
                placeholder="Ketik teks di sini..."
                onFocus={() => useEditorStore.getState().beginTransaction()}
                onBlur={() => useEditorStore.getState().endTransaction()}
                onChange={(e) =>
                  onUpdate({
                    name: e.target.value.slice(0, 30) || t("inspector.defaultText"),
                    text: { ...clip.text!, text: e.target.value },
                  })
                }
              />
              <label className="property-row">
                <span className="property-label">{t("inspector.font")}</span>
                <div className="select-wrapper">
                  <select
                    aria-label={t("inspector.font")}
                    value={clip.text.fontFamily}
                    onChange={(e) =>
                      onUpdate({
                        text: { ...clip.text!, fontFamily: e.target.value },
                      })
                    }
                  >
                    <option value="sans-serif">{t("inspector.systemDefault")}</option>
                    {fonts
                      .filter((f) => f !== "sans-serif")
                      .map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                  </select>
                  <ChevronDown size={14} className="select-arrow" />
                </div>
              </label>
              <NumberField
                label={t("inspector.fontSize")}
                range
                value={clip.text.fontSize}
                min={8}
                max={300}
                suffix="px"
                onChange={(fontSize) =>
                  onUpdate({ text: { ...clip.text!, fontSize } })
                }
              />
              <div className="property-row">
                <span className="property-label">{t("inspector.textColor")}</span>
                <div className="color-picker-group">
                  <input
                    aria-label={t("inspector.textColor")}
                    type="color"
                    className="color-picker-input"
                    value={clip.text.color}
                    onChange={(e) =>
                      onUpdate({ text: { ...clip.text!, color: e.target.value } })
                    }
                  />
                  <code className="color-hex-tag">{clip.text.color}</code>
                </div>
                <button
                  type="button"
                  className={`format-btn ${clip.text.bold ? "is-active" : ""}`}
                  title={t("inspector.bold")}
                  onClick={() =>
                    onUpdate({
                      text: { ...clip.text!, bold: !clip.text!.bold },
                    })
                  }
                >
                  <Bold size={13} />
                </button>
              </div>
              <div className="property-row">
                <span className="property-label">{t("inspector.align")}</span>
                <div className="text-align-segmented">
                  {(["left", "center", "right"] as const).map((align, i) => (
                    <button
                      key={align}
                      type="button"
                      title={[t("inspector.alignLeft"), t("inspector.alignCenter"), t("inspector.alignRight")][i]}
                      className={`text-align-btn ${clip.text!.align === align ? "is-active" : ""}`}
                      onClick={() =>
                        onUpdate({ text: { ...clip.text!, align } })
                      }
                    >
                      {i === 0 ? (
                        <AlignLeft size={14} />
                      ) : i === 1 ? (
                        <AlignCenter size={14} />
                      ) : (
                        <AlignRight size={14} />
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <div className="section-title" style={{ marginTop: 14 }}>
                <h3>{t("inspector.strokeAndBg")}</h3>
              </div>
              <div className="property-row">
                <span className="property-label">{t("inspector.stroke")}</span>
                <div className="color-picker-group">
                  <input
                    aria-label={t("inspector.stroke")}
                    type="color"
                    className="color-picker-input"
                    value={clip.text.stroke}
                    onChange={(e) =>
                      onUpdate({
                        text: { ...clip.text!, stroke: e.target.value },
                      })
                    }
                  />
                  <code className="color-hex-tag">{clip.text.stroke}</code>
                </div>
              </div>
              <NumberField
                label={t("inspector.strokeWidth")}
                range
                value={clip.text.strokeWidth}
                min={0}
                max={50}
                suffix="px"
                onChange={(strokeWidth) =>
                  onUpdate({ text: { ...clip.text!, strokeWidth } })
                }
              />
              <div className="property-row">
                <span className="property-label">{t("inspector.textBackground")}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={clip.text.background !== "transparent"}
                  aria-label={t("inspector.textBackground")}
                  className={`toggle-switch ${clip.text.background !== "transparent" ? "is-on" : ""}`}
                  onClick={() =>
                    onUpdate({
                      text: {
                        ...clip.text!,
                        background:
                          clip.text!.background !== "transparent"
                            ? "transparent"
                            : "#15151c",
                      },
                    })
                  }
                >
                  <span className="toggle-thumb" />
                </button>
                {clip.text.background !== "transparent" && (
                  <div className="color-picker-group" style={{ marginLeft: "auto" }}>
                    <input
                      type="color"
                      aria-label={t("inspector.bgColor")}
                      className="color-picker-input"
                      value={clip.text.background}
                      onChange={(e) =>
                        onUpdate({
                          text: { ...clip.text!, background: e.target.value },
                        })
                      }
                    />
                    <code className="color-hex-tag">{clip.text.background}</code>
                  </div>
                )}
              </div>
            </>
          )}
          {tab === "速度" && (
            <>
              <div className="section-title">
                <h3>{t("inspector.tabSpeed")}</h3>
                <button
                  title={t("inspector.reset")}
                  onClick={() => useEditorStore.getState().setClipSpeed(clip.id, 1)}
                >
                  <RotateCcw size={13} />
                </button>
              </div>
              <div className="speed-presets">
                {[0.25, 0.5, 1, 1.5, 2, 4].map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    className={`speed-preset-btn ${clip.speed === spd ? "is-active" : ""}`}
                    onClick={() => useEditorStore.getState().setClipSpeed(clip.id, spd)}
                  >
                    {spd}×
                  </button>
                ))}
              </div>
              <NumberField
                label={t("inspector.tabSpeed")}
                range
                value={clip.speed}
                min={0.1}
                max={8}
                step={0.05}
                suffix="×"
                onChange={(spd) => useEditorStore.getState().setClipSpeed(clip.id, spd)}
              />
              <div className="speed-info-card">
                <div className="speed-info-row">
                  <span className="speed-info-label">{t("timeline.duration")}:</span>
                  <span className="speed-info-val">{formatTime(clip.duration, project.fps)}</span>
                </div>
                <div className="speed-info-row">
                  <span className="speed-info-label">{t("inspector.tabSpeed")}:</span>
                  <span className="speed-info-val speed-val-highlight">{clip.speed.toFixed(2)}×</span>
                </div>
              </div>
              <p className="field-hint">{t("inspector.speedHint")}</p>
              <div className="section-title" style={{ marginTop: 14 }}>
                <h3>{t("inspector.timeRange")}</h3>
              </div>
              <NumberField
                label={t("export.startSec")}
                value={clip.start}
                min={0}
                step={1 / project.fps}
                suffix="s"
                onChange={(start) => onUpdate({ start })}
              />
              <NumberField
                label={t("sourcePreview.inPoint")}
                value={clip.sourceIn}
                min={0}
                max={Math.max(
                  0,
                  (asset?.duration ?? 0) - clip.duration * clip.speed,
                )}
                step={1 / project.fps}
                suffix="s"
                onChange={(sourceIn) => onUpdate({ sourceIn })}
              />
              <p className="muted small">{t("inspector.trimHint")}</p>
            </>
          )}
          {tab === "动画" && (
            <>
              <KeyframeCurveEditor
                key={clip.id}
                project={project}
                clip={clip}
                playhead={playhead}
                visual={visual}
                onUpdate={onUpdate}
              />
              <div className="section-title">
                <h3>{t("keyframes.title")}</h3>
              </div>
              <p className="field-hint">{t("keyframes.hint")}</p>
              <div className="keyframe-add-grid">
                {(["x", "y", "scale", "rotation", "opacity", "volume"] as const)
                  .filter((property) => visual || property === "volume")
                  .map((property) => (
                    <button
                      key={property}
                      type="button"
                      className="keyframe-add-pill"
                      onClick={() =>
                        key(
                          property,
                          property === "volume"
                            ? evaluated.volume
                            : evaluated.transform[property],
                        )
                      }
                    >
                      <Diamond size={10} />
                      <span>
                        {
                          {
                            x: t("inspector.positionX"),
                            y: t("inspector.positionY"),
                            scale: t("inspector.scale"),
                            rotation: t("inspector.rotation"),
                            opacity: t("inspector.opacity"),
                            volume: t("inspector.volume"),
                          }[property]
                        }
                      </span>
                    </button>
                  ))}
              </div>
              {!clip.keyframes.length && (
                <div className="quiet-empty">{t("keyframes.empty")}</div>
              )}
              {clip.keyframes.length > 0 && (
                <div className="keyframe-list">
                  {[...clip.keyframes]
                    .sort((a, b) => a.time - b.time)
                    .map((k) => (
                      <div key={k.id} className="keyframe-list-row">
                        <button
                          type="button"
                          className="keyframe-time-pill"
                          title="Seek to keyframe"
                          onClick={() =>
                            useEditorStore.getState().seek(clip.start + k.time)
                          }
                        >
                          {formatTime(k.time, project.fps)}
                        </button>
                        <span className="keyframe-prop-badge">{k.property}</span>
                        <div className="numeric-field keyframe-val-field">
                          <input
                            aria-label={`${t("keyframes.value")}: ${k.property}`}
                            type="number"
                            step={0.01}
                            value={k.value}
                            onChange={(e) => {
                              const value = Number(e.target.value);
                              if (
                                Number.isFinite(value) &&
                                !(
                                  k.property === "opacity" &&
                                  (value < 0 || value > 1)
                                ) &&
                                !(
                                  k.property === "scale" &&
                                  (value <= 0 || value > 10)
                                ) &&
                                !(k.property === "volume" && (value < 0 || value > 4))
                              )
                                onUpdate({
                                  keyframes: clip.keyframes.map((key) =>
                                    key.id === k.id ? { ...key, value } : key,
                                  ),
                                });
                            }}
                          />
                        </div>
                        <div className="select-wrapper keyframe-ease-select">
                          <select
                            aria-label={t("keyframes.easing")}
                            value={k.easing}
                            onChange={(e) =>
                              onUpdate({
                                keyframes: clip.keyframes.map((key) =>
                                  key.id === k.id
                                    ? {
                                        ...key,
                                        easing: e.target.value as Keyframe["easing"],
                                        easingWindow: undefined,
                                      }
                                    : key,
                                ),
                              })
                            }
                          >
                            <option value="linear">{t("keyframes.linear")}</option>
                            <option value="easeIn">{t("keyframes.easeIn")}</option>
                            <option value="easeOut">{t("keyframes.easeOut")}</option>
                            <option value="easeInOut">{t("keyframes.easeInOut")}</option>
                          </select>
                          <ChevronDown size={12} className="select-arrow" />
                        </div>
                        <button
                          type="button"
                          className="keyframe-del-btn"
                          aria-label={t("keyframes.delete")}
                          title={t("keyframes.delete")}
                          onClick={() =>
                            onUpdate({
                              keyframes: clip.keyframes.filter(
                                (key) => key.id !== k.id,
                              ),
                            })
                          }
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </>
          )}
        </fieldset>
      </div>
    </aside>
  );
}
