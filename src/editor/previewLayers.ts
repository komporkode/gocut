import type { Clip } from "../core/types";
import { getCropPixels, applyChromaKey, applyShapeMask } from "../core/visual";
import { applyColorAdjustments } from "../core/color";
import {
  applyFilmGrainToPixels,
  applyStylizeToPixels,
} from "../core/effectsEngine";

interface Layer {
  canvas: HTMLCanvasElement;
  key: string;
  width: number;
  height: number;
}

const cache = new Map<string, Layer>();
let scratchCanvasA: HTMLCanvasElement | null = null;
let scratchCanvasB: HTMLCanvasElement | null = null;

function getScratchCanvas(slot: "a" | "b", width: number, height: number): HTMLCanvasElement {
  let c = slot === "a" ? scratchCanvasA : scratchCanvasB;
  if (!c) {
    c = document.createElement("canvas");
    if (slot === "a") scratchCanvasA = c;
    else scratchCanvasB = c;
  }
  if (c.width !== width || c.height !== height) {
    c.width = width;
    c.height = height;
  }
  return c;
}

export function clearPreviewLayers(keepIds: Set<string>) {
  for (const id of cache.keys()) if (!keepIds.has(id)) cache.delete(id);
}

function canvasFor(
  clip: Clip,
  key: string,
  width: number,
  height: number,
): Layer {
  let layer = cache.get(clip.id);
  if (!layer) {
    layer = {
      canvas: document.createElement("canvas"),
      key: "",
      width,
      height,
    };
    cache.set(clip.id, layer);
  }
  if (layer.canvas.width !== width || layer.canvas.height !== height) {
    layer.canvas.width = width;
    layer.canvas.height = height;
    layer.key = "";
  }
  layer.width = width;
  layer.height = height;
  return layer;
}

function applyDirectionalOrRadialBlur(
  canvas: HTMLCanvasElement,
  clip: Clip,
): void {
  const blur = clip.effects?.blur;
  if (!blur?.enabled || blur.radius <= 0 || blur.type === "gaussian") return;

  const w = canvas.width;
  const h = canvas.height;
  if (w <= 1 || h <= 1) return;

  const temp = getScratchCanvas("a", w, h);
  const tctx = temp.getContext("2d");
  const ctx = canvas.getContext("2d");
  if (!tctx || !ctx) return;

  tctx.clearRect(0, 0, w, h);
  tctx.drawImage(canvas, 0, 0);
  const taps = 5;
  ctx.save();
  if (blur.type === "motion") {
    const rad = ((blur.angle || 0) * Math.PI) / 180;
    const dx = Math.cos(rad) * blur.radius * 0.45;
    const dy = Math.sin(rad) * blur.radius * 0.45;
    ctx.globalAlpha = 0.26;
    for (let i = -taps; i <= taps; i++) {
      if (i === 0) continue;
      const frac = i / taps;
      ctx.drawImage(temp, dx * frac, dy * frac);
    }
  } else if (blur.type === "radial") {
    const maxScale = (blur.radius / 50) * 0.09;
    ctx.globalAlpha = 0.24;
    for (let i = 1; i <= taps; i++) {
      const s = 1 + (maxScale * i) / taps;
      const sw = w * s;
      const sh = h * s;
      ctx.drawImage(temp, (w - sw) / 2, (h - sh) / 2, sw, sh);
    }
  }
  ctx.restore();
}

