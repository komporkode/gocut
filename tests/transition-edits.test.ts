import { describe, expect, it } from 'vitest';
import { createProject, createClip } from '../src/core/model';
import { addTransition, resizeTransition, removeTransition, applyTransitionToAll } from '../src/core/transitionEdits';
import type { MediaAsset, Project } from '../src/core/types';

function createTestProject(): Project {
  const p = createProject('Transition Test');
  const asset: MediaAsset = {
    id: 'test-asset',
    name: 'test.mp4',
    path: '/test.mp4',
    url: 'file:///test.mp4',
    kind: 'video',
    duration: 60,
    width: 1920,
    height: 1080,
    fps: 30,
    hasAudio: true,
  };
  p.assets = [asset];

  const trackId = p.tracks[1].id; // video track
  const clip1 = { ...createClip(asset, trackId, 0, p.fps), id: 'clip-1', start: 0, duration: 4 };
  const clip2 = { ...createClip(asset, trackId, 4, p.fps), id: 'clip-2', start: 4, duration: 4 };
  const clip3 = { ...createClip(asset, trackId, 8, p.fps), id: 'clip-3', start: 8, duration: 4 };
  p.clips = [clip1, clip2, clip3];
  p.transitions = [];
  return p;
}

describe('transitionEdits core', () => {
  it('adds transition, overlaps incoming clip, and ripples downstream clips', () => {
    const p = createTestProject();
    const videoTrack = p.tracks[1].id;

    const { project, transition } = addTransition(p, videoTrack, 'clip-1', 'clip-2', 'dissolve', 1.0);

    expect(project.transitions).toHaveLength(1);
    expect(transition.id).toBeDefined();
    expect(transition.duration).toBe(1.0);
    expect(transition.type).toBe('dissolve');

    const c1 = project.clips.find((c) => c.id === 'clip-1')!;
    const c2 = project.clips.find((c) => c.id === 'clip-2')!;
    const c3 = project.clips.find((c) => c.id === 'clip-3')!;

    // clip-1 is untouched
    expect(c1.start).toBe(0);
    expect(c1.duration).toBe(4);

    // clip-2 starts 1.0s earlier (overlaps clip-1 by 1.0s)
    expect(c2.start).toBe(3.0);
    expect(c2.duration).toBe(4);

    // clip-3 rippled left by 1.0s
    expect(c3.start).toBe(7.0);
  });

  it('clamps transition duration to minimum duration of adjacent clips', () => {
    const p = createTestProject();
    const videoTrack = p.tracks[1].id;
    const c2 = p.clips.find((c) => c.id === 'clip-2')!;
    c2.duration = 1.5;

    const { transition } = addTransition(p, videoTrack, 'clip-1', 'clip-2', 'slide-left', 3.0);
    expect(transition.duration).toBe(1.5);
  });

  it('resizing transition dynamically adjusts downstream ripple delta', () => {
    const p = createTestProject();
    const videoTrack = p.tracks[1].id;

    const { project, transition } = addTransition(p, videoTrack, 'clip-1', 'clip-2', 'dissolve', 1.0);
    
    // Resize to 1.5s
    const expanded = resizeTransition(project, transition.id, 1.5);
    const expC2 = expanded.clips.find((c) => c.id === 'clip-2')!;
    const expC3 = expanded.clips.find((c) => c.id === 'clip-3')!;
    expect(expC2.start).toBe(2.5);
    expect(expC3.start).toBe(6.5);
    expect(expanded.transitions?.find((t) => t.id === transition.id)?.duration).toBe(1.5);

    // Resize to 0.5s
    const shrunk = resizeTransition(expanded, transition.id, 0.5);
    const shrC2 = shrunk.clips.find((c) => c.id === 'clip-2')!;
    const shrC3 = shrunk.clips.find((c) => c.id === 'clip-3')!;
    expect(shrC2.start).toBe(3.5);
    expect(shrC3.start).toBe(7.5);
    expect(shrunk.transitions?.find((t) => t.id === transition.id)?.duration).toBe(0.5);
  });

  it('removing transition restores original cut flush and shifts downstream clips right', () => {
    const p = createTestProject();
    const videoTrack = p.tracks[1].id;

    const { project, transition } = addTransition(p, videoTrack, 'clip-1', 'clip-2', 'dissolve', 1.0);
    const restored = removeTransition(project, transition.id);

    expect(restored.transitions).toHaveLength(0);
    const c1 = restored.clips.find((c) => c.id === 'clip-1')!;
    const c2 = restored.clips.find((c) => c.id === 'clip-2')!;
    const c3 = restored.clips.find((c) => c.id === 'clip-3')!;

    expect(c1.start).toBe(0);
    expect(c2.start).toBe(4);
    expect(c3.start).toBe(8);
  });

  it('applyTransitionToAll adds transitions to all adjacent zero-gap cuts on the track', () => {
    const p = createTestProject();
    const videoTrack = p.tracks[1].id;

    const res = applyTransitionToAll(p, 'dissolve', 0.5, videoTrack);
    expect(res.transitions).toHaveLength(2);

    const c1 = res.clips.find((c) => c.id === 'clip-1')!;
    const c2 = res.clips.find((c) => c.id === 'clip-2')!;
    const c3 = res.clips.find((c) => c.id === 'clip-3')!;

    expect(c1.start).toBe(0);
    expect(c2.start).toBe(3.5);
    expect(c3.start).toBe(7.0);
  });
});

