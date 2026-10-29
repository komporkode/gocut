import { describe, expect, it, beforeEach } from 'vitest';
import { useEditorStore } from '../src/editor/store';
import { createProject, createClip } from '../src/core/model';
import type { MediaAsset } from '../src/core/types';

describe('useEditorStore transitions', () => {
  beforeEach(() => {
    const p = createProject('Store Transition Test');
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
    useEditorStore.setState({
      project: p,
      past: [],
      future: [],
      selectedIds: [],
      selectedTransitionId: null,
    });
  });

  it('manages selectedTransitionId and clears selected clip ids', () => {
    const store = useEditorStore.getState();
    store.select(['c1']);
    expect(useEditorStore.getState().selectedIds).toEqual(['c1']);

    store.selectTransition('t-123');
    expect(useEditorStore.getState().selectedTransitionId).toBe('t-123');
    expect(useEditorStore.getState().selectedIds).toEqual([]);

    store.selectTransition(null);
    expect(useEditorStore.getState().selectedTransitionId).toBeNull();
  });

  it('adds transition, supports undo and redo', () => {
    const store = useEditorStore.getState();
    const trackId = store.project.tracks[1].id;

    store.addTransitionRecord(trackId, 'c1', 'c2', 'dissolve', 1.0);
    const p1 = useEditorStore.getState().project;
    expect(p1.transitions).toHaveLength(1);
    expect(p1.transitions![0].type).toBe('dissolve');
    expect(p1.transitions![0].duration).toBe(1.0);

    // Undo restores state
    store.undo();
    const pUndo = useEditorStore.getState().project;
    expect(pUndo.transitions).toHaveLength(0);
    expect(pUndo.clips.find((c) => c.id === 'c2')!.start).toBe(4);

    // Redo reapplies transition
    store.redo();
    const pRedo = useEditorStore.getState().project;
    expect(pRedo.transitions).toHaveLength(1);
    expect(pRedo.clips.find((c) => c.id === 'c2')!.start).toBe(3);
  });

  it('resizes transition and supports undo', () => {
    const store = useEditorStore.getState();
    const trackId = store.project.tracks[1].id;

    store.addTransitionRecord(trackId, 'c1', 'c2', 'dissolve', 1.0);
    const transId = useEditorStore.getState().project.transitions![0].id;

    store.resizeTransitionRecord(transId, 1.5);
    expect(useEditorStore.getState().project.transitions![0].duration).toBe(1.5);
    expect(useEditorStore.getState().project.clips.find((c) => c.id === 'c2')!.start).toBe(2.5);

    store.undo();
    expect(useEditorStore.getState().project.transitions![0].duration).toBe(1.0);
  });

  it('removes transition by id and clears selection if selected', () => {
    const store = useEditorStore.getState();
    const trackId = store.project.tracks[1].id;

    store.addTransitionRecord(trackId, 'c1', 'c2', 'dissolve', 1.0);
    const transId = useEditorStore.getState().project.transitions![0].id;
    store.selectTransition(transId);

    store.removeTransitionRecord(transId);
    expect(useEditorStore.getState().project.transitions).toHaveLength(0);
    expect(useEditorStore.getState().selectedTransitionId).toBeNull();
  });
});

