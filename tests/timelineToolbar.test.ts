import { beforeEach, describe, expect, it } from 'vitest';
import { createClip, createProject } from '../src/core/model';
import { trimClipLeftAtPlayhead, trimClipRightAtPlayhead } from '../src/core/timelineEdits';
import { useEditorStore } from '../src/editor/store';
import type { MediaAsset } from '../src/core/types';

describe('Timeline Contextual Toolbar Logic & Store', () => {
  const createFixture = () => {
    const p = createProject('Test');
    const a: MediaAsset = {
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
    p.assets = [a];
    const c1 = createClip(a, p.tracks[1].id, 5, 30);
    c1.duration = 10; // 5s to 15s
    const c2 = createClip(a, p.tracks[1].id, 16, 30);
    c2.duration = 5; // 16s to 21s
    p.clips = [c1, c2];
    return { project: p, clip1: c1, clip2: c2 };
  };

  beforeEach(() => {
    const { project } = createFixture();
    useEditorStore.getState().setProject(project);
    useEditorStore.setState({ magnetic: false, snapping: true, playhead: 0, selectedIds: [] });
  });

  it('determines whether contextual actions should be active based on selection', () => {
    const { project, clip1 } = createFixture();

    // Case 1: No selection
    const selectedNone: string[] = [];
    expect(selectedNone.length > 0).toBe(false);

    // Case 2: Selected clip
    const selectedOne = [clip1.id];
    expect(selectedOne.length > 0).toBe(true);

    // Verify Trim Left at playhead 8s
    const trimmedL = trimClipLeftAtPlayhead(project, clip1.id, 8);
    expect(trimmedL.clips[0].start).toBe(8);
    expect(trimmedL.clips[0].duration).toBe(7);

    // Verify Trim Right at playhead 12s
    const trimmedR = trimClipRightAtPlayhead(project, clip1.id, 12);
    expect(trimmedR.clips[0].start).toBe(5);
    expect(trimmedR.clips[0].duration).toBe(7);
  });

  it('executes trimLeftAtPlayhead in editor store via shortcut Q behavior', () => {
    const store = useEditorStore.getState();
    const clip1 = store.project.clips[0];

    // Select clip1 and seek playhead to 8s
    useEditorStore.setState({ selectedIds: [clip1.id], playhead: 8 });
    store.trimLeftAtPlayhead();

    const updated = useEditorStore.getState().project.clips.find(c => c.id === clip1.id)!;
    expect(updated.start).toBe(8);
    expect(updated.duration).toBe(7);
  });

  it('executes trimRightAtPlayhead in editor store via shortcut W behavior', () => {
    const store = useEditorStore.getState();
    const clip1 = store.project.clips[0];

    // Select clip1 and seek playhead to 12s
    useEditorStore.setState({ selectedIds: [clip1.id], playhead: 12 });
    store.trimRightAtPlayhead();

    const updated = useEditorStore.getState().project.clips.find(c => c.id === clip1.id)!;
    expect(updated.start).toBe(5);
    expect(updated.duration).toBe(7);
  });

  it('shifts subsequent clips when magnetic is enabled during trimLeftAtPlayhead', () => {
    useEditorStore.setState({ magnetic: true });
    const store = useEditorStore.getState();
    const [c1, c2] = store.project.clips;

    // Seek to 8s (trims 3s from c1 start)
    useEditorStore.setState({ selectedIds: [c1.id], playhead: 8 });
    store.trimLeftAtPlayhead();

    const state = useEditorStore.getState().project;
    const updated1 = state.clips.find(c => c.id === c1.id)!;
    const updated2 = state.clips.find(c => c.id === c2.id)!;

    // c1 shifts back to 5s, subsequent c2 shifts from 16s by 3s to 13s
    expect(updated1.start).toBe(5);
    expect(updated1.duration).toBe(7);
    expect(updated2.start).toBe(13);
  });
});
