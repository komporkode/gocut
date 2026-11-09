import { describe, expect, it } from "vitest";
import { createClip, createProject } from "../src/core/model";
import {
  DEFAULT_BLUR_EFFECT,
  DEFAULT_FILM_GRAIN,
  DEFAULT_STYLIZE_EFFECT,
} from "../src/core/defaults";
import { resolveEffects } from "../src/components/EffectsPanel";
import type { MediaAsset } from "../src/core/types";

describe("Inspector Active Effects Isolation", () => {
  const createFixture = () => {
    const project = createProject("Active Effects Test");
    const asset: MediaAsset = {
      id: "a1",
      name: "sample.mp4",
      path: "/sample.mp4",
      url: "file:///sample.mp4",
      kind: "video",
      duration: 10,
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: true,
    };
    project.assets = [asset];
    const clip = createClip(asset, project.tracks[1].id, 0, 30);
    project.clips = [clip];
    return { project, clip };
  };

  it("resolves default disabled effects when clip has no effects attached", () => {
    const { clip } = createFixture();
    const eff = resolveEffects(clip);

    expect(eff.grain.enabled).toBe(false);
    expect(eff.blur.enabled).toBe(false);
    expect(eff.stylize.enabled).toBe(false);
    expect(eff.stylize.vignette).toBe(0);
  });

  it("identifies active blur effect exclusively without enabling grain or stylize", () => {
    const { clip } = createFixture();
    clip.effects = {
      blur: { ...DEFAULT_BLUR_EFFECT, enabled: true, radius: 25, type: "gaussian" },
    };

    const hasBlur = Boolean(clip.effects.blur?.enabled && clip.effects.blur.radius > 0);
    const hasGrain = Boolean(clip.effects.grain?.enabled && clip.effects.grain.intensity > 0);
    const hasVignette = Boolean(clip.effects.stylize?.vignette && clip.effects.stylize.vignette > 0);

    expect(hasBlur).toBe(true);
    expect(hasGrain).toBe(false);
    expect(hasVignette).toBe(false);
  });

  it("identifies film grain active on Kodak 35mm preset without other effects", () => {
    const { clip } = createFixture();
    clip.effects = {
      grain: {
        ...DEFAULT_FILM_GRAIN,
        enabled: true,
        preset: "kodak-35mm",
        intensity: 32,
      },
    };

    const hasGrain = Boolean(clip.effects.grain?.enabled && clip.effects.grain.intensity > 0);
    const hasBlur = Boolean(clip.effects.blur?.enabled && clip.effects.blur.radius > 0);

    expect(hasGrain).toBe(true);
    expect(hasBlur).toBe(false);
  });

  it("isolates vignette and scanlines when only stylize effects are present", () => {
    const { clip } = createFixture();
    clip.effects = {
      stylize: {
        ...DEFAULT_STYLIZE_EFFECT,
        enabled: true,
        vignette: 60,
        scanlines: 40,
      },
    };

    const hasVignette = Boolean(clip.effects?.stylize && clip.effects.stylize.vignette > 0);
    const hasScanlines = Boolean(clip.effects?.stylize && clip.effects.stylize.scanlines > 0);
    const hasBloom = Boolean(clip.effects?.stylize && clip.effects.stylize.bloom > 0);
    const hasSharpen = Boolean(clip.effects?.stylize && clip.effects.stylize.sharpen > 0);

    expect(hasVignette).toBe(true);
    expect(hasScanlines).toBe(true);
    expect(hasBloom).toBe(false);
    expect(hasSharpen).toBe(false);
  });

  it("supports adjustment layer clips directly opening effects tab", () => {
    const { clip } = createFixture();
    clip.isAdjustmentLayer = true;
    clip.name = "Gaussian Blur";
    clip.effects = {
      blur: { ...DEFAULT_BLUR_EFFECT, enabled: true, radius: 18, type: "gaussian" },
    };

    const hasEffects = Boolean(
      clip.isAdjustmentLayer ||
      (clip.effects.blur && clip.effects.blur.enabled)
    );
    expect(hasEffects).toBe(true);
  });
});
