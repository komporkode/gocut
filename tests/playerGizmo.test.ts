import { describe, expect, it } from 'vitest';

describe('Player Gizmo & Aspect Ratio Logic', () => {
  const getPresetDimensions = (ratio: string): { width: number; height: number } => {
    switch (ratio) {
      case '9:16':
        return { width: 1080, height: 1920 };
      case '16:9':
        return { width: 1920, height: 1080 };
      case '1:1':
        return { width: 1080, height: 1080 };
      case '4:3':
        return { width: 1440, height: 1080 };
      case '3:4':
        return { width: 1080, height: 1440 };
      default:
        return { width: 1920, height: 1080 };
    }
  };

  it('provides standard aspect ratio dimensions matching CapCut defaults', () => {
    expect(getPresetDimensions('16:9')).toEqual({ width: 1920, height: 1080 });
    expect(getPresetDimensions('9:16')).toEqual({ width: 1080, height: 1920 });
    expect(getPresetDimensions('1:1')).toEqual({ width: 1080, height: 1080 });
    expect(getPresetDimensions('4:3')).toEqual({ width: 1440, height: 1080 });
  });

  it('computes canvas ratio and scaled gizmo bounds accurately', () => {
    const project = { width: 1920, height: 1080 };
    const displayW = 960;
    const canvasRatio = displayW / project.width; // 0.5

    const baseW = 800;
    const baseH = 600;
    const scale = 1.2;

    const scaledW = Math.max(20, baseW * scale * canvasRatio);
    const scaledH = Math.max(20, baseH * scale * canvasRatio);

    expect(canvasRatio).toBe(0.5);
    expect(scaledW).toBe(480); // 800 * 1.2 * 0.5
    expect(scaledH).toBe(360); // 600 * 1.2 * 0.5
  });

  it('calculates rotation angles from center coordinates and handles 15-degree snapping', () => {
    const calcAngle = (cx: number, cy: number, px: number, py: number): number => {
      const rad = Math.atan2(py - cy, px - cx);
      return (rad * 180) / Math.PI;
    };

    const snapAngle = (angle: number, shiftKey: boolean): number => {
      if (!shiftKey) return Math.round(angle * 10) / 10;
      return Math.round(angle / 15) * 15;
    };

    // Right of center: 0 deg
    expect(calcAngle(100, 100, 200, 100)).toBeCloseTo(0);
    // Directly below: 90 deg
    expect(calcAngle(100, 100, 100, 200)).toBeCloseTo(90);

    // Snapping:
    expect(snapAngle(43.7, false)).toBe(43.7);
    expect(snapAngle(43.7, true)).toBe(45);
    expect(snapAngle(88, true)).toBe(90);
  });
});
