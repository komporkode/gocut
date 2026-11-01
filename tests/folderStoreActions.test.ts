import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '../src/editor/store';
import { createProject } from '../src/core/model';
import type { MediaAsset } from '../src/core/types';

describe('Editor Store Folder Actions', () => {
  beforeEach(() => {
    const p = createProject('Folder Store Test');
    const a1: MediaAsset = {
      id: 'a1',
      name: '01_broll.mp4',
      kind: 'video',
      path: '/broll/01_broll.mp4',
      url: 'media:///broll/01_broll.mp4',
      duration: 4,
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: true,
      folder: 'B-Roll',
    };
    const a2: MediaAsset = {
      id: 'a2',
      name: '02_broll.mp4',
      kind: 'video',
      path: '/broll/02_broll.mp4',
      url: 'media:///broll/02_broll.mp4',
      duration: 3,
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: true,
      folder: 'B-Roll',
    };
    p.assets = [a1, a2];
    useEditorStore.setState({ project: p });
  });

  it('renames a folder across all matching assets', () => {
    useEditorStore.getState().renameFolder('B-Roll', 'Highlights');
    const assets = useEditorStore.getState().project.assets;
    expect(assets.every(a => a.folder === 'Highlights')).toBe(true);
  });

  it('deletes a folder and moves its assets safely to root (undefined folder)', () => {
    useEditorStore.getState().deleteFolder('B-Roll');
    const assets = useEditorStore.getState().project.assets;
    expect(assets).toHaveLength(2);
    expect(assets.every(a => !a.folder)).toBe(true);
  });

  it('moves a single asset to another folder', () => {
    useEditorStore.getState().moveAssetToFolder('a1', 'Interviews');
    const a1 = useEditorStore.getState().project.assets.find(a => a.id === 'a1');
    const a2 = useEditorStore.getState().project.assets.find(a => a.id === 'a2');
    expect(a1?.folder).toBe('Interviews');
    expect(a2?.folder).toBe('B-Roll');
  });

  it('adds all folder assets to timeline sequentially', () => {
    useEditorStore.getState().addFolderToTimeline('B-Roll', 'append');
    const clips = useEditorStore.getState().project.clips;
    expect(clips).toHaveLength(2);
    expect(clips[0].name).toBe('01_broll.mp4');
    expect(clips[0].start).toBe(0);
    expect(clips[1].name).toBe('02_broll.mp4');
    expect(clips[1].start).toBe(4);
  });
});
