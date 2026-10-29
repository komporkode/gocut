import { describe, expect, it } from 'vitest';
import { createProject, createClip } from '../src/core/model';
import { addTransition } from '../src/core/transitionEdits';
import type { MediaAsset, Project } from '../src/core/types';

describe('timeline transitions logic helpers', () => {
  it('correctly maps adjacent clips into cut-points and existing transitions', () => {
    const p = createProject('Cut helper test');
    const asset: MediaAsset = {
      id: 'a1',
      name: 'v.mp4',
      path: '/v.mp4',
      url: 'file:///v.mp4',
      kind: 'video',
      duration: 30,
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: true,
    };
    p.assets = [asset];
    const trackId = p.tracks[1].id;
    p.clips = [
      { ...createClip(asset, trackId, 0, p.fps), id: 'c1', start: 0, duration: 4 },
      { ...createClip(asset, trackId, 4, p.fps), id: 'c2', start: 4, duration: 4 },
      { ...createClip(asset, trackId, 8, p.fps), id: 'c3', start: 8, duration: 4 },
    ];
    p.transitions = [];

    // Between c1 and c2: add transition
    const { project, transition } = addTransition(p, trackId, 'c1', 'c2', 'dissolve', 0.5);

    // Verify c1-c2 has transition
    const t1 = project.transitions?.find((t) => t.fromClipId === 'c1' && t.toClipId === 'c2');
    expect(t1).toBeDefined();
    expect(t1?.id).toBe(transition.id);

    // Verify c2-c3 has NO transition, but is touching (seam at c2.start + c2.duration = 3.5 + 4 = 7.5)
    const t2 = project.transitions?.find((t) => t.fromClipId === 'c2' && t.toClipId === 'c3');
    expect(t2).toBeUndefined();

    const c2 = project.clips.find((c) => c.id === 'c2')!;
    const c3 = project.clips.find((c) => c.id === 'c3')!;
    const isAdjacent = Math.abs((c2.start + c2.duration) - c3.start) <= 0.05;
    expect(isAdjacent).toBe(true);
  });
});
