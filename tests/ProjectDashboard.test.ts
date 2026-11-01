import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatProjectDuration,
  formatRelativeDate,
  filterAndSortProjects,
} from '../src/components/ProjectDashboard';
import type { ProjectInfo } from '../src/core/types';

describe('ProjectDashboard helpers', () => {
  it('formats byte sizes into readable units like CapCut metadata', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(87.9 * 1024 * 1024)).toBe('87.9 MB');
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
  });

  it('formats project duration in mm:ss format', () => {
    expect(formatProjectDuration(0)).toBe('00:00');
    expect(formatProjectDuration(29)).toBe('00:29');
    expect(formatProjectDuration(110)).toBe('01:50');
    expect(formatProjectDuration(3665)).toBe('01:01:05');
  });

  it('filters projects by name search query', () => {
    const list: ProjectInfo[] = [
      { id: '1', name: 'SUMU1', path: '/sumu1.gct', sizeBytes: 1000, duration: 29, updatedAt: '2026-10-31T10:00:00Z' },
      { id: '2', name: 'WNI Vlog', path: '/wni.gct', sizeBytes: 2000, duration: 110, updatedAt: '2026-10-31T11:00:00Z' },
      { id: '3', name: 'SUMU BDG', path: '/bdg.gct', sizeBytes: 3000, duration: 24, updatedAt: '2026-10-31T09:00:00Z' },
    ];

    const filtered = filterAndSortProjects(list, 'sumu', 'recent');
    expect(filtered).toHaveLength(2);
    expect(filtered.map(p => p.name)).toEqual(['SUMU1', 'SUMU BDG']);
  });

  it('sorts projects by recent or name', () => {
    const list: ProjectInfo[] = [
      { id: '1', name: 'B Project', path: '/b.gct', sizeBytes: 1000, duration: 10, updatedAt: '2026-10-30T10:00:00Z' },
      { id: '2', name: 'A Project', path: '/a.gct', sizeBytes: 2000, duration: 20, updatedAt: '2026-10-31T10:00:00Z' },
    ];

    const byRecent = filterAndSortProjects(list, '', 'recent');
    expect(byRecent[0].name).toBe('A Project');

    const byName = filterAndSortProjects(list, '', 'name');
    expect(byName[0].name).toBe('A Project');
    expect(byName[1].name).toBe('B Project');
  });

  it('formats relative date correctly', () => {
    expect(formatRelativeDate('')).toBe('');
    const now = new Date();
    expect(formatRelativeDate(now.toISOString())).toMatch(/^\d{2}:\d{2}$/);
    const past = new Date('2024-05-15T12:00:00Z');
    expect(formatRelativeDate(past.toISOString())).toContain('2024');
  });
});
