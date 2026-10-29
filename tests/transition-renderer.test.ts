import { describe, expect, it } from 'vitest';
import {
  computeTransitionProgress,
  getEqualPowerGain,
  getTransitionVisualModifier,
} from '../src/core/transitionRenderer';

describe('transitionRenderer', () => {
  it('computes normalized progress 0 to 1 during transition window', () => {
    // Transition starts at 3.0s, duration 1.0s
    expect(computeTransitionProgress(2.9, 3.0, 1.0)).toBe(0);
    expect(computeTransitionProgress(3.0, 3.0, 1.0)).toBe(0);
    expect(computeTransitionProgress(3.5, 3.0, 1.0)).toBeCloseTo(0.5);
    expect(computeTransitionProgress(4.0, 3.0, 1.0)).toBe(1);
    expect(computeTransitionProgress(4.5, 3.0, 1.0)).toBe(1);
  });

  it('equal-power gain maintains constant acoustic power without dips', () => {
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      const { gainOut, gainIn } = getEqualPowerGain(p);
      expect(gainOut * gainOut + gainIn * gainIn).toBeCloseTo(1.0, 4);
    }
  });

  it('calculates slide offsets accurately across transition', () => {
    const startMod = getTransitionVisualModifier('slide-left', 0, 1920, 1080);
    expect(startMod.clipA.dx).toBe(0);
    expect(startMod.clipB.dx).toBe(1920);

    const midMod = getTransitionVisualModifier('slide-left', 0.5, 1920, 1080);
    expect(midMod.clipA.dx).toBe(-960);
    expect(midMod.clipB.dx).toBe(960);

    const endMod = getTransitionVisualModifier('slide-left', 1.0, 1920, 1080);
    expect(endMod.clipA.dx).toBe(-1920);
    expect(endMod.clipB.dx).toBe(0);
  });
});
