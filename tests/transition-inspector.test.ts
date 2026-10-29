import { describe, expect, it } from 'vitest';
import { TRANSITION_PRESETS } from '../src/core/creativePresets';

describe('transition presets for inspector', () => {
  it('contains expected categories and presets', () => {
    expect(TRANSITION_PRESETS.length).toBeGreaterThanOrEqual(8);
    const dissolve = TRANSITION_PRESETS.find((p) => p.id === 'dissolve');
    expect(dissolve).toBeDefined();
    expect(dissolve?.name).toBe('Cross Dissolve');
  });
});