function adjust(layer: Layer, clip: Clip, grainSeed = 0) {
  const a = clip.adjustments;
  const eff = clip.effects;
  const hasGrain = Boolean(eff?.grain?.enabled && eff.grain.intensity > 0);
  const hasStylize = Boolean(
    eff?.stylize?.enabled &&
      (eff.stylize.vignette > 0 ||
        eff.stylize.chromaticAberration > 0 ||
        eff.stylize.scanlines > 0 ||
        eff.stylize.bloom > 0 ||
        eff.stylize.sharpen > 0),
  );
  const hasDirBlur = Boolean(
    eff?.blur?.enabled && eff.blur.radius > 0 && eff.blur.type !== "gaussian",
  );

  if (hasDirBlur) {
    applyDirectionalOrRadialBlur(layer.canvas, clip);
  }

  // Standard brightness, contrast, and saturation are accelerated directly on GPU via ctx.filter in Player
  if (
    !clip.chromaKey?.enabled &&
    !clip.mask &&
    a.temperature === 0 &&
    !hasGrain &&
    !hasStylize
  )
    return;

  const context = layer.canvas.getContext("2d", { willReadFrequently: true })!;
  const pixels = context.getImageData(
    0,
    0,
    layer.canvas.width,
    layer.canvas.height,
  );
  applyChromaKey(pixels.data, clip.chromaKey);
  applyShapeMask(
    pixels.data,
    layer.canvas.width,
    layer.canvas.height,
    clip.mask,
  );
  applyColorAdjustments(pixels.data, a);
  if (hasStylize) {
    applyStylizeToPixels(
      pixels.data,
      layer.canvas.width,
      layer.canvas.height,
      eff?.stylize,
    );
  }
  if (hasGrain) {
    applyFilmGrainToPixels(
      pixels.data,
      layer.canvas.width,
      layer.canvas.height,
      eff?.grain,
      grainSeed,
    );
  }
  context.putImageData(pixels, 0, 0);
}

export function applyAdjustmentLayerToCanvas(
  ctx: CanvasRenderingContext2D,
  clip: Clip,
  factor: number,
  time: number,
  alpha = 1,
): void {
  const canvas = ctx.canvas;
  const w = canvas.width;
  const h = canvas.height;
  if (w <= 1 || h <= 1 || alpha <= 0) return;

  const a = clip.adjustments;
  const eff = clip.effects;
  const gaussianBlur =
    a.blur +
    (eff?.blur?.enabled && eff.blur.type === "gaussian" ? eff.blur.radius : 0);

  // 1. Hardware filter pass (brightness, contrast, saturation, gaussian blur)
  const filters: string[] = [];
  if (gaussianBlur > 0) filters.push(`blur(${gaussianBlur * factor}px)`);
  if (a.brightness !== 0)
    filters.push(`brightness(${Math.max(0, 1 + a.brightness)})`);
  if (a.contrast !== 1) filters.push(`contrast(${Math.max(0, a.contrast)})`);
  if (a.saturation !== 1)
    filters.push(`saturate(${Math.max(0, a.saturation)})`);

  if (filters.length > 0) {
    const tmp = getScratchCanvas("b", w, h);
    const tctx = tmp.getContext("2d");
    if (tctx) {
      tctx.clearRect(0, 0, w, h);
      tctx.drawImage(canvas, 0, 0);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.filter = filters.join(" ");
      ctx.globalAlpha = alpha;
      ctx.drawImage(tmp, 0, 0);
      ctx.restore();
    }
  }

  // 2. Directional / Radial blur
  if (
    eff?.blur?.enabled &&
    eff.blur.radius > 0 &&
    eff.blur.type !== "gaussian"
  ) {
    applyDirectionalOrRadialBlur(canvas, clip);
  }

  // 3. Pixel-level adjustments (temperature, stylize, film grain)
  const hasGrain = Boolean(eff?.grain?.enabled && eff.grain.intensity > 0);
  const hasStylize = Boolean(
    eff?.stylize?.enabled &&
      (eff.stylize.vignette > 0 ||
        eff.stylize.chromaticAberration > 0 ||
        eff.stylize.scanlines > 0 ||
        eff.stylize.bloom > 0 ||
        eff.stylize.sharpen > 0),
  );
  if (a.temperature !== 0 || hasGrain || hasStylize) {
    const pixels = ctx.getImageData(0, 0, w, h);
    if (a.temperature !== 0) {
      applyColorAdjustments(pixels.data, {
        ...a,
        brightness: 0,
        contrast: 1,
        saturation: 1,
      });
    }
    if (hasStylize) {
      applyStylizeToPixels(pixels.data, w, h, eff?.stylize);
    }
    if (hasGrain) {
      const seed =
        eff?.grain?.movement === "dynamic" ? Math.floor(time * 24) : 0;
      applyFilmGrainToPixels(pixels.data, w, h, eff?.grain, seed);
    }
    ctx.putImageData(pixels, 0, 0);
  }
}

