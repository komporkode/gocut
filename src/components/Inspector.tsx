import KeyframeCurveEditor from "./KeyframeCurveEditor";
import { useEffect, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronDown,
  Diamond,
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
import type { Clip, Keyframe, Project } from "../core/types";
import { DEFAULT_TRANSFORM, DEFAULT_ADJUSTMENTS } from "../core/defaults";
import { evaluateKeyframes, formatTime, id } from "../core/model";
import VisualTools from "./VisualTools";
import "./Inspector.css";
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
      <span>{label}</span>
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
          value={Number(value.toFixed(3))}
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
        {suffix && <span>{suffix}</span>}
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
    <div className="slider-property">
      <div>
        <label>{label}</label>
        <span>{format ? format(value) : value.toFixed(2)}</span>
      </div>
      <input
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
    </div>
  );
}
export default function Inspector(props: Props) {
  const { t } = useTranslation();
  const storePlayhead = useEditorStore((s) => s.playhead);
  const playhead = props.playhead ?? storePlayhead;
  const { project, clip, onUpdate, onProjectUpdate } = props;
  const [tab, setTab] = useState("画面"),
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
    setTab(
      clip?.text
        ? "文本"
        : project.assets.find((a) => a.id === clip?.assetId)?.kind === "audio"
          ? "音频"
          : "画面",
    );
  }, [clip?.id, !!clip?.text]);
  if (!clip)
    return (
      <aside className="inspector panel">
        <div className="panel-heading">
          <span>{t("inspector.projectSettings")}</span>
          <SlidersHorizontal size={16} />
        </div>
        <div className="inspector-content">
          <h3>{t("inspector.canvasSettings")}</h3>
          <label className="stacked-label">
            {t("inspector.projectName")}
            <input
              value={project.name === "未命名项目" || project.name === "Untitled Project" ? t("project.untitled") : project.name}
              onFocus={() => useEditorStore.getState().beginTransaction()}
              onBlur={() => useEditorStore.getState().endTransaction()}
              onChange={(e) => onProjectUpdate({ name: e.target.value })}
            />
          </label>
          <label className="property-row">
            <span>{t("inspector.aspectRatio")}</span>
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
            <span>{t("inspector.fps")}</span>
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
          </label>
          <label className="property-row">
            <span>{t("inspector.backgroundColor")}</span>
            <input
              aria-label={t("inspector.backgroundColor")}
              type="color"
              value={project.background}
              onChange={(e) => onProjectUpdate({ background: e.target.value })}
            />
            <code>{project.background}</code>
          </label>
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
  const visual = asset?.kind !== "audio";
  const pictureTabs = ["画面", "裁剪", "抠像", "蒙版"];
  const pictureActive = pictureTabs.includes(tab);
  const tabs = clip.text
    ? ["文本", "画面", "动画", "速度"]
    : visual
      ? ["画面", "音频", "速度", "动画", "调色"]
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
                aria-label={tabLabel(pt)}
                aria-pressed={tab === pt}
                className={tab === pt ? "active" : ""}
                onClick={() => setTab(pt)}
              >
                {tabLabel(pt)}
              </button>
            ))}
          </nav>
        )}
      </div>
      <div className="inspector-content">
        <div className="clip-info">
          <div>
            <strong>{clip.name}</strong>
            {clip.isCompound && (
              <span className="tl-compound-badge" style={{ marginLeft: 6 }}>
                Compound
              </span>
            )}
          </div>
          <span>
            {track.name} · {formatTime(clip.duration, project.fps)}
          </span>
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
              <div className="position-fields">
              <NumberField
                label={`${t("inspector.position")} X`}
                value={evaluated.transform.x}
                onChange={(v) => animate("x", v)}
                diamond={() => key("x", evaluated.transform.x)}
              />
              <NumberField
                label={`${t("inspector.position")} Y`}
                value={evaluated.transform.y}
                onChange={(v) => animate("y", v)}
                diamond={() => key("y", evaluated.transform.y)}
              />
              </div>
              <NumberField
                label={t("inspector.rotation")}
                value={evaluated.transform.rotation}
                min={-3600}
                max={3600}
                suffix="°"
                onChange={(v) => animate("rotation", v)}
                diamond={() => key("rotation", evaluated.transform.rotation)}
              />
              <NumberField
                label={t("inspector.opacity")}
                value={evaluated.transform.opacity * 100}
                min={0}
                max={100}
                suffix="%"
                onChange={(v) => animate("opacity", v / 100)}
                diamond={() => key("opacity", evaluated.transform.opacity)}
              />
              <div className="property-row">
                <span>{t("inspector.flip")}</span>
                <div className="segmented">
                  <button
                    className={clip.transform.flipX ? "active" : ""}
                    title={t("inspector.flipH")}
                    onClick={() =>
                      onUpdate({
                        transform: {
                          ...clip.transform,
                          flipX: !clip.transform.flipX,
                        },
                      })
                    }
                  >
                    <FlipHorizontal2 size={17} />
                  </button>
                  <button
                    className={clip.transform.flipY ? "active" : ""}
                    title={t("inspector.flipV")}
                    onClick={() =>
                      onUpdate({
                        transform: {
                          ...clip.transform,
                          flipY: !clip.transform.flipY,
                        },
                      })
                    }
                  >
                    <FlipVertical2 size={17} />
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
              <h3>{t("inspector.fadeIn")} / {t("inspector.fadeOut")}</h3>
              <NumberField
                label={t("inspector.fadeIn")}
                value={clip.fadeIn}
                min={0}
                max={clip.duration}
                step={0.1}
                suffix="s"
                onChange={(fadeIn) => onUpdate({ fadeIn })}
              />
              <NumberField
                label={t("inspector.fadeOut")}
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
              <h3>{t("inspector.volume")}</h3>
              <NumberField
                label={t("inspector.volume")}
                value={evaluated.volume * 100}
                min={0}
                max={400}
                suffix="%"
                onChange={(v) => animate("volume", v / 100)}
                diamond={() => key("volume", evaluated.volume)}
              />
              <label className="toggle-property">
                <span>{t("timeline.mute")}</span>
                <input
                  aria-label={t("timeline.mute")}
                  type="checkbox"
                  checked={clip.muted}
                  onChange={(e) => onUpdate({ muted: e.target.checked })}
                />
              </label>
              <h3>{t("inspector.fadeIn")} / {t("inspector.fadeOut")}</h3>
              <NumberField
                label={t("inspector.fadeIn")}
                value={clip.audioFadeIn}
                min={0}
                max={clip.duration}
                step={0.1}
                suffix="s"
                onChange={(audioFadeIn) => onUpdate({ audioFadeIn })}
              />
              <NumberField
                label={t("inspector.fadeOut")}
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
            </>
          )}
          {tab === "文本" && clip.text && (
            <>
              <h3>{t("inspector.textContent")}</h3>
              <textarea
                aria-label={t("inspector.textContent")}
                value={clip.text.text}
                rows={4}
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
                <span>{t("inspector.font")}</span>
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
              </label>
              <NumberField
                label={t("inspector.fontSize")}
                value={clip.text.fontSize}
                min={1}
                max={1000}
                suffix="px"
                onChange={(fontSize) =>
                  onUpdate({ text: { ...clip.text!, fontSize } })
                }
              />
              <label className="property-row">
                <span>{t("inspector.textColor")}</span>
                <input
                  aria-label={t("inspector.textColor")}
                  type="color"
                  value={clip.text.color}
                  onChange={(e) =>
                    onUpdate({ text: { ...clip.text!, color: e.target.value } })
                  }
                />
                <button
                  className={clip.text.bold ? "active" : ""}
                  title={t("inspector.bold")}
                  onClick={() =>
                    onUpdate({
                      text: { ...clip.text!, bold: !clip.text!.bold },
                    })
                  }
                >
                  <b>B</b>
                </button>
              </label>
              <div className="property-row">
                <span>{t("inspector.align")}</span>
                <div className="segmented">
                  {(["left", "center", "right"] as const).map((align, i) => (
                    <button
                      key={align}
                      title={[t("inspector.alignLeft"), t("inspector.alignCenter"), t("inspector.alignRight")][i]}
                      className={clip.text!.align === align ? "active" : ""}
                      onClick={() =>
                        onUpdate({ text: { ...clip.text!, align } })
                      }
                    >
                      {i === 0 ? (
                        <AlignLeft size={16} />
                      ) : i === 1 ? (
                        <AlignCenter size={16} />
                      ) : (
                        <AlignRight size={16} />
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <h3>{t("inspector.strokeAndBg")}</h3>
              <label className="property-row">
                <span>{t("inspector.stroke")}</span>
                <input
                  aria-label={t("inspector.stroke")}
                  type="color"
                  value={clip.text.stroke}
                  onChange={(e) =>
                    onUpdate({
                      text: { ...clip.text!, stroke: e.target.value },
                    })
                  }
                />
              </label>
              <NumberField
                label={t("inspector.strokeWidth")}
                value={clip.text.strokeWidth}
                min={0}
                max={100}
                onChange={(strokeWidth) =>
                  onUpdate({ text: { ...clip.text!, strokeWidth } })
                }
              />
              <label className="toggle-property">
                <span>{t("inspector.textBackground")}</span>
                <input
                  type="checkbox"
                  aria-label={t("inspector.textBackground")}
                  checked={clip.text.background !== "transparent"}
                  onChange={(e) =>
                    onUpdate({
                      text: {
                        ...clip.text!,
                        background: e.target.checked
                          ? "#15151c"
                          : "transparent",
                      },
                    })
                  }
                />
              </label>
              {clip.text.background !== "transparent" && (
                <input
                  type="color"
                  aria-label={t("inspector.bgColor")}
                  value={clip.text.background}
                  onChange={(e) =>
                    onUpdate({
                      text: { ...clip.text!, background: e.target.value },
                    })
                  }
                />
              )}
            </>
          )}
          {tab === "速度" && (
            <>
              <h3>{t("inspector.speed")}</h3>
              <NumberField
                label={t("inspector.speed")}
                value={clip.speed}
                min={0.1}
                max={8}
                step={0.1}
                suffix="×"
                onChange={(speed) => onUpdate({ speed })}
              />
              <div className="speed-presets">
                {[0.25, 0.5, 1, 1.5, 2, 4].map((speed) => (
                  <button
                    key={speed}
                    className={clip.speed === speed ? "active" : ""}
                    onClick={() => onUpdate({ speed })}
                  >
                    {speed}×
                  </button>
                ))}
              </div>
              <p className="field-hint">{t("inspector.speedHint")}</p>
              <h3>{t("inspector.timeRange")}</h3>
              <NumberField
                label={t("sourcePreview.inPoint")}
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
              <div className="speed-presets" style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
                {[0.25, 0.5, 1, 2, 4].map((spd) => (
                  <button
                    key={spd}
                    className={`btn-secondary ${clip.speed === spd ? "is-active" : ""}`}
                    style={{
                      flex: 1,
                      padding: "6px 0",
                      fontSize: "11px",
                      background: clip.speed === spd ? "#633bfb" : "#2a2a2a",
                      color: clip.speed === spd ? "#fff" : "#ccc",
                      borderRadius: "4px",
                      border: 0,
                      cursor: "pointer",
                      fontWeight: clip.speed === spd ? "bold" : "normal",
                    }}
                    onClick={() => useEditorStore.getState().setClipSpeed(clip.id, spd)}
                  >
                    {spd}x
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
                suffix="x"
                onChange={(spd) => useEditorStore.getState().setClipSpeed(clip.id, spd)}
              />
              <div className="clip-info" style={{ marginTop: "12px", border: "1px solid #333", padding: "10px", borderRadius: "5px", background: "#1f1f1f" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span className="muted">{t("timeline.duration")}:</span>
                  <span style={{ fontWeight: 600 }}>{formatTime(clip.duration, project.fps)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="muted">{t("inspector.tabSpeed")}:</span>
                  <span style={{ color: "#a78bfa", fontWeight: 600 }}>{clip.speed.toFixed(2)}x</span>
                </div>
              </div>
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
              <h3>{t("keyframes.title")}</h3>
              <p className="field-hint">{t("keyframes.hint")}</p>
              <div className="keyframe-add">
                {(["x", "y", "scale", "rotation", "opacity", "volume"] as const)
                  .filter((property) => visual || property === "volume")
                  .map((property) => (
                    <button
                      key={property}
                      onClick={() =>
                        key(
                          property,
                          property === "volume"
                            ? evaluated.volume
                            : evaluated.transform[property],
                        )
                      }
                    >
                      <Diamond size={11} />
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
                    </button>
                  ))}
              </div>
              {!clip.keyframes.length && (
                <div className="quiet-empty">{t("keyframes.empty")}</div>
              )}
              {[...clip.keyframes]
                .sort((a, b) => a.time - b.time)
                .map((k) => (
                  <div key={k.id} className="keyframe-row">
                    <button
                      className="keyframe-time"
                      onClick={() =>
                        useEditorStore.getState().seek(clip.start + k.time)
                      }
                    >
                      {formatTime(k.time, project.fps)}
                    </button>
                    <span>{k.property}</span>
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
                    <button
                      aria-label={t("keyframes.delete")}
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
            </>
          )}
        </fieldset>
      </div>
    </aside>
  );
}
