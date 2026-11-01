import { describe, expect, it } from 'vitest';
import { editorAPI } from '../src/wails/wailsBridge';
import { useEditorStore } from '../src/editor/store';
import { createProject } from '../src/core/model';
import type { MediaAsset } from '../src/core/types';

describe('Drag and Drop Import & Path Resolution', () => {
  it('getPathForFile returns empty string when file has no absolute path, NOT file.name', () => {
    const fakeFileWithoutPath = new File(['dummy'], 'video.mp4', { type: 'video/mp4' });
    expect(editorAPI.getPathForFile(fakeFileWithoutPath)).toBe('');

    const fakeFileWithElectronPath = new File(['dummy'], 'video.mp4', { type: 'video/mp4' });
    Object.defineProperty(fakeFileWithElectronPath, 'path', {
      value: 'C:\\Users\\user\\Videos\\video.mp4',
    });
    expect(editorAPI.getPathForFile(fakeFileWithElectronPath)).toBe('C:\\Users\\user\\Videos\\video.mp4');
  });

  it('resolveFilePaths resolves direct paths or returns empty for unresolvable files', async () => {
    expect(typeof editorAPI.resolveFilePaths).toBe('function');

    const file1 = new File(['dummy'], 'clip1.mp4', { type: 'video/mp4' });
    Object.defineProperty(file1, 'path', { value: 'D:/media/clip1.mp4' });

    const file2 = new File(['dummy'], 'clip2.mp4', { type: 'video/mp4' });
    Object.defineProperty(file2, 'path', { value: 'D:\\media\\clip2.mp4' });

    const resolved = await editorAPI.resolveFilePaths!([file1, file2]);
    expect(resolved).toEqual(['D:/media/clip1.mp4', 'D:\\media\\clip2.mp4']);

    const unresolvable = new File(['dummy'], 'browser.mp4', { type: 'video/mp4' });
    const emptyResolved = await editorAPI.resolveFilePaths!([unresolvable]);
    expect(emptyResolved).toEqual([]);
  });

  it('store addAssets normalizes Windows backslashes and forward slashes to avoid false duplicates or drops', () => {
    useEditorStore.getState().setProject(createProject('Test Project'));

    const asset1: MediaAsset = {
      id: 'asset-1',
      name: 'video.mp4',
      path: 'C:\\Users\\user\\video.mp4',
      url: '/media-stream?path=C%3A%5CUsers%5Cuser%5Cvideo.mp4',
      kind: 'video',
      duration: 10,
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: true,
    };

    useEditorStore.getState().addAssets([asset1]);
    expect(useEditorStore.getState().project.assets.length).toBe(1);

    // Incoming with forward slashes referring to same file should not duplicate
    const asset1ForwardSlash: MediaAsset = {
      id: 'asset-1-alt',
      name: 'video.mp4',
      path: 'C:/Users/user/video.mp4',
      url: '/media-stream?path=C%3A%2FUsers%2Fuser%2Fvideo.mp4',
      kind: 'video',
      duration: 10,
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: true,
    };

    useEditorStore.getState().addAssets([asset1ForwardSlash]);
    expect(useEditorStore.getState().project.assets.length).toBe(1);

    // Truly different asset gets added
    const asset2: MediaAsset = {
      id: 'asset-2',
      name: 'clip2.mp4',
      path: 'C:/Users/user/clip2.mp4',
      url: '/media-stream?path=C%3A%2FUsers%2Fuser%2Fclip2.mp4',
      kind: 'video',
      duration: 5,
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: true,
    };

    useEditorStore.getState().addAssets([asset2]);
    expect(useEditorStore.getState().project.assets.length).toBe(2);
  });

  it('defines inspectCapcutPath on editorAPI', () => {
    expect(typeof editorAPI.inspectCapcutPath).toBe('function');
  });
});
