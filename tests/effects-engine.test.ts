import { describe, expect, it } from "vitest";
import {
  GRAIN_PRESETS,
  grainPresetConfig,
  applyFilmGrainToPixels,
  applyStylizeToPixels,
  buildFfmpegEffectFilters,
  blendModeToCompositeOp,
  EXPORT_PLATFORM_PRESETS,
} from "../src/core/effectsEngine";
import {
  DEFAULT_CLIP_EFFECTS,
  DEFAULT_FILM_GRAIN,
  DEFAULT_STYLIZE_EFFECT,
} from "../src/core/defaults";
import {
  createAdjustmentClip,
  createProject,
  validateProject,
} from "../src/core/model";

describe("effectsEngine", () => {
  it("defines all 8 emulsion and sensor presets with distinct defaults", () => {
    expect(GRAIN_PRESETS).toHaveLength(8);
    const ids = GRAIN_PRESETS.map((p) => p.id);
    expect(ids).toEqual([
      "kodak-35mm",
      "fuji-eterna",
      "16mm-analog",
      "super-8mm",
      "prnu-cloak",
      "high-iso",
      "micro-dither",
      "crt-vhs",
    ]);
    const kodak = grainPresetConfig("kodak-35mm");
    expect(kodak.engine).toBe("analog");
    expect(kodak.enabled).toBe(true);
    expect(kodak.intensity).toBeGreaterThan(0);
  });

  it("applies film grain with highlight protection sin(L*pi)", () => {
    // 2 pixels: one midtone (128,128,128), one pure white highlight (255,255,255)
    const data = new Uint8ClampedArray([
      128, 128, 128, 255,
      255, 255, 255, 255,
    ]);
    applyFilmGrainToPixels(
      data,
      2,
      1,
      {
        ...DEFAULT_FILM_GRAIN,
        enabled: true,
        intensity: 60,
        protectHighlights: true,
        chromaticDispersion: true,
      },
      1,
    );
    // Midtone should be perturbed
    expect(data[0] !== 128 || data[1] !== 128 || data[2] !== 128).toBe(true);
    // Pure highlight (L=1 -> sin(pi)=0) should remain protected at 255
    expect(data[4]).toBe(255);
    expect(data[5]).toBe(255);
    expect(data[6]).toBe(255);
  });

  it("applies vignette and scanlines in applyStylizeToPixels", () => {
    const data = new Uint8ClampedArray(4 * 4 * 4).fill(200);
    applyStylizeToPixels(data, 4, 4, {
      ...DEFAULT_STYLIZE_EFFECT,
      enabled: true,
      vignette: 80,
      scanlines: 50,
    });
    // Corner pixel should be darkened by vignette
    expect(data[0]).toBeLessThan(200);
  });

  it("builds FFmpeg filter strings for grain, blur, and stylize", () => {
    const filters = buildFfmpegEffectFilters({
      ...DEFAULT_CLIP_EFFECTS,
      grain: {
        ...DEFAULT_FILM_GRAIN,
        enabled: true,
        intensity: 32,
        engine: "analog",
        movement: "dynamic",
      },
      blur: { enabled: true, type: "gaussian", radius: 10, angle: 0 },
      stylize: {
        ...DEFAULT_STYLIZE_EFFECT,
        enabled: true,
        vignette: 50,
        chromaticAberration: 8,
        sharpen: 40,
      },
    });
    expect(filters.some((f) => f.startsWith("noise="))).toBe(true);
    expect(filters.some((f) => f.startsWith("gblur="))).toBe(true);
    expect(filters.some((f) => f.startsWith("vignette="))).toBe(true);
    expect(filters.some((f) => f.startsWith("rgbashift="))).toBe(true);
    expect(filters.some((f) => f.startsWith("unsharp="))).toBe(true);
  });

  it("validates a project containing an Adjustment Layer clip and exposes export presets", () => {
    const proj = createProject();
    const videoTrack = proj.tracks.find((t) => t.kind === "video")!;
    const adj = createAdjustmentClip(videoTrack.id, 0, 5, proj.fps);
    proj.clips.push(adj);
    expect(() => validateProject(proj)).not.toThrow();
    expect(blendModeToCompositeOp("screen")).toBe("screen");
    expect(EXPORT_PLATFORM_PRESETS.length).toBeGreaterThanOrEqual(5);
  });
});

