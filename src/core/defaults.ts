import type {
  Adjustments,
  Transform,
  TextStyle,
  FilmGrainEffect,
  BlurEffect,
  StylizeEffect,
  ClipEffects,
} from "./types";
export const DEFAULT_TRANSFORM: Transform = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
  flipX: false,
  flipY: false,
};
export const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 0,
  contrast: 1,
  saturation: 1,
  temperature: 0,
  blur: 0,
};
export const DEFAULT_FILM_GRAIN: FilmGrainEffect = {
  enabled: false,
  preset: "kodak-35mm",
  engine: "analog",
  movement: "dynamic",
  intensity: 32,
  grainSize: "medium",
  protectHighlights: true,
  chromaticDispersion: true,
};
export const DEFAULT_BLUR_EFFECT: BlurEffect = {
  enabled: false,
  type: "gaussian",
  radius: 0,
  angle: 0,
};
export const DEFAULT_STYLIZE_EFFECT: StylizeEffect = {
  enabled: false,
  vignette: 0,
  chromaticAberration: 0,
  scanlines: 0,
  bloom: 0,
  sharpen: 0,
};
export const DEFAULT_CLIP_EFFECTS: ClipEffects = {
  grain: { ...DEFAULT_FILM_GRAIN },
  blur: { ...DEFAULT_BLUR_EFFECT },
  stylize: { ...DEFAULT_STYLIZE_EFFECT },
};
export const DEFAULT_TEXT: TextStyle = {
  text: "在这里输入文字",
  fontSize: 72,
  fontFamily: "Noto Sans SC",
  color: "#ffffff",
  background: "transparent",
  align: "center",
  bold: true,
  stroke: "#000000",
  strokeWidth: 2,
};
