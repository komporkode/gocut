import type {
  BlendMode,
  ClipEffects,
  FilmGrainEffect,
  GrainPresetId,
  StylizeEffect,
} from "./types";

export interface GrainPresetMeta {
  id: GrainPresetId;
  name: string;
  subtitle: string;
  badge: string;
  config: Omit<FilmGrainEffect, "enabled">;
  tint: { r: number; g: number; b: number };
}

export const GRAIN_PRESETS: GrainPresetMeta[] = [
  {
    id: "kodak-35mm",
    name: "Kodak 35mm",
    subtitle: "Vision3 500T warm",
    badge: "🎬",
    config: {
      preset: "kodak-35mm",
      engine: "analog",
      movement: "dynamic",
      intensity: 32,
      grainSize: "medium",
      protectHighlights: true,
      chromaticDispersion: true,
    },
    tint: { r: 6, g: 2, b: -5 },
  },
  {
    id: "fuji-eterna",
    name: "Fuji Eterna",
    subtitle: "Cool pastel 250D",
    badge: "🎞️",
    config: {
      preset: "fuji-eterna",
      engine: "analog",
      movement: "dynamic",
      intensity: 24,
      grainSize: "fine",
      protectHighlights: true,
      chromaticDispersion: true,
    },
    tint: { r: -4, g: 3, b: 6 },
  },
  {
    id: "16mm-analog",
    name: "16mm Analog",
    subtitle: "Vintage celluloid",
    badge: "📽️",
    config: {
      preset: "16mm-analog",
      engine: "analog",
      movement: "dynamic",
      intensity: 46,
      grainSize: "coarse",
      protectHighlights: true,
      chromaticDispersion: true,
    },
    tint: { r: 8, g: 4, b: -8 },
  },
  {
    id: "super-8mm",
    name: "Super 8mm",
    subtitle: "Heavy archival",
    badge: "🎥",
    config: {
      preset: "super-8mm",
      engine: "analog",
      movement: "dynamic",
      intensity: 64,
      grainSize: "heavy",
      protectHighlights: true,
      chromaticDispersion: false,
    },
    tint: { r: 10, g: 5, b: -10 },
  },
  {
    id: "prnu-cloak",
    name: "PRNU Cloak",
    subtitle: "Samarkan sensor",
    badge: "🛡️",
    config: {
      preset: "prnu-cloak",
      engine: "digital",
      movement: "static",
      intensity: 18,
      grainSize: "micro",
      protectHighlights: true,
      chromaticDispersion: true,
    },
    tint: { r: 0, g: 0, b: 0 },
  },
  {
    id: "high-iso",
    name: "High-ISO",
    subtitle: "CMOS ISO 6400",
    badge: "📷",
    config: {
      preset: "high-iso",
      engine: "digital",
      movement: "dynamic",
      intensity: 42,
      grainSize: "fine",
      protectHighlights: false,
      chromaticDispersion: true,
    },
    tint: { r: 2, g: -2, b: 4 },
  },
  {
    id: "micro-dither",
    name: "Micro Dither",
    subtitle: "Steganographic",
    badge: "🔬",
    config: {
      preset: "micro-dither",
      engine: "digital",
      movement: "static",
      intensity: 14,
      grainSize: "micro",
      protectHighlights: false,
      chromaticDispersion: false,
    },
    tint: { r: 0, g: 0, b: 0 },
  },
  {
    id: "crt-vhs",
    name: "CRT / VHS",
    subtitle: "Broadcast texture",
    badge: "📺",
    config: {
      preset: "crt-vhs",
      engine: "analog",
      movement: "dynamic",
      intensity: 52,
      grainSize: "coarse",
      protectHighlights: false,
      chromaticDispersion: true,
    },
    tint: { r: 4, g: -3, b: 7 },
  },
];

export interface ExportPlatformPreset {
  id: string;
  name: string;
  description: string;
  badge: string;
  resolutionHeight?: number;
  vertical?: boolean;
  fps?: number;
  bitrate: string;
  quality: "draft" | "standard" | "high";
  format: "mp4" | "mov" | "mp3" | "wav";
  codec: "h264" | "hevc";
}

