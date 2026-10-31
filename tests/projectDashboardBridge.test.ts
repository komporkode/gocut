import { describe, expect, it } from 'vitest';
import { editorAPI } from '../src/wails/wailsBridge';

describe('Project Dashboard Bridge API', () => {
  it('defines required project management CRUD methods', () => {
    expect(typeof editorAPI.listProjects).toBe('function');
    expect(typeof editorAPI.createProject).toBe('function');
    expect(typeof editorAPI.duplicateProject).toBe('function');
    expect(typeof editorAPI.renameProject).toBe('function');
    expect(typeof editorAPI.deleteProject).toBe('function');
    expect(typeof editorAPI.saveProjectCover).toBe('function');
  });

  it('creates, lists, renames, duplicates, and deletes projects via bridge mock', async () => {
    // 1. Create a project
    const created = await editorAPI.createProject('My Test Video');
    expect(created.project.name).toBe('My Test Video');
    expect(created.path).toBeTruthy();

    // 2. List projects
    let list = await editorAPI.listProjects();
    const found = list.find(p => p.path === created.path);
    expect(found).toBeDefined();
    expect(found?.name).toBe('My Test Video');

    // 3. Save cover
    await editorAPI.saveProjectCover(created.path, 'data:image/png;base64,mockcover');
    list = await editorAPI.listProjects();
    const withCover = list.find(p => p.path === created.path);
    expect(withCover?.cover).toBe('data:image/png;base64,mockcover');

    // 4. Rename
    const renamed = await editorAPI.renameProject(created.path, 'My Renamed Video');
    expect(renamed.name).toBe('My Renamed Video');

    // 5. Duplicate
    const duplicated = await editorAPI.duplicateProject(renamed.path);
    expect(duplicated.name).toContain('Copy');

    // 6. Delete both
    const del1 = await editorAPI.deleteProject(renamed.path);
    expect(del1).toBe(true);
    const del2 = await editorAPI.deleteProject(duplicated.path);
    expect(del2).toBe(true);

    const finalList = await editorAPI.listProjects();
    expect(finalList.find(p => p.path === renamed.path)).toBeUndefined();
    expect(finalList.find(p => p.path === duplicated.path)).toBeUndefined();
  });
});
