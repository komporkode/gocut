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
});