export const EXPORT_PLATFORM_PRESETS: ExportPlatformPreset[] = [
  {
    id: "youtube-4k",
    name: "YouTube 4K Ultra",
    description: "2160p · 60fps · 35 Mbps · High",
    badge: "4K",
    resolutionHeight: 2160,
    fps: 60,
    bitrate: "35M",
    quality: "high",
    format: "mp4",
    codec: "h264",
  },
  {
    id: "youtube-1080p",
    name: "YouTube / Standar 1080p",
    description: "1080p FHD · 30fps · 12 Mbps",
    badge: "FHD",
    resolutionHeight: 1080,
    fps: 30,
    bitrate: "12M",
    quality: "high",
    format: "mp4",
    codec: "h264",
  },
  {
    id: "tiktok-reels",
    name: "TikTok / Reels / Shorts",
    description: "1080p · 60fps · 10 Mbps · Sosmed",
    badge: "60p",
    resolutionHeight: 1080,
    fps: 60,
    bitrate: "10M",
    quality: "standard",
    format: "mp4",
    codec: "h264",
  },
  {
    id: "hevc-master",
    name: "HEVC H.265 Hemat",
    description: "1080p · H.265 · 8 Mbps · Ukuran Kecil",
    badge: "H.265",
    resolutionHeight: 1080,
    fps: 30,
    bitrate: "8M",
    quality: "high",
    format: "mp4",
    codec: "hevc",
  },
  {
    id: "whatsapp-web",
    name: "WhatsApp / Web Cepat",
    description: "720p HD · 30fps · 4 Mbps · Ringan",
    badge: "HD",
    resolutionHeight: 720,
    fps: 30,
    bitrate: "4M",
    quality: "draft",
    format: "mp4",
    codec: "h264",
  },
  {
    id: "audio-mp3",
    name: "Audio Only (MP3)",
    description: "Ekstrak musik / narasi 192 kbps",
    badge: "MP3",
    bitrate: "auto",
    quality: "standard",
    format: "mp3",
    codec: "h264",
  },
];

export function grainPresetConfig(presetId: GrainPresetId): FilmGrainEffect {
  const found =
    GRAIN_PRESETS.find((p) => p.id === presetId) ?? GRAIN_PRESETS[0];
  return {
    enabled: true,
    ...found.config,
  };
}

const GRAIN_SIZE_STEP: Record<FilmGrainEffect["grainSize"], number> = {
  micro: 1,
  fine: 1,
  medium: 2,
  coarse: 3,
  heavy: 4,
};

// Precomputed 256-entry LUT for highlight protection curve sin(L * pi)
const SIN_LUMA_LUT = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  SIN_LUMA_LUT[i] = Math.max(0, Math.sin((i / 255) * Math.PI));
}

