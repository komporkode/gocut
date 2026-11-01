import { describe, expect, it } from 'vitest';
import { FOLDER_DRAG_TYPE } from '../src/components/Timeline';
import { useEditorStore } from '../src/editor/store';
import { createProject } from '../src/core/model';
import type { MediaAsset } from '../src/core/types';

describe('Timeline Folder Drop', () => {
  it('exports FOLDER_DRAG_TYPE constant', () => {
    expect(FOLDER_DRAG_TYPE).toBe('application/x-gocut-folder');
  });

  it('handles folder drag data onto timeline with ripple positioning', () => {
    const p = createProject('Timeline Folder Test');
    const asset1: MediaAsset = {
      id: 'fa1',
      name: 'scene_01.mp4',
      kind: 'video',
      duration: 5,
      path: '/scene_01.mp4',
      url: 'media:///scene_01.mp4',
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: true,
      folder: 'Scenes',
    };
    p.assets = [asset1];
    useEditorStore.setState({ project: p });

    // Drop folder at time 3
    useEditorStore.getState().addFolderToTimeline('Scenes', 'ripple', 3);

    const videoTrack = useEditorStore.getState().project.tracks.find(t => t.kind === 'video');
    const clips = useEditorStore.getState().project.clips.filter(c => c.trackId === videoTrack?.id);

    expect(clips).toHaveLength(1);
    expect(clips[0].name).toBe('scene_01.mp4');
    expect(clips[0].start).toBe(3);
  });
});
