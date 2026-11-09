import { describe, expect, it } from 'vitest';
import { editorAPI } from '../src/wails/wailsBridge';

describe('Auto-Updater Bridge API', () => {
  it('defines required updater methods in editorAPI', () => {
    expect(typeof editorAPI.checkForUpdate).toBe('function');
    expect(typeof editorAPI.downloadUpdate).toBe('function');
    expect(typeof editorAPI.onUpdateProgress).toBe('function');
    expect(typeof editorAPI.onUpdateAvailable).toBe('function');
    expect(typeof editorAPI.installUpdate).toBe('function');
    expect(typeof editorAPI.getUpdateSettings).toBe('function');
    expect(typeof editorAPI.setUpdateSettings).toBe('function');
  });

  it('can get and set update settings', async () => {
    const settings = await editorAPI.getUpdateSettings?.();
    expect(settings).toBeDefined();
    expect(typeof settings?.autoCheck).toBe('boolean');

    // Toggle setting
    await editorAPI.setUpdateSettings?.({ autoCheck: false });
    // In mock/bridge environment it handles calls safely without throwing
  });

  it('safe execution for checkForUpdate and downloadUpdate in non-wails test environment', async () => {
    const checkRes = await editorAPI.checkForUpdate?.(true);
    // In mock/test environment without backend Wails running, returns null safely
    expect(checkRes === null || typeof checkRes === 'object').toBe(true);

    const downloadRes = await editorAPI.downloadUpdate?.('https://example.com/update.exe');
    expect(downloadRes === null || typeof downloadRes === 'string').toBe(true);
  });
});