// Precomputed 4096-entry deterministic zero-mean noise table [-1, 1]
const NOISE_TABLE_MASK = 4095;
const NOISE_TABLE = new Float32Array(4096);
for (let i = 0; i < 4096; i++) {
  let h = Math.imul(i + 1, 374761393);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  NOISE_TABLE[i] = (((h ^ (h >>> 16)) >>> 0) / 4294967295) * 2 - 1;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

export function applyFilmGrainToPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  grain?: FilmGrainEffect,
  seedFrame = 0,
): void {
  if (!grain || !grain.enabled || grain.intensity <= 0) return;

  const meta =
    GRAIN_PRESETS.find((p) => p.id === grain.preset) ?? GRAIN_PRESETS[0];
  const step = GRAIN_SIZE_STEP[grain.grainSize] ?? 2;
  const seed = (grain.movement === "dynamic" ? (seedFrame | 0) + 17 : 42) * 193;
  const engineBoost = grain.engine === "analog" ? 1.15 : 0.95;
  const fineDither = grain.grainSize === "fine" ? 0.72 : 1;
  const strength = (grain.intensity / 100) * 78 * engineBoost * fineDither;
  const chromaStrength = strength * 0.42;
  const tintScale = Math.min(1, grain.intensity / 50);
  const tintR = meta.tint.r * tintScale;
  const tintG = meta.tint.g * tintScale;
  const tintB = meta.tint.b * tintScale;
  const protect = grain.protectHighlights;
  const dispersion = grain.chromaticDispersion;
  const isCrt = grain.preset === "crt-vhs";

  for (let y = 0; y < height; y++) {
    const gyHash = Math.imul((y / step) | 0, 73856093) ^ seed;
    const crtScan =
      isCrt && (y & 1) === 1 ? 1 - (grain.intensity / 100) * 0.18 : 1;
    const rowOffset = y * width * 4;

    for (let x = 0; x < width; x++) {
      const idx = rowOffset + (x << 2);
      if (data[idx + 3] === 0) continue;

      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Fast integer luminance 0..255: (77*R + 150*G + 29*B) >> 8
      const lumaByte = (77 * r + 150 * g + 29 * b) >> 8;
      const weight = protect ? SIN_LUMA_LUT[lumaByte] : 1;
      if (weight <= 0.0001) continue;

      const gx = (x / step) | 0;
      const hIdx = (Math.imul(gx, 19349663) ^ gyHash) & NOISE_TABLE_MASK;
      const baseN = NOISE_TABLE[hIdx] * strength * weight;
      const wTintR = tintR * weight;
      const wTintG = tintG * weight;
      const wTintB = tintB * weight;

      if (dispersion) {
        const nr = NOISE_TABLE[(hIdx + 311) & NOISE_TABLE_MASK] * chromaStrength * weight;
        const nb = NOISE_TABLE[(hIdx + 977) & NOISE_TABLE_MASK] * chromaStrength * weight;
        data[idx] = clampByte((r + baseN + nr + wTintR) * crtScan);
        data[idx + 1] = clampByte((g + baseN * 0.92 + wTintG) * crtScan);
        data[idx + 2] = clampByte((b + baseN + nb + wTintB) * crtScan);
      } else {
        data[idx] = clampByte((r + baseN + wTintR) * crtScan);
        data[idx + 1] = clampByte((g + baseN + wTintG) * crtScan);
        data[idx + 2] = clampByte((b + baseN + wTintB) * crtScan);
      }
    }
  }
}

export function applyStylizeToPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  stylize?: StylizeEffect,
): void {
  if (!stylize || !stylize.enabled) return;
  const {
    vignette,
    chromaticAberration,
    scanlines,
    bloom,
    sharpen,
  } = stylize;

  if (
    vignette <= 0 &&
    chromaticAberration <= 0 &&
    scanlines <= 0 &&
    bloom <= 0 &&
    sharpen <= 0
  ) {
    return;
  }

  // 1. Chromatic Aberration (RGB horizontal split) & Sharpen require a source snapshot
  const needSnapshot = chromaticAberration > 0 || sharpen > 0;
  const src = needSnapshot ? new Uint8ClampedArray(data) : data;
  const shift = Math.round((chromaticAberration / 50) * Math.max(2, width * 0.025));
  const sharpAmt = (sharpen / 100) * 1.1;
  const vigStrength = (vignette / 100) * 0.85;
  const scanStrength = (scanlines / 100) * 0.55;
  const bloomStrength = (bloom / 100) * 0.65;
  const cx = width / 2;
  const cy = height / 2;
  const maxDistSq = cx * cx + cy * cy || 1;

  for (let y = 0; y < height; y++) {
    const dy = y - cy;
    const isScanRow = scanStrength > 0 && y % 2 === 1;
    const scanFactor = isScanRow ? 1 - scanStrength : 1;

    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (src[idx + 3] === 0) continue;

      let r = src[idx];
      let g = src[idx + 1];
      let b = src[idx + 2];

      if (shift > 0) {
        const rx = Math.max(0, Math.min(width - 1, x - shift));
        const bx = Math.max(0, Math.min(width - 1, x + shift));
        r = src[(y * width + rx) * 4];
        b = src[(y * width + bx) * 4 + 2];
      }

      if (sharpAmt > 0 && x > 0 && x < width - 1 && y > 0 && y < height - 1) {
        const up = ((y - 1) * width + x) * 4;
        const dn = ((y + 1) * width + x) * 4;
        const lf = (y * width + (x - 1)) * 4;
        const rt = (y * width + (x + 1)) * 4;
        r = clampByte(
          r + sharpAmt * (4 * r - src[up] - src[dn] - src[lf] - src[rt]),
        );
        g = clampByte(
          g +
            sharpAmt *
              (4 * g -
                src[up + 1] -
                src[dn + 1] -
                src[lf + 1] -
                src[rt + 1]),
        );
        b = clampByte(
          b +
            sharpAmt *
              (4 * b -
                src[up + 2] -
                src[dn + 2] -
                src[lf + 2] -
                src[rt + 2]),
        );
      }

      if (bloomStrength > 0) {
        const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        if (luma > 0.62) {
          const boost = (luma - 0.62) * 2.6 * bloomStrength * 90;
          r = clampByte(r + boost);
          g = clampByte(g + boost);
          b = clampByte(b + boost);
        }
      }

      let vFactor = scanFactor;
      if (vigStrength > 0) {
        const dx = x - cx;
        const distNorm = (dx * dx + dy * dy) / maxDistSq;
        vFactor *= Math.max(0.08, 1 - distNorm * vigStrength);
      }

      data[idx] = clampByte(r * vFactor);
      data[idx + 1] = clampByte(g * vFactor);
      data[idx + 2] = clampByte(b * vFactor);
    }
  }
}