export function imagePreviewLayer(
  clip: Clip,
  source: HTMLImageElement | HTMLVideoElement,
  nativeWidth: number,
  nativeHeight: number,
  frame?: number,
): HTMLCanvasElement {
  const crop = getCropPixels(
    { width: nativeWidth, height: nativeHeight },
    clip.crop,
  );
  const width = crop.width,
    height = crop.height;
  const clock =
    frame ?? (source instanceof HTMLVideoElement ? source.currentTime : 0);
  const grainSeed =
    clip.effects?.grain?.enabled && clip.effects.grain.movement === "dynamic"
      ? Math.floor(clock * 24)
      : 0;
  const key = JSON.stringify([
    source.src,
    Math.floor(clock * 120) / 120,
    grainSeed,
    clip.crop,
    clip.chromaKey,
    clip.mask,
    clip.adjustments,
    clip.effects,
    width,
    height,
  ]);
  const layer = canvasFor(clip, key, width, height);
  if (layer.key !== key) {
    const context = layer.canvas.getContext("2d", {
      willReadFrequently: true,
    })!;
    context.clearRect(0, 0, width, height);
    context.drawImage(source, -crop.x, -crop.y, nativeWidth, nativeHeight);
    adjust(layer, clip, grainSeed);
    layer.key = key;
  }
  return layer.canvas;
}

export function textPreviewLayer(clip: Clip): {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
} {
  const style = clip.text!;
  const cachedKey = JSON.stringify([
    style,
    clip.crop,
    clip.chromaKey,
    clip.mask,
    clip.adjustments,
    clip.effects,
  ]);
  const cached = cache.get(clip.id);
  if (cached?.key === cachedKey) return cached;
  const font = `${style.bold ? "bold " : ""}${style.fontSize}px "${style.fontFamily}", "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Arial Unicode MS", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
  const context = document.createElement("canvas").getContext("2d")!;
  context.font = font;
  const lines = style.text.split("\n");
  const padding = Math.ceil(style.fontSize * 0.25 + style.strokeWidth),
    width = Math.max(
      2,
      Math.ceil(
        Math.max(...lines.map((line) => context.measureText(line).width), 1),
      ) +
        padding * 2,
    ),
    lineHeight = style.fontSize * 1.3,
    height = Math.max(2, Math.ceil(lineHeight * lines.length + padding * 2));
  const key = cachedKey;
  const crop = getCropPixels({ width, height }, clip.crop);
  const layer = canvasFor(
    clip,
    key,
    Math.min(8192, crop.width),
    Math.min(8192, crop.height),
  );
  if (layer.key !== key) {
    const ctx = layer.canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    ctx.save();
    ctx.translate(-crop.x, -crop.y);
    if (style.background !== "transparent") {
      ctx.fillStyle = style.background;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.font = font;
    ctx.textAlign = style.align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = style.color;
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = style.strokeWidth * 2;
    ctx.lineJoin = "round";
    const x =
      style.align === "left"
        ? padding
        : style.align === "right"
          ? width - padding
          : width / 2;
    lines.forEach((line, i) => {
      const y = padding + lineHeight * (i + 0.5);
      if (style.strokeWidth > 0) ctx.strokeText(line, x, y);
      ctx.fillText(line, x, y);
    });
    ctx.restore();
    adjust(layer, clip);
    layer.key = key;
  }
  return { canvas: layer.canvas, width: crop.width, height: crop.height };
}
