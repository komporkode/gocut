import { useState } from "react";
import {
  Check,
  ChevronRight,
  Film,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Waves,
} from "lucide-react";
import type { Adjustments, Clip, TrackKind, Project } from "../core/types";
import { DEFAULT_ADJUSTMENTS } from "../core/defaults";
import "./EffectsPanel.css";
import { MotionLibrary } from "./CreativeLibrary";
import { motionPatch } from "../core/creativePresets";
import PresetPreview from "./PresetPreview";
import { useTranslation, type TranslationKey } from "../i18n";

export interface EffectsPanelProps {
  clip?: Clip;
  project?: Pick<Project, "width" | "height">;
  kind?: TrackKind;
  locked?: boolean;
  onApply: (patch: Partial<Clip>) => void;
}
export interface ColorPreset {
  id: string;
  name: string;
  description: string;
  colors: string;
  adjustments: Partial<Adjustments>;
}
export const COLOR_PRESETS: ColorPreset[] = [
  {
    id: "original",
    name: "Original",
    description: "Natural colors without color grading",
    colors: "#526658,#baac84,#65828d",
    adjustments: { ...DEFAULT_ADJUSTMENTS },
  },
  {
    id: "cinema",
    name: "Cinematic",
    description: "Deep contrast with subtle moody saturation",
    colors: "#243744,#b49868,#406d7a",
    adjustments: {
      brightness: -0.04,
      contrast: 1.22,
      saturation: 0.78,
      temperature: -0.08,
      blur: 0,
    },
  },
  {
    id: "warm",
    name: "Warm Sunlight",
    description: "Warm and bright, perfect for daily vlogs",
    colors: "#927b51,#ead092,#c4a570",
    adjustments: {
      brightness: 0.05,
      contrast: 1.05,
      saturation: 1.1,
      temperature: 0.3,
      blur: 0,
    },
  },
  {
    id: "cool",
    name: "Cool Blue",
    description: "Crisp and cool tones, highlighting depth",
    colors: "#2c5367,#86acbc,#55788e",
    adjustments: {
      brightness: 0.015,
      contrast: 1.12,
      saturation: 0.9,
      temperature: -0.35,
      blur: 0,
    },
  },
  {
    id: "mono",
    name: "Monochrome",
    description: "Timeless black and white with rich highlights",
    colors: "#343839,#bebdb4,#6d7270",
    adjustments: {
      brightness: 0,
      contrast: 1.15,
      saturation: 0,
      temperature: 0,
      blur: 0,
    },
  },
  {
    id: "vintage",
    name: "Vintage Film",
    description: "Warm faded tones reminiscent of classic analog film",
    colors: "#686a4c,#c5b680,#8c987d",
    adjustments: {
      brightness: 0.045,
      contrast: 0.86,
      saturation: 0.72,
      temperature: 0.22,
      blur: 0,
    },
  },
  {
    id: "vivid",
    name: "Vivid",
    description: "High vibrancy and rich color saturation",
    colors: "#45836b,#f6cf72,#679baa",
    adjustments: {
      brightness: 0.02,
      contrast: 1.1,
      saturation: 1.45,
      temperature: 0,
      blur: 0,
    },
  },
  {
    id: "soft",
    name: "Soft Focus",
    description: "Gently softened details creating a dreamy glow",
    colors: "#8d9d9b,#d6c9af,#a4aeb9",
    adjustments: {
      brightness: 0.03,
      contrast: 0.95,
      saturation: 0.9,
      temperature: 0.05,
      blur: 2,
    },
  },
];
export function presetPatch(preset: ColorPreset, clip?: Clip): Partial<Clip> {
  return {
    adjustments: {
      ...DEFAULT_ADJUSTMENTS,
      ...clip?.adjustments,
      ...preset.adjustments,
    },
  };
}
export function fadePatch(
  kind: "visual" | "audio",
  direction: "in" | "out" | "both" | "none",
  seconds: number,
  duration = Infinity,
): Partial<Clip> {
  const value = Math.max(
    0,
    Math.min(seconds, duration / (direction === "both" ? 2 : 1)),
  );
  const incoming = direction === "in" || direction === "both" ? value : 0;
  const outgoing = direction === "out" || direction === "both" ? value : 0;
  return kind === "visual"
    ? { fadeIn: incoming, fadeOut: outgoing }
    : { audioFadeIn: incoming, audioFadeOut: outgoing };
}
export default function EffectsPanel({
  clip,
  project = { width: 1920, height: 1080 },
  kind,
  locked = false,
  onApply,
}: EffectsPanelProps) {
  const [tab, setTab] = useState<"color" | "fade" | "motion">("color");
  const [seconds, setSeconds] = useState(0.5);
  const [query, setQuery] = useState("");
  const active = COLOR_PRESETS.find((p) =>
    Object.entries(p.adjustments).every(
      ([key, value]) =>
        Math.abs(clip?.adjustments[key as keyof Adjustments]! - Number(value)) <
        0.001,
    ),
  );
  const { t } = useTranslation();
  const getPresetName = (p: ColorPreset) => {
    const key = (`effects.preset.${p.id}.name`) as TranslationKey;
    return t(key) || p.name;
  };
  const getPresetDesc = (p: ColorPreset) => {
    const key = (`effects.preset.${p.id}.desc`) as TranslationKey;
    return t(key) || p.description;
  };
  const disabled = !clip || locked;
  const colorDisabled = disabled || kind === "audio" || kind === "text";
  return (
    <section className="effects-panel" aria-label={t("effects.library")}>
      <div className="effects-title">
        <Sparkles size={15} />
        <strong>{t("effects.title")}</strong>
        <span>{t("effects.localProcessing")}</span>
      </div>
      <div className="effects-tabs" role="tablist" aria-label={t("effects.type")}>
        <button
          role="tab"
          aria-selected={tab === "color"}
          className={tab === "color" ? "is-active" : ""}
          onClick={() => setTab("color")}
        >
          <SlidersHorizontal size={13} /> {t("effects.colorPresets")}
        </button>
        <button
          role="tab"
          aria-selected={tab === "motion"}
          className={tab === "motion" ? "is-active" : ""}
          onClick={() => setTab("motion")}
        >
          <Sparkles size={13} /> {t("effects.motionEffects")}
        </button>
        <button
          role="tab"
          aria-selected={tab === "fade"}
          className={tab === "fade" ? "is-active" : ""}
          onClick={() => setTab("fade")}
        >
          <Waves size={13} /> {t("effects.fade")}
        </button>
      </div>
      <div className="effects-content">
        <div className={`effects-selection ${disabled ? "is-empty" : ""}`}>
          <Film size={14} />
          <span>
            {clip
              ? `${clip.name}${locked ? ` · ${t("timeline.trackLocked")}` : ""}`
              : t("effects.selectClipPrompt")}
          </span>
          {clip && <ChevronRight size={12} />}
        </div>
        {tab === "motion" ? (
          <MotionLibrary
            disabled={disabled || kind === "audio"}
            onApply={(motion) => {
              if (clip) onApply(motionPatch(clip, motion, project));
            }}
          />
        ) : tab === "color" ? (
          <>
            <p className="effects-help">
              {kind === "audio"
                ? t("effects.helpAudio")
                : kind === "text"
                  ? t("effects.helpText")
                  : t("effects.helpVideo")}
            </p>
            <label className="creative-search">
              <input
                aria-label={t("effects.searchColor")}
                placeholder={t("effects.searchColor")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="effects-grid">
              {COLOR_PRESETS.filter((p) =>
                (p.name + p.description).includes(query.trim()),
              ).map((preset) => (
                <article
                  className="creative-card is-draggable"
                  key={preset.id}
                  data-preset-id={preset.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/x-gocut-effect", JSON.stringify(preset.adjustments));
                    e.dataTransfer.setData("application/x-reacut-effect", JSON.stringify(preset.adjustments));
                    e.dataTransfer.setData("text/plain", getPresetName(preset));
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                >
                  <PresetPreview
                    adjustments={preset.adjustments}
                    label={getPresetName(preset)}
                  />
                  <div>
                    <span>
                      {getPresetName(preset)}
                      <small>{getPresetDesc(preset)}</small>
                    </span>
                    <button
                      disabled={colorDisabled}
                      onClick={() => onApply(presetPatch(preset, clip))}
                      aria-label={`${t("effects.apply")} ${getPresetName(preset)}`}
                      aria-pressed={!!clip && active?.id === preset.id}
                    >
                      <Check size={12} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <button
              className="effects-reset"
              disabled={colorDisabled}
              onClick={() =>
                onApply({ adjustments: { ...DEFAULT_ADJUSTMENTS } })
              }
            >
              <RotateCcw size={12} /> {t("inspector.reset")}
            </button>
          </>
        ) : (
          <>
            <p className="effects-help">{t("effects.fadeHelp")}</p>
            <label className="effects-duration">
              <span>{t("effects.fadeDuration")}</span>
              <input
                aria-label={t("effects.fadeDuration")}
                type="number"
                min="0.05"
                max="10"
                step="0.05"
                value={seconds}
                onChange={(event) => {
                  const n = Number(event.target.value);
                  if (Number.isFinite(n))
                    setSeconds(Math.max(0.05, Math.min(10, n)));
                }}
              />
              <span>s</span>
            </label>
            {(["visual", "audio"] as const)
              .filter((channel) =>
                channel === "visual" ? kind !== "audio" : kind !== "text",
              )
              .map((kind) => (
                <div className="effects-fade-group" key={kind}>
                  <h3>
                    {kind === "visual" ? t("inspector.tabVideo") : t("inspector.tabAudio")}
                    <span>
                      {clip
                        ? `${kind === "visual" ? clip.fadeIn.toFixed(2) : clip.audioFadeIn.toFixed(2)}s / ${kind === "visual" ? clip.fadeOut.toFixed(2) : clip.audioFadeOut.toFixed(2)}s`
                        : `${t("effects.fadeIn")} / ${t("effects.fadeOut")}`}
                    </span>
                  </h3>
                  <div className="effects-fade-grid">
                    {(["in", "out", "both"] as const).map((direction) => (
                      <button
                        key={direction}
                        disabled={disabled}
                        onClick={() =>
                          onApply(
                            fadePatch(kind, direction, seconds, clip?.duration),
                          )
                        }
                      >
                        <span
                          className={`effects-fade-shape shape-${direction}`}
                        />
                        <span>
                          {direction === "in"
                            ? "淡入"
                            : direction === "out"
                              ? "淡出"
                              : "淡入淡出"}
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    className="effects-reset"
                    disabled={disabled}
                    onClick={() => onApply(fadePatch(kind, "none", 0))}
                  >
                    <RotateCcw size={11} /> 移除
                    {kind === "visual" ? "画面" : "声音"}淡入淡出
                  </button>
                </div>
              ))}
            <p className="effects-note">{t("effects.fadeConstraint")}</p>
          </>
        )}
      </div>
      <div className="effects-footer">
        <Check size={11} /> {t("effects.paramConsistency")}
      </div>
    </section>
  );
}
