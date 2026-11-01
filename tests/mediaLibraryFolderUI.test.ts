import { describe, expect, it } from 'vitest';
import type { MediaAsset } from '../src/core/types';
import { extractFolderTree } from '../src/components/MediaLibrary';

describe('MediaLibrary Folder Navigation Helpers', () => {
  const assets: Partial<MediaAsset>[] = [
    { id: '1', name: 'v1.mp4', folder: 'B-Roll' },
    { id: '2', name: 'v2.mp4', folder: 'B-Roll' },
    { id: '3', name: 'sub.mp4', folder: 'B-Roll/Drone' },
    { id: '4', name: 'interview.mp4', folder: 'Interviews' },
    { id: '5', name: 'root.mp4' },
  ];

  it('extracts unique folders with item counts and hierarchy', () => {
    const tree = extractFolderTree(assets as MediaAsset[]);
    expect(tree).toHaveLength(3);

    const broll = tree.find(f => f.path === 'B-Roll');
    expect(broll).toBeDefined();
    expect(broll?.count).toBe(2);

    const drone = tree.find(f => f.path === 'B-Roll/Drone');
    expect(drone).toBeDefined();
    expect(drone?.count).toBe(1);

    const interviews = tree.find(f => f.path === 'Interviews');
    expect(interviews).toBeDefined();
    expect(interviews?.count).toBe(1);
  });
});
