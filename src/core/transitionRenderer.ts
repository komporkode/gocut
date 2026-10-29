import type { TransitionType } from './types';

export interface VisualModifier {
  dx: number;
  dy: number;
  scale: number;
  alpha: number;
}

/** Compute normalized progress [0, 1] for a transition given the current playback time. */
export function computeTransitionProgress(
  time: number,
  transitionStart: number,
  duration: number
): number {
  if (duration <= 0) return 1;
  const progress = (time - transitionStart) / duration;
  return Math.max(0, Math.min(1, progress));
}

/** Compute equal-power audio gains ensuring acoustic sum (gainOut^2 + gainIn^2) = 1.0. */
export function getEqualPowerGain(progress: number): { gainOut: number; gainIn: number } {
  const p = Math.max(0, Math.min(1, progress));
  return {
    gainOut: Math.cos((p * Math.PI) / 2),
    gainIn: Math.sin((p * Math.PI) / 2),
  };
}

/** Calculate transform/alpha offsets for Clip A (outgoing) and Clip B (incoming). */
export function getTransitionVisualModifier(
  type: TransitionType,
  progress: number,
  width: number,
  height: number
): { clipA: VisualModifier; clipB: VisualModifier } {
  const p = Math.max(0, Math.min(1, progress));

  const defA: VisualModifier = { dx: 0, dy: 0, scale: 1, alpha: 1 };
  const defB: VisualModifier = { dx: 0, dy: 0, scale: 1, alpha: 1 };

  switch (type) {
    case 'dissolve':
      return {
        clipA: { ...defA, alpha: 1 - p },
        clipB: { ...defB, alpha: p },
      };

    case 'dip': {
      const alphaA = p <= 0.5 ? 1 - p * 2 : 0;
      const alphaB = p > 0.5 ? (p - 0.5) * 2 : 0;
      return {
        clipA: { ...defA, alpha: alphaA },
        clipB: { ...defB, alpha: alphaB },
      };
    }

    case 'slide-left':
      return {
        clipA: { ...defA, dx: -p * width || 0 },
        clipB: { ...defB, dx: (1 - p) * width || 0 },
      };

    case 'slide-right':
      return {
        clipA: { ...defA, dx: p * width || 0 },
        clipB: { ...defB, dx: -(1 - p) * width || 0 },
      };

    case 'slide-up':
      return {
        clipA: { ...defA, dy: -p * height || 0 },
        clipB: { ...defB, dy: (1 - p) * height || 0 },
      };

    case 'slide-down':
      return {
        clipA: { ...defA, dy: p * height || 0 },
        clipB: { ...defB, dy: -(1 - p) * height || 0 },
      };

    case 'zoom':
      return {
        clipA: { ...defA, scale: 1 + p * 0.2, alpha: 1 - p },
        clipB: { ...defB, scale: 0.85 + p * 0.15, alpha: p },
      };

    case 'spin':
      return {
        clipA: { ...defA, scale: 1 + p * 0.1, alpha: 1 - p },
        clipB: { ...defB, scale: 0.8 + p * 0.2, alpha: p },
      };

    case 'wipe-left':
    case 'wipe-right':
    default:
      return {
        clipA: { ...defA, alpha: 1 - p },
        clipB: { ...defB, alpha: p },
      };
  }
}
