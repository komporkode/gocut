import { describe, it, expect } from "vitest";
import {
  centeredCrop,
  FULL_CROP,
  updateCropField,
  DEFAULT_CHROMA,
  DEFAULT_MASK,
} from "../src/components/VisualTools";
describe("source crop controls", () => {
  it("centers a maximal square crop in a landscape source", () => {
    expect(centeredCrop(1920, 1080, 1)).toEqual({
      x: 0.21875,
      y: 0,
      width: 0.5625,
      height: 1,
    });
  });
  it("centers a horizontal crop in portrait footage", () => {
    const crop = centeredCrop(1080, 1920, 16 / 9);
    expect(crop.width).toBe(1);
    expect(crop.height).toBeCloseTo(0.31640625);
    expect(crop.y).toBeCloseTo((1 - crop.height) / 2);
  });
  it("leaves matching proportions untouched and handles unavailable dimensions safely", () => {
    expect(centeredCrop(1920, 1080, 16 / 9)).toEqual(FULL_CROP);
    expect(centeredCrop(0, 0, 1)).toEqual(FULL_CROP);
  });
  it("keeps position edits inside source while preserving crop dimensions", () => {
    expect(
      updateCropField({ x: 0.1, y: 0.1, width: 0.5, height: 0.7 }, "x", 0.9),
    ).toEqual({ x: 0.5, y: 0.1, width: 0.5, height: 0.7 });
  });
  it("limits extent edits to remaining source and disallows zero-size crops", () => {
    const crop = { x: 0.2, y: 0.1, width: 0.5, height: 0.7 };
    expect(updateCropField(crop, "width", 2).width).toBe(0.8);
    expect(updateCropField(crop, "height", 0).height).toBe(0.01);
    expect(updateCropField(crop, "x", NaN)).toBe(crop);
  });
});
describe("optional tools defaults", () => {
  it("starts chroma on a familiar green with modest tolerance and a real soft edge", () => {
    expect(DEFAULT_CHROMA).toEqual({
      enabled: true,
      color: "#00ff00",
      similarity: 0.1,
      blend: 0.05,
    });
  });
  it("starts with a full non-inverted rectangular mask", () => {
    expect(DEFAULT_MASK).toEqual({
      shape: "rectangle",
      width: 1,
      height: 1,
      feather: 0,
      invert: false,
    });
  });
  it("enforces desktop hygiene with user-select none globally and text select on inputs", async () => {
    const fs = await import("fs");
    const css = fs.readFileSync("src/styles.css", "utf-8");
    expect(css).toContain("user-select: none");
    expect(css).toContain("user-select: text");
  });
  it("removes green background pixels with chroma key", async () => {
    const { applyChromaKey } = await import("../src/core/visual");
    const pixels = new Uint8ClampedArray([0, 255, 0, 255, 255, 0, 0, 255]);
    applyChromaKey(pixels, { enabled: true, color: "#00ff00", similarity: 0.1, blend: 0 });
    expect(pixels[3]).toBe(0);
    expect(pixels[7]).toBe(255);
  });
  it("applies shape mask to clip pixels", async () => {
    const { applyShapeMask } = await import("../src/core/visual");
    const pixels = new Uint8ClampedArray(2 * 2 * 4).fill(255);
    applyShapeMask(pixels, 2, 2, { shape: "rectangle", width: 0.1, height: 0.1, feather: 0, invert: false });
    expect(pixels[3]).toBe(0);
  });
  it("defines floating drag item and insertion beam in Timeline.css", async () => {
    const fs = await import("fs");
    const css = fs.readFileSync("src/components/Timeline.css", "utf-8");
    expect(css).toContain(".tl-floating-drag-item");
    expect(css).toContain(".tl-insertion-beam");
    expect(css).toContain(".tl-track.is-drag-target");
  });
  it("keeps transition block below track headers", async () => {
    const fs = await import("fs");
    const styles = fs.readFileSync("src/styles.css", "utf-8");
    const timelineCss = fs.readFileSync("src/components/Timeline.css", "utf-8");
    expect(styles).toContain(".tl-transition-block {");
    expect(styles).toMatch(/\.tl-transition-block\s*\{[^}]*z-index:\s*6;/);
    expect(timelineCss).toMatch(/\.tl-track-header\s*\{[^}]*z-index:\s*20;/);
  });
  it("preserves blob: and data: URLs in toMediaStreamUrl", async () => {
    const { toMediaStreamUrl } = await import("../src/wails/wailsBridge");
    expect(toMediaStreamUrl("blob:http://localhost:5173/123-abc")).toBe("blob:http://localhost:5173/123-abc");
    expect(toMediaStreamUrl("data:image/svg+xml;utf8,<svg></svg>")).toBe("data:image/svg+xml;utf8,<svg></svg>");
    expect(toMediaStreamUrl("D:/video.mp4")).toContain("/media-stream?path=");
  });
});

