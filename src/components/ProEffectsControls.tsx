import React, { useState } from "react";
import {
  Check,
  ChevronDown,
  CircleDot,
  Droplets,
  Eye,
  EyeOff,
  Film,
  Flame,
  Layers,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Tv,
  WandSparkles,
} from "lucide-react";
import type {
  BlurEffect,
  Clip,
  ClipEffects,
  FilmGrainEffect,
  StylizeEffect,
} from "../core/types";
import {
  DEFAULT_BLUR_EFFECT,
  DEFAULT_CLIP_EFFECTS,
  DEFAULT_FILM_GRAIN,
  DEFAULT_STYLIZE_EFFECT,
} from "../core/defaults";
import { GRAIN_PRESETS, grainPresetConfig } from "../core/effectsEngine";
import { resolveEffects } from "./EffectsPanel";

export interface ActiveEffectsInspectorProps {
  clip: Clip;
  onUpdate: (patch: Partial<Clip>) => void;
}

export function ActiveEffectsInspector({
  clip,
  onUpdate,
}: ActiveEffectsInspectorProps) {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const eff = resolveEffects(clip);

  // Deteksi efek mana saja yang aktif pada klip ini
  const rawEffects = clip.effects;
  const nameLower = (clip.name || "").toLowerCase();

  const hasGrain = Boolean(
    (rawEffects?.grain && (rawEffects.grain.enabled || rawEffects.grain.intensity > 0)) ||
      nameLower.includes("grain") ||
      nameLower.includes("kodak") ||
      nameLower.includes("fuji") ||
      nameLower.includes("16mm") ||
      nameLower.includes("super 8"),
  );

  const hasBlur = Boolean(
    (rawEffects?.blur && (rawEffects.blur.enabled || rawEffects.blur.radius > 0)) ||
      nameLower.includes("blur") ||
      nameLower.includes("tilt-shift"),
  );

  const hasVignette = Boolean(
    (rawEffects?.stylize?.vignette !== undefined && rawEffects.stylize.vignette > 0) ||
      nameLower.includes("vignette"),
  );

  const hasChromatic = Boolean(
    (rawEffects?.stylize?.chromaticAberration !== undefined &&
      rawEffects.stylize.chromaticAberration > 0) ||
      nameLower.includes("rgb") ||
      nameLower.includes("chromatic") ||
      nameLower.includes("glitch"),
  );

  const hasScanlines = Boolean(
    (rawEffects?.stylize?.scanlines !== undefined && rawEffects.stylize.scanlines > 0) ||
      nameLower.includes("scanlines") ||
      nameLower.includes("crt"),
  );

  const hasBloom = Boolean(
    (rawEffects?.stylize?.bloom !== undefined && rawEffects.stylize.bloom > 0) ||
      nameLower.includes("bloom") ||
      nameLower.includes("halation"),
  );

  const hasSharpen = Boolean(
    (rawEffects?.stylize?.sharpen !== undefined && rawEffects.stylize.sharpen > 0) ||
      nameLower.includes("sharpen"),
  );

  const activeCount =
    (hasGrain ? 1 : 0) +
    (hasBlur ? 1 : 0) +
    (hasVignette ? 1 : 0) +
    (hasChromatic ? 1 : 0) +
    (hasScanlines ? 1 : 0) +
    (hasBloom ? 1 : 0) +
    (hasSharpen ? 1 : 0);

  // Update handlers
  const updateGrain = (patch: Partial<FilmGrainEffect>) => {
    onUpdate({
      effects: {
        ...eff,
        grain: { ...eff.grain, enabled: true, ...patch },
      },
    });
  };

  const toggleGrain = () => {
    onUpdate({
      effects: {
        ...eff,
        grain: { ...eff.grain, enabled: !eff.grain.enabled },
      },
    });
  };

  const removeGrain = () => {
    onUpdate({
      effects: {
        ...eff,
        grain: { ...DEFAULT_FILM_GRAIN, enabled: false, intensity: 0 },
      },
    });
  };

  const updateBlur = (patch: Partial<BlurEffect>) => {
    onUpdate({
      effects: {
        ...eff,
        blur: { ...eff.blur, enabled: true, ...patch },
      },
    });
  };

  const toggleBlur = () => {
    onUpdate({
      effects: {
        ...eff,
        blur: { ...eff.blur, enabled: !eff.blur.enabled },
      },
    });
  };

  const removeBlur = () => {
    onUpdate({
      effects: {
        ...eff,
        blur: { ...DEFAULT_BLUR_EFFECT, enabled: false, radius: 0 },
      },
    });
  };

  const updateStylize = (patch: Partial<StylizeEffect>) => {
    onUpdate({
      effects: {
        ...eff,
        stylize: { ...eff.stylize, enabled: true, ...patch },
      },
    });
  };

  const removeStylizeItem = (key: keyof StylizeEffect) => {
    const nextStylize = { ...eff.stylize, [key]: 0 };
    const hasRemaining =
      nextStylize.vignette > 0 ||
      nextStylize.chromaticAberration > 0 ||
      nextStylize.scanlines > 0 ||
      nextStylize.bloom > 0 ||
      nextStylize.sharpen > 0;
    onUpdate({
      effects: {
        ...eff,
        stylize: { ...nextStylize, enabled: hasRemaining },
      },
    });
  };

  const resetAllEffects = () => {
    onUpdate({
      effects: {
        grain: { ...DEFAULT_FILM_GRAIN, enabled: false, intensity: 0 },
        blur: { ...DEFAULT_BLUR_EFFECT, enabled: false, radius: 0 },
        stylize: { ...DEFAULT_STYLIZE_EFFECT, enabled: false },
      },
    });
  };

  return (
    <div className="active-effects-suite">
      <div className="active-effects-header">
        <h3 className="active-effects-heading">
          <WandSparkles size={14} />
          <span>Pengaturan Efek</span>
          {activeCount > 0 && (
            <span className="active-effects-count">{activeCount} Aktif</span>
          )}
        </h3>
        {activeCount > 0 && (
          <button
            type="button"
            className="active-effects-reset-btn"
            title="Reset semua efek pada klip ini"
            onClick={resetAllEffects}
          >
            <RotateCcw size={11} /> Reset Semua
          </button>
        )}
      </div>

      {activeCount === 0 ? (
        <div className="active-effects-empty">
          <WandSparkles size={26} />
          <strong>Tidak Ada Efek Aktif</strong>
          <p>
            Klip ini belum memiliki efek. Klik tombol di bawah atau seret efek dari
            panel Efek di sebelah kiri.
          </p>
        </div>
      ) : (
        <div className="active-effects-list">
          {/* 1. Film Grain Card */}
          {hasGrain && (
            <div
              className={`active-effect-card ${
                !eff.grain.enabled ? "is-disabled" : ""
              }`}
            >
              <div className="active-effect-card-header">
                <div className="active-effect-card-title">
                  <Film size={14} />
                  <strong>Film Grain</strong>
                  {eff.grain.preset && (
                    <span className="effect-preset-tag">{eff.grain.preset}</span>
                  )}
                </div>
                <div className="active-effect-card-actions">
                  <button
                    type="button"
                    className={`active-effect-btn ${
                      eff.grain.enabled ? "is-active" : ""
                    }`}
                    title={
                      eff.grain.enabled
                        ? "Nonaktifkan Film Grain"
                        : "Aktifkan Film Grain"
                    }
                    onClick={toggleGrain}
                  >
                    {eff.grain.enabled ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                  <button
                    type="button"
                    className="active-effect-btn btn-delete"
                    title="Hapus Efek Film Grain"
                    onClick={removeGrain}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              {eff.grain.enabled && (
                <div className="active-effect-card-body">
                  <div className="grain-control-row">
                    <span className="grain-control-label">MESIN NOISE</span>
                    <div className="grain-segmented">
                      <button
                        type="button"
                        className={eff.grain.engine === "analog" ? "is-active" : ""}
                        onClick={() => updateGrain({ engine: "analog" })}
                      >
                        Analog Film
                      </button>
                      <button
                        type="button"
                        className={eff.grain.engine === "digital" ? "is-active" : ""}
                        onClick={() => updateGrain({ engine: "digital" })}
                      >
                        Digital CMOS
                      </button>
                    </div>
                  </div>

                  <div className="grain-control-row">
                    <span className="grain-control-label">JENIS GERAKAN</span>
                    <div className="grain-segmented">
                      <button
                        type="button"
                        className={
                          eff.grain.movement === "dynamic" ? "is-active" : ""
                        }
                        onClick={() => updateGrain({ movement: "dynamic" })}
                      >
                        Dinamis (24-60 FPS)
                      </button>
                      <button
                        type="button"
                        className={
                          eff.grain.movement === "static" ? "is-active" : ""
                        }
                        onClick={() => updateGrain({ movement: "static" })}
                      >
                        Statis
                      </button>
                    </div>
                  </div>

                  <div className="grain-slider-block">
                    <div className="grain-slider-header">
                      <span>Intensitas Noise</span>
                      <strong>{Math.round(eff.grain.intensity)}%</strong>
                    </div>
                    <input
                      type="range"
                      aria-label="Intensitas Noise"
                      min={0}
                      max={100}
                      step={1}
                      value={eff.grain.intensity}
                      onChange={(e) =>
                        updateGrain({
                          intensity: Number(e.target.value),
                          enabled: Number(e.target.value) > 0,
                        })
                      }
                    />
                  </div>

                  <div className="grain-control-row">
                    <span className="grain-control-label">UKURAN BUTIRAN</span>
                    <div className="grain-size-pills">
                      {(
                        [
                          ["micro", "Micro"],
                          ["fine", "Fine"],
                          ["medium", "Medium"],
                          ["coarse", "Coarse"],
                          ["heavy", "Heavy"],
                        ] as const
                      ).map(([sizeId, label]) => (
                        <button
                          key={sizeId}
                          type="button"
                          className={eff.grain.grainSize === sizeId ? "is-active" : ""}
                          onClick={() => updateGrain({ grainSize: sizeId })}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grain-checkbox-list">
                    <label className="grain-checkbox-row">
                      <input
                        type="checkbox"
                        checked={eff.grain.protectHighlights}
                        onChange={(e) =>
                          updateGrain({ protectHighlights: e.target.checked })
                        }
                      />
                      <span>Kurva sin(L*π) proteksi sorotan</span>
                    </label>
                    <label className="grain-checkbox-row">
                      <input
                        type="checkbox"
                        checked={eff.grain.chromaticDispersion}
                        onChange={(e) =>
                          updateGrain({ chromaticDispersion: e.target.checked })
                        }
                      />
                      <span>Dispersi RGB Kromatik Organik</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2. Blur Card */}
          {hasBlur && (
            <div
              className={`active-effect-card ${
                !eff.blur.enabled ? "is-disabled" : ""
              }`}
            >
              <div className="active-effect-card-header">
                <div className="active-effect-card-title">
                  <Droplets size={14} />
                  <strong>
                    Blur (
                    {eff.blur.type === "gaussian"
                      ? "Gaussian"
                      : eff.blur.type === "motion"
                        ? "Directional"
                        : "Radial Zoom"}
                    )
                  </strong>
                </div>
                <div className="active-effect-card-actions">
                  <button
                    type="button"
                    className={`active-effect-btn ${
                      eff.blur.enabled ? "is-active" : ""
                    }`}
                    title={
                      eff.blur.enabled ? "Nonaktifkan Blur" : "Aktifkan Blur"
                    }
                    onClick={toggleBlur}
                  >
                    {eff.blur.enabled ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                  <button
                    type="button"
                    className="active-effect-btn btn-delete"
                    title="Hapus Efek Blur"
                    onClick={removeBlur}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              {eff.blur.enabled && (
                <div className="active-effect-card-body">
                  <div className="grain-control-row">
                    <span className="grain-control-label">MODE BLUR</span>
                    <div className="grain-size-pills">
                      {(
                        [
                          ["gaussian", "Gaussian"],
                          ["motion", "Directional"],
                          ["radial", "Radial Zoom"],
                        ] as const
                      ).map(([bType, bLabel]) => (
                        <button
                          key={bType}
                          type="button"
                          className={
                            eff.blur.enabled && eff.blur.type === bType
                              ? "is-active"
                              : ""
                          }
                          onClick={() =>
                            updateBlur({
                              type: bType,
                              radius: eff.blur.radius > 0 ? eff.blur.radius : 15,
                            })
                          }
                        >
                          {bLabel}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grain-slider-block">
                    <div className="grain-slider-header">
                      <span>Radius Blur</span>
                      <strong>{Math.round(eff.blur.radius)} px</strong>
                    </div>
                    <input
                      type="range"
                      aria-label="Radius Blur"
                      min={0}
                      max={50}
                      step={1}
                      value={eff.blur.radius}
                      onChange={(e) =>
                        updateBlur({
                          radius: Number(e.target.value),
                          enabled: Number(e.target.value) > 0,
                        })
                      }
                    />
                  </div>

                  {eff.blur.type === "motion" && (
                    <div className="grain-slider-block">
                      <div className="grain-slider-header">
                        <span>Sudut Arah (Angle)</span>
                        <strong>{Math.round(eff.blur.angle)}°</strong>
                      </div>
                      <input
                        type="range"
                        aria-label="Sudut Arah (Angle)"
                        min={0}
                        max={360}
                        step={5}
                        value={eff.blur.angle}
                        onChange={(e) =>
                          updateBlur({ angle: Number(e.target.value) })
                        }
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 3. Cinema Vignette Card */}
          {hasVignette && (
            <div className="active-effect-card">
              <div className="active-effect-card-header">
                <div className="active-effect-card-title">
                  <CircleDot size={14} />
                  <strong>Cinema Vignette</strong>
                </div>
                <div className="active-effect-card-actions">
                  <button
                    type="button"
                    className="active-effect-btn btn-delete"
                    title="Hapus Efek Vignette"
                    onClick={() => removeStylizeItem("vignette")}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div className="active-effect-card-body">
                <div className="grain-slider-block">
                  <div className="grain-slider-header">
                    <span>Intensitas Vignette (Tepi Gelap)</span>
                    <strong>{Math.round(eff.stylize.vignette)}%</strong>
                  </div>
                  <input
                    type="range"
                    aria-label="Intensitas Vignette"
                    min={0}
                    max={100}
                    step={1}
                    value={eff.stylize.vignette}
                    onChange={(e) =>
                      updateStylize({ vignette: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {/* 4. Chromatic Aberration / RGB Split Card */}
          {hasChromatic && (
            <div className="active-effect-card">
              <div className="active-effect-card-header">
                <div className="active-effect-card-title">
                  <Layers size={14} />
                  <strong>Chromatic Aberration (RGB Split)</strong>
                </div>
                <div className="active-effect-card-actions">
                  <button
                    type="button"
                    className="active-effect-btn btn-delete"
                    title="Hapus Efek Chromatic Aberration"
                    onClick={() => removeStylizeItem("chromaticAberration")}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div className="active-effect-card-body">
                <div className="grain-slider-block">
                  <div className="grain-slider-header">
                    <span>Jarak Aberrasi Warna</span>
                    <strong>
                      {Math.round(eff.stylize.chromaticAberration)} px
                    </strong>
                  </div>
                  <input
                    type="range"
                    aria-label="Jarak Aberrasi Warna"
                    min={0}
                    max={50}
                    step={1}
                    value={eff.stylize.chromaticAberration}
                    onChange={(e) =>
                      updateStylize({
                        chromaticAberration: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {/* 5. CRT / VHS Scanlines Card */}
          {hasScanlines && (
            <div className="active-effect-card">
              <div className="active-effect-card-header">
                <div className="active-effect-card-title">
                  <Tv size={14} />
                  <strong>CRT / VHS Scanlines</strong>
                </div>
                <div className="active-effect-card-actions">
                  <button
                    type="button"
                    className="active-effect-btn btn-delete"
                    title="Hapus Efek Scanlines"
                    onClick={() => removeStylizeItem("scanlines")}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div className="active-effect-card-body">
                <div className="grain-slider-block">
                  <div className="grain-slider-header">
                    <span>Kerapatan Garis Pindai</span>
                    <strong>{Math.round(eff.stylize.scanlines)}%</strong>
                  </div>
                  <input
                    type="range"
                    aria-label="Kerapatan Garis Pindai"
                    min={0}
                    max={100}
                    step={1}
                    value={eff.stylize.scanlines}
                    onChange={(e) =>
                      updateStylize({ scanlines: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {/* 6. Halation Bloom Card */}
          {hasBloom && (
            <div className="active-effect-card">
              <div className="active-effect-card-header">
                <div className="active-effect-card-title">
                  <Sparkles size={14} />
                  <strong>Halation Bloom (Glow)</strong>
                </div>
                <div className="active-effect-card-actions">
                  <button
                    type="button"
                    className="active-effect-btn btn-delete"
                    title="Hapus Efek Halation Bloom"
                    onClick={() => removeStylizeItem("bloom")}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div className="active-effect-card-body">
                <div className="grain-slider-block">
                  <div className="grain-slider-header">
                    <span>Pendar Highlight Lembut</span>
                    <strong>{Math.round(eff.stylize.bloom)}%</strong>
                  </div>
                  <input
                    type="range"
                    aria-label="Pendar Highlight Lembut"
                    min={0}
                    max={100}
                    step={1}
                    value={eff.stylize.bloom}
                    onChange={(e) =>
                      updateStylize({ bloom: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {/* 7. Crisp Sharpen Card */}
          {hasSharpen && (
            <div className="active-effect-card">
              <div className="active-effect-card-header">
                <div className="active-effect-card-title">
                  <Flame size={14} />
                  <strong>Crisp Sharpen (Ketajaman)</strong>
                </div>
                <div className="active-effect-card-actions">
                  <button
                    type="button"
                    className="active-effect-btn btn-delete"
                    title="Hapus Efek Sharpen"
                    onClick={() => removeStylizeItem("sharpen")}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div className="active-effect-card-body">
                <div className="grain-slider-block">
                  <div className="grain-slider-header">
                    <span>Ketajaman Detail Tepi</span>
                    <strong>{Math.round(eff.stylize.sharpen)}%</strong>
                  </div>
                  <input
                    type="range"
                    aria-label="Ketajaman Detail Tepi"
                    min={0}
                    max={100}
                    step={1}
                    value={eff.stylize.sharpen}
                    onChange={(e) =>
                      updateStylize({ sharpen: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tambah Efek Dropdown / Button */}
      <div className="add-effect-container">
        <button
          type="button"
          className="add-effect-btn"
          onClick={() => setShowAddMenu((v) => !v)}
        >
          <Plus size={14} />
          <span>Tambah Efek Lain ke Klip Ini</span>
          <ChevronDown
            size={12}
            style={{
              marginLeft: "auto",
              transform: showAddMenu ? "rotate(180deg)" : "none",
              transition: "transform 0.15s ease",
            }}
          />
        </button>

        {showAddMenu && (
          <div className="add-effect-dropdown">
            {!hasGrain && (
              <button
                type="button"
                className="add-effect-option"
                onClick={() => {
                  updateGrain({ enabled: true, intensity: 32 });
                  setShowAddMenu(false);
                }}
              >
                <Film size={13} />
                <span>+ Film Grain (35mm Emulsi)</span>
              </button>
            )}
            {!hasBlur && (
              <button
                type="button"
                className="add-effect-option"
                onClick={() => {
                  updateBlur({ enabled: true, radius: 15, type: "gaussian" });
                  setShowAddMenu(false);
                }}
              >
                <Droplets size={13} />
                <span>+ Gaussian Blur Lensa</span>
              </button>
            )}
            {!hasVignette && (
              <button
                type="button"
                className="add-effect-option"
                onClick={() => {
                  updateStylize({ vignette: 50 });
                  setShowAddMenu(false);
                }}
              >
                <CircleDot size={13} />
                <span>+ Cinema Vignette (Tepi Gelap)</span>
              </button>
            )}
            {!hasChromatic && (
              <button
                type="button"
                className="add-effect-option"
                onClick={() => {
                  updateStylize({ chromaticAberration: 18 });
                  setShowAddMenu(false);
                }}
              >
                <Layers size={13} />
                <span>+ RGB Split Glitch (Chromatic)</span>
              </button>
            )}
            {!hasScanlines && (
              <button
                type="button"
                className="add-effect-option"
                onClick={() => {
                  updateStylize({ scanlines: 45 });
                  setShowAddMenu(false);
                }}
              >
                <Tv size={13} />
                <span>+ CRT / VHS Scanlines</span>
              </button>
            )}
            {!hasBloom && (
              <button
                type="button"
                className="add-effect-option"
                onClick={() => {
                  updateStylize({ bloom: 50 });
                  setShowAddMenu(false);
                }}
              >
                <Sparkles size={13} />
                <span>+ Halation Bloom (Pendar Glow)</span>
              </button>
            )}
            {!hasSharpen && (
              <button
                type="button"
                className="add-effect-option"
                onClick={() => {
                  updateStylize({ sharpen: 45 });
                  setShowAddMenu(false);
                }}
              >
                <Flame size={13} />
                <span>+ Crisp Sharpen (Ketajaman)</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Keep legacy controls sections for backwards compatibility if needed
export interface GrainControlsSectionProps {
  grain: FilmGrainEffect;
  onUpdateGrain: (patch: Partial<FilmGrainEffect>, label?: string) => void;
  onResetGrain?: () => void;
  draggablePresets?: boolean;
  resetDisabled?: boolean;
}

export function GrainControlsSection({
  grain,
  onUpdateGrain,
  onResetGrain,
  draggablePresets = false,
  resetDisabled = false,
}: GrainControlsSectionProps) {
  return (
    <>
      <div className="grain-section-header">
        <span>PRESET EMULSI & SENSOR (8 GAYA)</span>
        <label className="grain-enable-toggle">
          <input
            type="checkbox"
            checked={grain.enabled}
            onChange={(e) =>
              onUpdateGrain({ enabled: e.target.checked }, "Film Grain")
            }
          />
          <span>Aktif</span>
        </label>
      </div>
      <div className="grain-preset-grid">
        {GRAIN_PRESETS.map((preset) => {
          const isSelected = grain.enabled && grain.preset === preset.id;
          const payload = {
            name: `Grain · ${preset.name}`,
            effects: {
              grain: grainPresetConfig(preset.id),
              blur: { ...DEFAULT_BLUR_EFFECT },
              stylize: { ...DEFAULT_STYLIZE_EFFECT },
            },
          };
          return (
            <button
              key={preset.id}
              type="button"
              draggable={draggablePresets}
              onDragStart={
                draggablePresets
                  ? (e) => {
                      e.dataTransfer.setData(
                        "application/x-gocut-effect",
                        JSON.stringify(payload),
                      );
                      e.dataTransfer.setData(
                        "application/x-reacut-effect",
                        JSON.stringify(payload),
                      );
                      e.dataTransfer.effectAllowed = "copy";
                    }
                  : undefined
              }
              className={`grain-preset-card ${isSelected ? "is-active" : ""}`}
              onClick={() =>
                onUpdateGrain(
                  grainPresetConfig(preset.id),
                  `Grain · ${preset.name}`,
                )
              }
            >
              <div className="grain-preset-top">
                <span className="grain-preset-icon">{preset.badge}</span>
                <strong>{preset.name}</strong>
              </div>
              <small>{preset.subtitle}</small>
            </button>
          );
        })}
      </div>

      <div className="grain-control-row">
        <span className="grain-control-label">MESIN NOISE</span>
        <div className="grain-segmented">
          <button
            type="button"
            className={grain.engine === "analog" ? "is-active" : ""}
            onClick={() => onUpdateGrain({ engine: "analog" })}
          >
            Analog Film
          </button>
          <button
            type="button"
            className={grain.engine === "digital" ? "is-active" : ""}
            onClick={() => onUpdateGrain({ engine: "digital" })}
          >
            Digital CMOS
          </button>
        </div>
      </div>

      <div className="grain-control-row">
        <span className="grain-control-label">JENIS GERAKAN</span>
        <div className="grain-segmented">
          <button
            type="button"
            className={grain.movement === "dynamic" ? "is-active" : ""}
            onClick={() => onUpdateGrain({ movement: "dynamic" })}
          >
            Dinamis (24-60 FPS)
          </button>
          <button
            type="button"
            className={grain.movement === "static" ? "is-active" : ""}
            onClick={() => onUpdateGrain({ movement: "static" })}
          >
            Statis
          </button>
        </div>
      </div>

      <div className="grain-slider-block">
        <div className="grain-slider-header">
          <span>Intensitas Noise</span>
          <strong>{Math.round(grain.intensity)}%</strong>
        </div>
        <input
          type="range"
          aria-label="Intensitas Noise"
          min={0}
          max={100}
          step={1}
          value={grain.intensity}
          onChange={(e) =>
            onUpdateGrain({
              intensity: Number(e.target.value),
              enabled: Number(e.target.value) > 0,
            })
          }
        />
      </div>

      <div className="grain-control-row">
        <span className="grain-control-label">UKURAN BUTIRAN</span>
        <div className="grain-size-pills">
          {(
            [
              ["micro", "Micro"],
              ["fine", "Fine"],
              ["medium", "Medium"],
              ["coarse", "Coarse"],
              ["heavy", "Heavy"],
            ] as const
          ).map(([sizeId, label]) => (
            <button
              key={sizeId}
              type="button"
              className={grain.grainSize === sizeId ? "is-active" : ""}
              onClick={() => onUpdateGrain({ grainSize: sizeId })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grain-checkbox-list">
        <label className="grain-checkbox-row">
          <input
            type="checkbox"
            checked={grain.protectHighlights}
            onChange={(e) =>
              onUpdateGrain({ protectHighlights: e.target.checked })
            }
          />
          <span>Kurva sin(L*π) proteksi sorotan</span>
        </label>
        <label className="grain-checkbox-row">
          <input
            type="checkbox"
            checked={grain.chromaticDispersion}
            onChange={(e) =>
              onUpdateGrain({ chromaticDispersion: e.target.checked })
            }
          />
          <span>Dispersi RGB Kromatik Organik</span>
        </label>
      </div>

      {onResetGrain && (
        <button
          type="button"
          className="effects-reset"
          disabled={resetDisabled}
          onClick={onResetGrain}
        >
          <RotateCcw size={12} /> Reset Film Grain
        </button>
      )}
    </>
  );
}

export interface BlurStylizeControlsSectionProps {
  effects: Required<ClipEffects>;
  onUpdateBlur: (patch: Partial<BlurEffect>, label?: string) => void;
  onUpdateStylize: (patch: Partial<StylizeEffect>, label?: string) => void;
  onResetAll?: () => void;
  headerTitle?: string;
}

export function BlurStylizeControlsSection({
  effects,
  onUpdateBlur,
  onUpdateStylize,
  onResetAll,
  headerTitle = "BLUR & STYLIZE SUITE",
}: BlurStylizeControlsSectionProps) {
  return (
    <>
      <div className="grain-section-header" style={{ marginTop: 10 }}>
        <span>{headerTitle}</span>
        {onResetAll && (
          <button type="button" title="Reset Effects" onClick={onResetAll}>
            <RotateCcw size={12} />
          </button>
        )}
      </div>

      <div className="grain-control-row">
        <span className="grain-control-label">MODE BLUR</span>
        <div className="grain-size-pills">
          {(
            [
              ["gaussian", "Gaussian"],
              ["motion", "Directional"],
              ["radial", "Radial Zoom"],
            ] as const
          ).map(([bType, bLabel]) => (
            <button
              key={bType}
              type="button"
              className={
                effects.blur.enabled && effects.blur.type === bType
                  ? "is-active"
                  : ""
              }
              onClick={() =>
                onUpdateBlur({
                  type: bType,
                  radius: effects.blur.radius > 0 ? effects.blur.radius : 12,
                })
              }
            >
              {bLabel}
            </button>
          ))}
        </div>
      </div>

      <div className="grain-slider-block">
        <div className="grain-slider-header">
          <span>Radius Blur</span>
          <strong>{Math.round(effects.blur.radius)} px</strong>
        </div>
        <input
          type="range"
          aria-label="Radius Blur"
          min={0}
          max={50}
          step={1}
          value={effects.blur.radius}
          onChange={(e) =>
            onUpdateBlur({
              radius: Number(e.target.value),
              enabled: Number(e.target.value) > 0,
            })
          }
        />
      </div>

      {effects.blur.type === "motion" && (
        <div className="grain-slider-block">
          <div className="grain-slider-header">
            <span>Sudut Arah (Angle)</span>
            <strong>{Math.round(effects.blur.angle)}°</strong>
          </div>
          <input
            type="range"
            aria-label="Sudut Arah (Angle)"
            min={0}
            max={360}
            step={5}
            value={effects.blur.angle}
            onChange={(e) =>
              onUpdateBlur({ angle: Number(e.target.value) })
            }
          />
        </div>
      )}

      {(
        [
          ["vignette", "Vignette (Tepi Gelap)", 100, "%"],
          ["chromaticAberration", "Chromatic RGB Split", 50, " px"],
          ["scanlines", "CRT / VHS Scanlines", 100, "%"],
          ["bloom", "Halation / Glow Bloom", 100, "%"],
          ["sharpen", "Sharpen (Ketajaman)", 100, "%"],
        ] as const
      ).map(([key, label, maxVal, unit]) => (
        <div className="grain-slider-block" key={key}>
          <div className="grain-slider-header">
            <span>{label}</span>
            <strong>
              {Math.round(effects.stylize[key])}
              {unit}
            </strong>
          </div>
          <input
            type="range"
            aria-label={label}
            min={0}
            max={maxVal}
            step={1}
            value={effects.stylize[key]}
            onChange={(e) =>
              onUpdateStylize({
                [key]: Number(e.target.value),
              })
            }
          />
        </div>
      ))}
    </>
  );
}
