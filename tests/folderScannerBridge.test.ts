import { describe, expect, it } from 'vitest';
import { editorAPI } from '../src/wails/wailsBridge';

describe('Folder Scanner Bridge API', () => {
  it('defines chooseMediaFolder and importMediaFolder methods on editorAPI', () => {
    expect(typeof editorAPI.chooseMediaFolder).toBe('function');
    expect(typeof editorAPI.importMediaFolder).toBe('function');
  });

  it('imports mock media folder with relative folder metadata', async () => {
    const assets = await editorAPI.importMediaFolder?.('/test/folder');
    expect(assets).toBeDefined();
    expect(Array.isArray(assets)).toBe(true);
    if (assets && assets.length > 0) {
      expect(assets[0].folder).toBeDefined();
    }
  });
});
