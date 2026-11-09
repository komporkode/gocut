import { useState } from "react";
import {
  Check,
  ChevronRight,
  Film,
  Layers,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  WandSparkles,
  Waves,
} from "lucide-react";
import type {
  Adjustments,
  BlurEffect,
  Clip,
  ClipEffects,
  FilmGrainEffect,
  Project,
  StylizeEffect,
  TrackKind,
} from "../core/types";
import {
  DEFAULT_ADJUSTMENTS,
  DEFAULT_BLUR_EFFECT,
  DEFAULT_CLIP_EFFECTS,
  DEFAULT_FILM_GRAIN,
  DEFAULT_STYLIZE_EFFECT,
} from "../core/defaults";
import "./EffectsPanel.css";
import "./CreativeLibrary.css";
import { MotionLibrary } from "./CreativeLibrary";
import { motionPatch } from "../core/creativePresets";
import PresetPreview from "./PresetPreview";
import { useEditorStore } from "../editor/store";
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

export type PresetEffects = {
  grain?: Partial<FilmGrainEffect>;
  blur?: Partial<BlurEffect>;
  stylize?: Partial<StylizeEffect>;
};

export interface FilmGrainPresetCard {
  id: string;
  name: string;
  subtitle: string;
  badge: string;
  effects: PresetEffects;
  adjustments?: Partial<Adjustments>;
}

export const FILM_GRAIN_PRESETS: FilmGrainPresetCard[] = [
  {
    id: "kodak-35mm",
    name: "Kodak 35mm",
    subtitle: "Vision3 500T warm celluloid",
    badge: "🎬",
    effects: {
      grain: {
        enabled: true,
        preset: "kodak-35mm",
        engine: "analog",
        movement: "dynamic",
        intensity: 32,
        grainSize: "medium",
        protectHighlights: true,
        chromaticDispersion: true,
      },
    },
    adjustments: { temperature: 0.08, contrast: 1.05 },
  },
  {
    id: "fuji-eterna",
    name: "Fuji Eterna",
    subtitle: "Cool pastel 250D soft grain",
    badge: "🎞️",
    effects: {
      grain: {
        enabled: true,
        preset: "fuji-eterna",
        engine: "analog",
        movement: "dynamic",
        intensity: 24,
        grainSize: "fine",
        protectHighlights: true,
        chromaticDispersion: true,
      },
    },
    adjustments: { temperature: -0.06, saturation: 0.92 },
  },
  {
    id: "16mm-analog",
    name: "16mm Analog",
    subtitle: "Vintage celluloid texture",
    badge: "📽️",
    effects: {
      grain: {
        enabled: true,
        preset: "16mm-analog",
        engine: "analog",
        movement: "dynamic",
        intensity: 46,
        grainSize: "coarse",
        protectHighlights: true,
        chromaticDispersion: true,
      },
    },
    adjustments: { contrast: 1.12, brightness: -0.02 },
  },
  {
    id: "super-8mm",
    name: "Super 8mm",
    subtitle: "Heavy nostalgic archival grit",
    badge: "🎥",
    effects: {
      grain: {
        enabled: true,
        preset: "super-8mm",
        engine: "analog",
        movement: "dynamic",
        intensity: 64,
        grainSize: "heavy",
        protectHighlights: true,
        chromaticDispersion: false,
      },
    },
    adjustments: { contrast: 1.18, brightness: -0.04 },
  },
  {
    id: "prnu-cloak",
    name: "PRNU Cloak",
    subtitle: "Samarkan sensor kamera",
    badge: "🛡️",
    effects: {
      grain: {
        enabled: true,
        preset: "prnu-cloak",
        engine: "digital",
        movement: "static",
        intensity: 18,
        grainSize: "micro",
        protectHighlights: true,
        chromaticDispersion: true,
      },
    },
  },
  {
    id: "high-iso",
    name: "High-ISO CMOS",
    subtitle: "Low-light ISO 6400 noise",
    badge: "📷",
    effects: {
      grain: {
        enabled: true,
        preset: "high-iso",
        engine: "digital",
        movement: "dynamic",
        intensity: 42,
        grainSize: "fine",
        protectHighlights: false,
        chromaticDispersion: true,
      },
    },
  },
  {
    id: "micro-dither",
    name: "Micro Dither",
    subtitle: "Steganographic dither texture",
    badge: "🔬",
    effects: {
      grain: {
        enabled: true,
        preset: "micro-dither",
        engine: "digital",
        movement: "static",
        intensity: 22,
        grainSize: "micro",
        protectHighlights: true,
        chromaticDispersion: false,
      },
    },
  },
  {
    id: "crt-vhs",
    name: "CRT / VHS",
    subtitle: "Broadcast analog tape scan",
    badge: "📺",
    effects: {
      grain: {
        enabled: true,
        preset: "crt-vhs",
        engine: "analog",
        movement: "dynamic",
        intensity: 52,
        grainSize: "coarse",
        protectHighlights: false,
        chromaticDispersion: true,
      },
      stylize: {
        enabled: true,
        scanlines: 35,
        vignette: 20,
      },
    },
  },
  {
    id: "70mm-imax",
    name: "70mm IMAX",
    subtitle: "Ultra-fine subtle grain",
    badge: "🏛️",
    effects: {
      grain: {
        enabled: true,
        preset: "kodak-35mm",
        engine: "analog",
        movement: "dynamic",
        intensity: 16,
        grainSize: "fine",
        protectHighlights: true,
        chromaticDispersion: true,
      },
    },
  },
  {
    id: "noir-bw",
    name: "Noir B&W",
    subtitle: "Monochrome high-contrast grain",
    badge: "🎞️",
    effects: {
      grain: {
        enabled: true,
        preset: "16mm-analog",
        engine: "analog",
        movement: "dynamic",
        intensity: 48,
        grainSize: "coarse",
        protectHighlights: true,
        chromaticDispersion: false,
      },
    },
    adjustments: { saturation: -1, contrast: 1.25 },
  },
];

