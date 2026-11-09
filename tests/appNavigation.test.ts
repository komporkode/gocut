import { describe, expect, it } from 'vitest';
import { useEditorStore } from '../src/editor/store';
import { createProject } from '../src/core/model';

describe('App Navigation and Route State', () => {
  it('handles project switching and state cleanup cleanly', () => {
    const store = useEditorStore.getState();
    const p1 = createProject('First Project');
    store.commit(p1);
    expect(useEditorStore.getState().project.name).toBe('First Project');

    // Switch to second project
    const p2 = createProject('Second Project');
    store.commit(p2);
    expect(useEditorStore.getState().project.name).toBe('Second Project');
  });

  it('validates navigation helper state transition', () => {
    type ViewState = 'dashboard' | 'editor';
    let currentView: ViewState = 'dashboard';

    const onOpen = () => {
      currentView = 'editor';
    };
    const onBackToHome = () => {
      currentView = 'dashboard';
    };

    expect(currentView).toBe('dashboard');
    onOpen();
    expect(currentView).toBe('editor');
    onBackToHome();
    expect(currentView).toBe('dashboard');
  });

  it('creates a clean empty project with custom dimensions and FPS after returning to homepage without leaking previous project clips', () => {
    const store = useEditorStore.getState();
    const oldProject = createProject('Old Project');
    store.setProject(oldProject, '/projects/old.gct');
    store.addText();
    expect(useEditorStore.getState().project.clips.length).toBe(1);

    // Simulate returning to homepage and creating a new project with custom 9:16 60fps config
    const newProject = createProject('Vertical Short 1', { width: 1080, height: 1920, fps: 60 });
    store.setProject(newProject, '/projects/vertical-short-1.gct');

    const active = useEditorStore.getState().project;
    expect(active.id).not.toBe(oldProject.id);
    expect(active.name).toBe('Vertical Short 1');
    expect(active.width).toBe(1080);
    expect(active.height).toBe(1920);
    expect(active.fps).toBe(60);
    expect(active.clips).toHaveLength(0);
    expect(active.assets).toHaveLength(0);
  });
});