export function blendModeToCompositeOp(
  mode?: BlendMode,
): GlobalCompositeOperation {
  switch (mode) {
    case "screen":
      return "screen";
    case "multiply":
      return "multiply";
    case "overlay":
      return "overlay";
    case "soft-light":
      return "soft-light";
    case "hard-light":
      return "hard-light";
    case "color-dodge":
      return "color-dodge";
    default:
      return "source-over";
  }
}

export function buildFfmpegEffectFilters(effects?: ClipEffects): string[] {
  if (!effects) return [];
  const filters: string[] = [];

  if (effects.blur?.enabled && effects.blur.radius > 0) {
    const r = Math.max(0.5, Math.min(50, effects.blur.radius));
    if (effects.blur.type === "motion") {
      filters.push(
        `dblur=angle=${Math.round(effects.blur.angle || 0)}:radius=${r.toFixed(1)}`,
      );
    } else {
      filters.push(`gblur=sigma=${(r * 0.6).toFixed(2)}`);
    }
  }

  if (effects.stylize?.enabled) {
    const st = effects.stylize;
    if (st.chromaticAberration > 0) {
      const px = Math.max(1, Math.round(st.chromaticAberration * 0.4));
      filters.push(`rgbashift=rh=-${px}:bh=${px}`);
    }
    if (st.sharpen > 0) {
      const amt = Math.min(2.5, (st.sharpen / 100) * 1.8).toFixed(2);
      filters.push(`unsharp=5:5:${amt}:5:5:0.0`);
    }
    if (st.bloom > 0) {
      const br = ((st.bloom / 100) * 0.08).toFixed(3);
      filters.push(`eq=brightness=${br}:saturation=1.06`);
    }
    if (st.vignette > 0) {
      const angle = ((st.vignette / 100) * (Math.PI / 3.2)).toFixed(3);
      filters.push(`vignette=angle=${angle}`);
    }
  }

  if (effects.grain?.enabled && effects.grain.intensity > 0) {
    const gr = effects.grain;
    const sizeBoost =
      gr.grainSize === "heavy"
        ? 1.35
        : gr.grainSize === "coarse"
          ? 1.18
          : gr.grainSize === "micro"
            ? 0.65
            : 1.0;
    const alls = Math.max(
      1,
      Math.min(90, Math.round(gr.intensity * 0.55 * sizeBoost)),
    );
    const flags = gr.movement === "dynamic" ? "t+u" : "u";
    filters.push(`noise=alls=${alls}:allf=${flags}`);
  }

  return filters;
}

