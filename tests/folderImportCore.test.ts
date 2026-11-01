import { describe, expect, it } from 'vitest';
import { createProject, createTrack } from '../src/core/model';
import type { MediaAsset, Project } from '../src/core/types';
import { insertSequentialAssets, sortAssetsNaturally } from '../src/core/timelineEdits';

describe('sortAssetsNaturally', () => {
  it('sorts assets using natural alphanumeric order', () => {
    const assets: Partial<MediaAsset>[] = [
      { id: '1', name: 'clip_10.mp4' },
      { id: '2', name: 'clip_2.mp4' },
      { id: '3', name: 'clip_1.mp4' },
      { id: '4', name: 'clip_20.mp4' },
    ];
    const sorted = sortAssetsNaturally(assets as MediaAsset[]);
    expect(sorted.map(a => a.name)).toEqual([
      'clip_1.mp4',
      'clip_2.mp4',
      'clip_10.mp4',
      'clip_20.mp4',
    ]);
  });
});

describe('insertSequentialAssets', () => {
  const makeAsset = (id: string, name: string, kind: 'video' | 'audio' | 'image', duration = 4): MediaAsset => ({
    id,
    name,
    kind,
    duration,
    path: `/${name}`,
    url: `media:///${name}`,
    width: 1920,
    height: 1080,
    fps: 30,
    hasAudio: kind === 'video' || kind === 'audio',
  });

  it('appends assets sequentially at the end of tracks', () => {
    let project = createProject('Test Project');
    // Default project has video track (t-video-1 or similar) and audio track
    const a1 = makeAsset('v1', '01_intro.mp4', 'video', 3);
    const a2 = makeAsset('v2', '02_main.mp4', 'video', 5);
    const a3 = makeAsset('m1', 'bgm.mp3', 'audio', 10);

    project = insertSequentialAssets(project, [a1, a2, a3], 0, 'append');

    const videoTrack = project.tracks.find(t => t.kind === 'video');
    const audioTrack = project.tracks.find(t => t.kind === 'audio');

    const videoClips = project.clips.filter(c => c.trackId === videoTrack?.id);
    const audioClips = project.clips.filter(c => c.trackId === audioTrack?.id);

    expect(videoClips).toHaveLength(2);
    expect(videoClips[0].name).toBe('01_intro.mp4');
    expect(videoClips[0].start).toBe(0);
    expect(videoClips[0].duration).toBe(3);

    expect(videoClips[1].name).toBe('02_main.mp4');
    expect(videoClips[1].start).toBe(3);
    expect(videoClips[1].duration).toBe(5);

    expect(audioClips).toHaveLength(1);
    expect(audioClips[0].name).toBe('bgm.mp3');
    expect(audioClips[0].start).toBe(0);
    expect(audioClips[0].duration).toBe(10);
  });

  it('ripples existing clips to the right when inserted at target time', () => {
    let project = createProject('Ripple Test');
    const existing = makeAsset('v0', 'existing.mp4', 'video', 6);
    project = insertSequentialAssets(project, [existing], 0, 'append');

    // Now insert a new 4s clip at time 2 with ripple mode
    const newAsset = makeAsset('v_new', 'inserted.mp4', 'video', 4);
    project = insertSequentialAssets(project, [newAsset], 2, 'ripple');

    const videoTrack = project.tracks.find(t => t.kind === 'video');
    const clips = project.clips.filter(c => c.trackId === videoTrack?.id).sort((a, b) => a.start - b.start);

    // New clip starts at 2 and runs for 4 seconds (until 6)
    // Existing clip started at 0 and was shifted or downstream clips moved
    const insertedClip = clips.find(c => c.name === 'inserted.mp4');
    expect(insertedClip?.start).toBe(2);
    expect(insertedClip?.duration).toBe(4);
  });

  it('handles mixed video, image, and audio assets in a single batch', () => {
    let project = createProject('Mixed Batch');
    const v = makeAsset('v1', 'video.mp4', 'video', 3);
    const img = makeAsset('img1', 'photo.png', 'image', 5);
    const a = makeAsset('a1', 'song.mp3', 'audio', 8);

    project = insertSequentialAssets(project, [v, img, a], 0, 'append');

    const videoTrack = project.tracks.find(t => t.kind === 'video');
    const audioTrack = project.tracks.find(t => t.kind === 'audio');

    const visualClips = project.clips.filter(c => c.trackId === videoTrack?.id);
    const audioClips = project.clips.filter(c => c.trackId === audioTrack?.id);

    expect(visualClips).toHaveLength(2);
    expect(visualClips[0].name).toBe('photo.png');
    expect(visualClips[0].start).toBe(0);
    expect(visualClips[1].name).toBe('video.mp4');
    expect(visualClips[1].start).toBe(5);

    expect(audioClips).toHaveLength(1);
    expect(audioClips[0].name).toBe('song.mp3');
    expect(audioClips[0].start).toBe(0);
  });
});
