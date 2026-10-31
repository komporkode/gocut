import { describe, expect, it } from 'vitest';
import { createClip, createProject } from '../src/core/model';
import { trimClipLeftAtPlayhead, trimClipRightAtPlayhead } from '../src/core/timelineEdits';
import type { MediaAsset } from '../src/core/types';

describe('trimClipLeftAtPlayhead & trimClipRightAtPlayhead', () => {
  const setup = () => {
    const p = createProject('Test Project');
    const a: MediaAsset = {
      id: 'a1',
      name: 'clip.mp4',
      path: '/clip.mp4',
      url: 'file:///clip.mp4',
      kind: 'video',
      duration: 30,
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: true,
    };
    p.assets = [a];
    const c = createClip(a, p.tracks[1].id, 10, p.fps);
    c.duration = 10; // 10s to 20s
    c.sourceIn = 5;
    p.clips = [c];
    return { project: p, clip: c };
  };

  it('trims left part of clip at playhead and retains right portion', () => {
    const { project, clip } = setup();
    // Playhead at 14s (inside 10-20s, 4s into the clip)
    const result = trimClipLeftAtPlayhead(project, clip.id, 14, false);
    expect(result.clips).toHaveLength(1);
    const trimmed = result.clips[0];
    expect(trimmed.start).toBe(14);
    expect(trimmed.duration).toBe(6);
    expect(trimmed.sourceIn).toBe(9); // 5 + 4
  });

  it('trims left part with magnetic ripple snapping to start', () => {
    const { project, clip } = setup();
    // Playhead at 14s, with magnetic ripple
    const result = trimClipLeftAtPlayhead(project, clip.id, 14, true);
    expect(result.clips).toHaveLength(1);
    const trimmed = result.clips[0];
    // In magnetic mode on this track, remaining clip shifts left to close the gap
    expect(trimmed.start).toBe(10);
    expect(trimmed.duration).toBe(6);
    expect(trimmed.sourceIn).toBe(9);
  });

  it('trims right part of clip at playhead and retains left portion', () => {
    const { project, clip } = setup();
    // Playhead at 16s (inside 10-20s, 6s into clip)
    const result = trimClipRightAtPlayhead(project, clip.id, 16);
    expect(result.clips).toHaveLength(1);
    const trimmed = result.clips[0];
    expect(trimmed.start).toBe(10);
    expect(trimmed.duration).toBe(6);
    expect(trimmed.sourceIn).toBe(5);
  });

  it('safely does nothing if playhead is outside the clip', () => {
    const { project, clip } = setup();
    const before = JSON.stringify(project);
    const r1 = trimClipLeftAtPlayhead(project, clip.id, 5); // before clip
    expect(JSON.stringify(r1)).toBe(before);
    const r2 = trimClipRightAtPlayhead(project, clip.id, 25); // after clip
    expect(JSON.stringify(r2)).toBe(before);
  });
});