export interface StylizePresetCard {
  id: string;
  name: string;
  subtitle: string;
  badge: string;
  effects: PresetEffects;
}

export const BLUR_STYLIZE_PRESETS: StylizePresetCard[] = [
  {
    id: "gaussian-soft",
    name: "Gaussian Blur",
    subtitle: "Blur lensa halus universal",
    badge: "💧",
    effects: { blur: { enabled: true, type: "gaussian", radius: 15, angle: 0 } },
  },
  {
    id: "motion-whip",
    name: "Motion Blur",
    subtitle: "Blur gerak arah dinamis 0°",
    badge: "💨",
    effects: { blur: { enabled: true, type: "motion", radius: 20, angle: 0 } },
  },
  {
    id: "radial-zoom",
    name: "Radial Zoom",
    subtitle: "Zoom burst dari titik tengah",
    badge: "🌀",
    effects: { blur: { enabled: true, type: "radial", radius: 25, angle: 0 } },
  },
  {
    id: "cinema-vignette",
    name: "Cinema Vignette",
    subtitle: "Tepi gelap fokus sinematik",
    badge: "🌑",
    effects: { stylize: { enabled: true, vignette: 60 } },
  },
  {
    id: "rgb-glitch",
    name: "RGB Split",
    subtitle: "Chromatic aberration glitch",
    badge: "🌈",
    effects: { stylize: { enabled: true, chromaticAberration: 18 } },
  },
  {
    id: "crt-scanlines",
    name: "CRT Scanlines",
    subtitle: "Garis TV tabung analog",
    badge: "📺",
    effects: { stylize: { enabled: true, scanlines: 50, vignette: 30 } },
  },
  {
    id: "halation-bloom",
    name: "Halation Bloom",
    subtitle: "Pendar highlight lembut",
    badge: "✨",
    effects: { stylize: { enabled: true, bloom: 55 } },
  },
  {
    id: "crisp-sharpen",
    name: "Crisp Sharpen",
    subtitle: "Pertajam detail tepi & kontur",
    badge: "🔪",
    effects: { stylize: { enabled: true, sharpen: 50 } },
  },
  {
    id: "tilt-shift",
    name: "Tilt-Shift",
    subtitle: "Efek miniatur depth of field",
    badge: "📷",
    effects: {
      blur: { enabled: true, type: "gaussian", radius: 25, angle: 0 },
      stylize: { enabled: true, vignette: 35 },
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

export function resolveEffects(clip?: Clip): Required<ClipEffects> {
  return {
    grain: { ...DEFAULT_FILM_GRAIN, ...(clip?.effects?.grain ?? {}) },
    blur: { ...DEFAULT_BLUR_EFFECT, ...(clip?.effects?.blur ?? {}) },
    stylize: { ...DEFAULT_STYLIZE_EFFECT, ...(clip?.effects?.stylize ?? {}) },
  };
}

export default function EffectsPanel({
  clip,
  project = { width: 1920, height: 1080 },
  kind,
  locked = false,
  onApply,
}: EffectsPanelProps) {
  const [tab, setTab] = useState<
    "grain" | "blurStylize" | "color" | "motion" | "fade"
  >("grain");
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
    const key = `effects.preset.${p.id}.name` as TranslationKey;
    return t(key) || p.name;
  };
  const getPresetDesc = (p: ColorPreset) => {
    const key = `effects.preset.${p.id}.desc` as TranslationKey;
    return t(key) || p.description;
  };
  const disabled = !clip || locked;
  const colorDisabled = disabled || kind === "audio" || kind === "text";

  const eff = resolveEffects(clip);
  const applyOrCreateAdjustment = (patch: Partial<Clip>, label?: string) => {
    if (clip && !locked && kind !== "audio") {
      onApply(patch);
    } else {
      useEditorStore
        .getState()
        .addAdjustmentLayer(undefined, 5, {
          ...patch,
          name: label || "Adjustment Layer",
        });
    }
  };

  const updateGrain = (grainPatch: Partial<FilmGrainEffect>, label?: string) => {
    const nextGrain: FilmGrainEffect = {
      ...eff.grain,
      enabled: true,
      ...grainPatch,
    };
    applyOrCreateAdjustment(
      {
        effects: {
          ...eff,
          grain: nextGrain,
        },
      },
      label,
    );
  };

  const updateBlur = (blurPatch: Partial<BlurEffect>, label?: string) => {
    const nextBlur: BlurEffect = {
      ...eff.blur,
      enabled: true,
      ...blurPatch,
    };
    if (nextBlur.radius <= 0 && blurPatch.enabled === undefined) {
      nextBlur.enabled = false;
    }
    applyOrCreateAdjustment(
      {
        effects: {
          ...eff,
          blur: nextBlur,
        },
      },
      label,
    );
  };

  const updateStylize = (
    stylizePatch: Partial<StylizeEffect>,
    label?: string,
  ) => {
    const nextStylize: StylizeEffect = {
      ...eff.stylize,
      enabled: true,
      ...stylizePatch,
    };
    applyOrCreateAdjustment(
      {
        effects: {
          ...eff,
          stylize: nextStylize,
        },
      },
      label,
    );
  };

  return (
    <section className="effects-panel" aria-label={t("effects.library")}>
      <div className="effects-title">
        <Sparkles size={15} />
        <strong>{t("effects.title")}</strong>
        <button
          type="button"
          className="effects-add-adjustment-btn"
          title="Tambahkan Adjustment Layer di timeline untuk menerapkan efek ke semua track di bawahnya"
          onClick={() =>
            useEditorStore.getState().addAdjustmentLayer(undefined, 5)
          }
        >
          <Plus size={12} />
          <Layers size={12} />
          <span>Adjustment Layer</span>
        </button>
      </div>
      <div className="effects-tabs" role="tablist" aria-label={t("effects.type")}>
        <button
          role="tab"
          aria-selected={tab === "grain"}
          className={tab === "grain" ? "is-active" : ""}
          onClick={() => setTab("grain")}
        >
          <Film size={13} /> Film Grain
        </button>
        <button
          role="tab"
          aria-selected={tab === "blurStylize"}
          className={tab === "blurStylize" ? "is-active" : ""}
          onClick={() => setTab("blurStylize")}
        >
          <WandSparkles size={13} /> Blur & Stylize
        </button>
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
              ? `${clip.name}${clip.isAdjustmentLayer ? " · Adjustment Layer" : ""}${locked ? ` · ${t("timeline.trackLocked")}` : ""}`
              : "Klik atau tarik efek ke klip / timeline (otomatis buat Adjustment Layer)"}
          </span>
          {clip && <ChevronRight size={12} />}
        </div>

        {tab === "grain" ? (
          <>
            <p className="effects-help">
              Pilih preset Film Grain untuk diterapkan ke klip atau drag ke timeline sebagai Adjustment Layer. Kontrol slider detail ada di panel Inspector (kanan).
            </p>
            <label className="creative-search">
              <Search size={14} />
              <input
                aria-label="Cari Preset Film Grain"
                placeholder="Cari Preset Film Grain (Kodak, Fuji, 16mm, Super 8...)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="creative-grid">
              {FILM_GRAIN_PRESETS.filter((p) =>
                (p.name + p.subtitle).toLowerCase().includes(query.trim().toLowerCase()),
              ).map((preset) => {
                const isSelected =
                  eff.grain.enabled && eff.grain.preset === preset.effects.grain?.preset;
                const payload = {
                  name: `Grain · ${preset.name}`,
                  effects: {
                    ...DEFAULT_CLIP_EFFECTS,
                    grain: {
                      ...DEFAULT_FILM_GRAIN,
                      ...(preset.effects.grain ?? {}),
                    },
                    blur: {
                      ...DEFAULT_BLUR_EFFECT,
                      ...(preset.effects.blur ?? {}),
                    },
                    stylize: {
                      ...DEFAULT_STYLIZE_EFFECT,
                      ...(preset.effects.stylize ?? {}),
                    },
                  },
                  adjustments: preset.adjustments,
                };
                return (
                  <article
                    className="creative-card is-draggable"
                    key={preset.id}
                    data-preset-id={preset.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        "application/x-gocut-effect",
                        JSON.stringify(payload),
                      );
                      e.dataTransfer.setData(
                        "application/x-reacut-effect",
                        JSON.stringify(payload),
                      );
                      e.dataTransfer.setData("text/plain", preset.name);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                  >
                    <PresetPreview
                      effects={payload.effects}
                      adjustments={preset.adjustments}
                      label={preset.name}
                    />
                    <div>
                      <span>
                        {preset.badge} {preset.name}
                        <small>{preset.subtitle}</small>
                      </span>
                      <button
                        type="button"
                        title="Terapkan ke klip atau tambahkan sebagai Adjustment Layer"
                        onClick={() =>
                          applyOrCreateAdjustment(
                            {
                              effects: {
                                ...eff,
                                grain: {
                                  ...eff.grain,
                                  enabled: true,
                                  ...(preset.effects.grain ?? {}),
                                },
                              },
                              ...(preset.adjustments
                                ? {
                                    adjustments: {
                                      ...DEFAULT_ADJUSTMENTS,
                                      ...clip?.adjustments,
                                      ...preset.adjustments,
                                    },
                                  }
                                : {}),
                            },
                            `Grain · ${preset.name}`,
                          )
                        }
                      >
                        {isSelected ? <Check size={14} /> : <Plus size={14} />}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            <button
              type="button"
              className="effects-reset"
              disabled={!clip || !eff.grain.enabled}
              onClick={() =>
                onApply({
                  effects: {
                    ...eff,
                    grain: { ...DEFAULT_FILM_GRAIN, enabled: false },
                  },
                })
              }
            >
              <RotateCcw size={12} /> Reset Film Grain
            </button>
          </>
        ) : tab === "blurStylize" ? (
          <>
            <p className="effects-help">
              Pilih preset Blur & Stylize untuk diterapkan ke klip atau drag ke timeline sebagai Adjustment Layer. Kontrol slider detail ada di panel Inspector (kanan).
            </p>
            <label className="creative-search">
              <Search size={14} />
              <input
                aria-label="Cari Preset Blur & Stylize"
                placeholder="Cari Preset Blur & Stylize (Gaussian, Motion, Glitch...)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="creative-grid">
              {BLUR_STYLIZE_PRESETS.filter((p) =>
                (p.name + p.subtitle).toLowerCase().includes(query.trim().toLowerCase()),
              ).map((preset) => {
                const isSelected =
                  (preset.effects.blur?.enabled && eff.blur.enabled && eff.blur.type === preset.effects.blur.type) ||
                  (preset.effects.stylize?.enabled && eff.stylize.enabled);
                const payload = {
                  name: preset.name,
                  effects: {
                    ...DEFAULT_CLIP_EFFECTS,
                    blur: {
                      ...DEFAULT_BLUR_EFFECT,
                      ...(preset.effects.blur ?? {}),
                    },
                    stylize: {
                      ...DEFAULT_STYLIZE_EFFECT,
                      ...(preset.effects.stylize ?? {}),
                    },
                  },
                };
                return (
                  <article
                    className="creative-card is-draggable"
                    key={preset.id}
                    data-preset-id={preset.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        "application/x-gocut-effect",
                        JSON.stringify(payload),
                      );
                      e.dataTransfer.setData(
                        "application/x-reacut-effect",
                        JSON.stringify(payload),
                      );
                      e.dataTransfer.setData("text/plain", preset.name);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                  >
                    <PresetPreview
                      effects={payload.effects}
                      label={preset.name}
                    />
                    <div>
                      <span>
                        {preset.badge} {preset.name}
                        <small>{preset.subtitle}</small>
                      </span>
                      <button
                        type="button"
                        title="Terapkan ke klip atau tambahkan sebagai Adjustment Layer"
                        onClick={() => {
                          const nextBlur = preset.effects.blur
                            ? { ...eff.blur, ...preset.effects.blur, enabled: true }
                            : eff.blur;
                          const nextStylize = preset.effects.stylize
                            ? { ...eff.stylize, ...preset.effects.stylize, enabled: true }
                            : eff.stylize;
                          applyOrCreateAdjustment(
                            {
                              effects: {
                                ...eff,
                                blur: nextBlur,
                                stylize: nextStylize,
                              },
                            },
                            preset.name,
                          );
                        }}
                      >
                        {isSelected ? <Check size={14} /> : <Plus size={14} />}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            <button
              type="button"
              className="effects-reset"
              disabled={!clip || (!eff.blur.enabled && !eff.stylize.enabled)}
              onClick={() =>
                onApply({
                  effects: {
                    ...eff,
                    blur: { ...DEFAULT_BLUR_EFFECT, enabled: false },
                    stylize: { ...DEFAULT_STYLIZE_EFFECT, enabled: false },
                  },
                })
              }
            >
              <RotateCcw size={12} /> Reset Blur & Stylize
            </button>
          </>
        ) : tab === "motion" ? (
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
                (p.name + p.description)
                  .toLowerCase()
                  .includes(query.trim().toLowerCase()),
              ).map((preset) => (
                <article
                  className="creative-card is-draggable"
                  key={preset.id}
                  data-preset-id={preset.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      "application/x-gocut-effect",
                      JSON.stringify(preset.adjustments),
                    );
                    e.dataTransfer.setData(
                      "application/x-reacut-effect",
                      JSON.stringify(preset.adjustments),
                    );
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
                      disabled={colorDisabled && !clip}
                      onClick={() =>
                        applyOrCreateAdjustment(
                          presetPatch(preset, clip),
                          `Color · ${getPresetName(preset)}`,
                        )
                      }
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
                    {kind === "visual"
                      ? t("inspector.tabVideo")
                      : t("inspector.tabAudio")}
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
