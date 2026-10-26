import type { Clip, MediaAsset, Project, Track } from './types';
import { clone, createClip, createTrack, changeClipSpeed, id, snapToFrame, splitClip, trimClip, validateProject } from './model';
import { DEFAULT_TRANSFORM, DEFAULT_ADJUSTMENTS } from './defaults';

export type PlacementMode = 'insert' | 'overwrite' | 'overlay';
const end = (c: Clip) => c.start + c.duration;
const locked = (p: Project, c: Clip) => p.tracks.find(t => t.id === c.trackId)?.locked ?? true;

/** Keep the clicked clip first so the inspector continues to show that clip. */
export function linkedIds(p: Project, ids: string[]): string[] {
  const groups = new Set(p.clips.filter(c => ids.includes(c.id) && c.linkId).map(c => c.linkId));
  return [...new Set([...ids, ...p.clips.filter(c => c.linkId && groups.has(c.linkId)).map(c => c.id)])];
}
export function unlinkClips(p: Project, ids: string[]): Project {
  const members = new Set(linkedIds(p, ids));
  if (p.clips.some(c => members.has(c.id) && locked(p, c))) return p;
  return { ...p, clips: p.clips.map(c => members.has(c.id) ? { ...c, linkId: undefined } : c) };
}
export function separateAudio(p: Project, clipId: string): { project: Project; audioId: string } {
  const video = p.clips.find(c => c.id === clipId);
  const asset = p.assets.find(a => a.id === video?.assetId);
  if (!video || !asset || (asset.kind !== 'video' && !asset.hasAudio)) {
    throw new Error('Please select a video clip with audio');
  }
  if (locked(p, video)) throw new Error('Cannot edit locked track');

  const videoTrackIndex = p.tracks.findIndex(t => t.id === video.trackId);
  let audioTrack = p.tracks.slice(videoTrackIndex + 1).find(t => t.kind === 'audio' && !t.locked)
    ?? p.tracks.find(t => t.kind === 'audio' && !t.locked);

  let updatedTracks = [...p.tracks];
  if (!audioTrack) {
    audioTrack = createTrack('audio', `Audio ${p.tracks.filter(t => t.kind === 'audio').length + 1}`);
    updatedTracks.push(audioTrack);
  }

  const audioAsset: MediaAsset = {
    ...asset,
    id: id(),
    kind: 'audio',
    name: `${asset.name} (Audio)`,
    width: 0,
    height: 0,
    thumbnail: undefined,
  };

  const linkId = video.linkId ?? id();
  const audioClip: Clip = {
    ...clone(video),
    id: id(),
    assetId: audioAsset.id,
    trackId: audioTrack.id,
    name: `${video.name} (Audio)`,
    linkId,
    muted: false,
    text: undefined,
    keyframes: video.keyframes.filter(k => k.property === 'volume').map(k => ({ ...clone(k), id: id() })),
  };

  const updatedClips = p.clips.map(c => c.id === video.id ? { ...c, muted: true, linkId } : c);
  updatedClips.push(audioClip);

  return {
    audioId: audioClip.id,
    project: {
      ...p,
      assets: [...p.assets, audioAsset],
      tracks: updatedTracks,
      clips: updatedClips,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function recoverAudio(p: Project, clipId: string): Project {
  const target = p.clips.find(c => c.id === clipId);
  if (!target) return p;

  const targetTrack = p.tracks.find(t => t.id === target.trackId);
  const isTargetAudio = targetTrack?.kind === 'audio' || target.name.endsWith(' (Audio)');

  if (isTargetAudio && target.linkId) {
    const parentVideo = p.clips.find(c => c.id !== target.id && c.linkId === target.linkId && p.tracks.find(t => t.id === c.trackId)?.kind !== 'audio');
    const remainingClips = p.clips.filter(c => c.id !== target.id);
    const remainingAssets = p.assets.filter(a => a.id !== target.assetId);
    return {
      ...p,
      assets: remainingAssets,
      clips: remainingClips.map(c => c.id === parentVideo?.id ? { ...c, muted: false, linkId: undefined } : c),
      updatedAt: new Date().toISOString(),
    };
  }

  if (target.muted && target.linkId) {
    const audioClip = p.clips.find(c => c.id !== target.id && c.linkId === target.linkId && p.tracks.find(t => t.id === c.trackId)?.kind === 'audio');
    const remainingClips = p.clips.filter(c => c.id !== audioClip?.id);
    const remainingAssets = p.assets.filter(a => a.id !== audioClip?.assetId);
    return {
      ...p,
      assets: remainingAssets,
      clips: remainingClips.map(c => c.id === target.id ? { ...c, muted: false, linkId: undefined } : c),
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    ...p,
    clips: p.clips.map(c => c.id === target.id ? { ...c, muted: false } : c),
    updatedAt: new Date().toISOString(),
  };
}

export const detachLinkedAudio = separateAudio;

/** Clamp the requested edge delta once against every member's source handles. */
export function trimLinked(p: Project, clipId: string, edge: 'start' | 'end', time: number): Project {
  const primary = p.clips.find(c => c.id === clipId);
  if (!primary || !Number.isFinite(time)) return p;
  const ids = new Set(linkedIds(p, [clipId]));
  const members = p.clips.filter(c => ids.has(c.id));
  if (members.some(c => locked(p, c))) return p;
  const edgeAt = (c: Clip) => edge === 'start' ? c.start : end(c);
  const requested = snapToFrame(time, p.fps) - edgeAt(primary);
  let delta = requested;
  for (const c of members) {
    const next = trimClip(p, c.id, edge, edgeAt(c) + requested).clips.find(v => v.id === c.id)!;
    const allowed = edgeAt(next) - edgeAt(c);
    delta = requested > 0 ? Math.min(delta, allowed) : Math.max(delta, allowed);
  }
  for (const c of members) p = trimClip(p, c.id, edge, edgeAt(c) + delta);
  return p;
}

/** A split creates independent left/right linked groups, never a four-clip group. */
export function splitLinked(p: Project, ids: string[], time: number): Project {
  const selected = new Set(linkedIds(p, ids));
  const members = p.clips.filter(c => selected.has(c.id));
  if (members.some(c => locked(p, c))) return p;
  const originalIds = new Set(p.clips.map(c => c.id));
  const rightGroups = new Map<string, string>();
  for (const c of members) {
    const next = splitClip(p, c.id, time);
    if (c.linkId && next !== p) {
      if (!rightGroups.has(c.linkId)) rightGroups.set(c.linkId, id());
      p = { ...next, clips: next.clips.map(v => !originalIds.has(v.id) && v.linkId === c.linkId
        ? { ...v, linkId: rightGroups.get(c.linkId!) } : v) };
      for (const v of p.clips) originalIds.add(v.id);
    } else p = next;
  }
  return p;
}

// A retained interval uses the same boundary anchors and fade windows as manual trimming.
function retain(p: Project, c: Clip, from: number, to: number): Clip | undefined {
  if (to - from < 1 / p.fps - 1e-8) return undefined;
  let part = { ...p, clips: [clone(c)] };
  if (to < end(c) - 1e-8) part = trimClip(part, c.id, 'end', to);
  if (from > c.start + 1e-8) part = trimClip(part, c.id, 'start', from);
  return part.clips[0];
}

/** Insert ripples the entire sequence; overwrite cuts only destination clips and their linked partners. */
export function placeAsset(p: Project, assetId: string, trackId: string | undefined, time: number,
  range: { sourceIn: number; duration: number }, mode: PlacementMode): { project: Project; clipId: string } {
  const asset = p.assets.find(a => a.id === assetId);
  if (!asset || asset.missing || !Number.isFinite(time) || time < 0 ||
      !Number.isFinite(range.sourceIn) || !Number.isFinite(range.duration) || range.sourceIn < 0 ||
      range.duration < 1 / p.fps - 1e-9 || range.duration > 86400 ||
      (asset.kind === 'image' ? range.sourceIn !== 0 : range.sourceIn + range.duration > asset.duration + 1e-8))
    throw new Error('素材选段无效或超出源素材范围');
  if (!['insert', 'overwrite', 'overlay'].includes(mode)) throw new Error('未知入轨模式');
  const accepts = (kind: string) => kind === asset.kind || (asset.kind === 'image' && kind === 'video');
  let track = trackId ? p.tracks.find(t => t.id === trackId) : p.tracks.find(t => accepts(t.kind) && !t.locked);
  if (trackId && (!track || track.locked || !accepts(track.kind))) throw new Error('目标轨道已锁定或不兼容');
  if (!track) { track = createTrack(asset.kind); p = { ...p, tracks: [...p.tracks, track] }; }
  const clip = createClip(asset, track.id, time, p.fps);
  clip.sourceIn = range.sourceIn;
  // Do not extend the selected source range to round a fractional final frame up.
  clip.duration = Math.floor((range.duration + 1e-9) * p.fps) / p.fps;
  const from = clip.start, to = end(clip);
  const targetIds = new Set(linkedIds(p, p.clips.filter(c => c.trackId === track!.id && c.start < to - 1e-8 && end(c) > from + 1e-8).map(c => c.id)));
  const affected = (c: Clip) => mode === 'insert' ? end(c) > from + 1e-8 : mode === 'overwrite' && targetIds.has(c.id);
  if (p.clips.some(c => affected(c) && locked(p, c))) throw new Error('操作会改变锁定轨道上的片段，请先解锁相关轨道');
  const rightGroups = new Map<string, string>();
  const rightGroup = (c: Clip) => {
    if (!c.linkId) return undefined;
    if (!rightGroups.has(c.linkId)) rightGroups.set(c.linkId, id());
    return rightGroups.get(c.linkId);
  };
  const clips = p.clips.flatMap(c => {
    if (!affected(c)) return [c];
    if (mode === 'insert' && c.start >= from - 1e-8) return [{ ...c, start: c.start + clip.duration }];
    const left = retain(p, c, c.start, Math.min(from, end(c)));
    const right = retain(p, c, Math.max(mode === 'insert' ? from : to, c.start), end(c));
    if (right) {
      if (left) { right.id = id(); right.keyframes = right.keyframes.map(k => ({ ...k, id: id() })); }
      right.linkId = rightGroup(c);
      if (mode === 'insert') right.start += clip.duration;
    }
    return [left, right].filter((v): v is Clip => !!v);
  });
  return { project: validateProject({ ...p, clips: [...clips, clip] }), clipId: clip.id };
}

/** Shared by pointer, inspector and assistant edits. Linked partners keep their own tracks. */
export function moveLinked(p: Project, ids: string[], delta: number, trackId?: string): Project {
  if (!Number.isFinite(delta)) return p;
  const selected = new Set(linkedIds(p, ids));
  const members = p.clips.filter(c => selected.has(c.id));
  if (!members.length || members.some(c => locked(p, c))) return p;
  const target = p.tracks.find(t => t.id === trackId && !t.locked);
  const adjusted = Math.max(snapToFrame(delta, p.fps), -Math.min(...members.map(c => c.start)));
  return { ...p, clips: p.clips.map(c => !selected.has(c.id) ? c : { ...c,
    start: c.start + adjusted,
    trackId: target && (c.text ? target.kind === 'text' : p.assets.some(a => a.id === c.assetId && (a.kind === target.kind || (a.kind === 'image' && target.kind === 'video')))) ? target.id : c.trackId,
  }) };
}
export function speedLinked(p: Project, clipId: string, speed: number): Project {
  const ids = new Set(linkedIds(p, [clipId]));
  const members = p.clips.filter(c => ids.has(c.id));
  if (members.some(c => locked(p, c))) return p;
  for (const c of members) p = changeClipSpeed(p, c.id, speed);
  return p;
}
export function slipLinked(p: Project, clipId: string, sourceIn: number): Project {
  const primary = p.clips.find(c => c.id === clipId);
  if (!primary || !Number.isFinite(sourceIn)) return p;
  const ids = new Set(linkedIds(p, [clipId]));
  const members = p.clips.filter(c => ids.has(c.id));
  if (members.some(c => locked(p, c))) return p;
  const delta = sourceIn - primary.sourceIn;
  if (members.some(c => { const a = p.assets.find(a => a.id === c.assetId); return c.sourceIn + delta < 0 ||
    (a && a.kind !== 'image' && c.sourceIn + delta + c.duration * c.speed > a.duration + 1e-8); })) return p;
  return { ...p, clips: p.clips.map(c => members.includes(c) ? { ...c, sourceIn: c.sourceIn + delta } : c) };
}

export function rippleTrim(
  p: Project,
  clipId: string,
  edge: 'start' | 'end',
  time: number,
): Project {
  const clip = p.clips.find(c => c.id === clipId);
  if (!clip || locked(p, clip)) return p;
  const t = snapToFrame(time, p.fps);
  if (t <= clip.start + 1 / p.fps - 1e-8 || t >= end(clip) - 1 / p.fps + 1e-8) {
    return p;
  }
  
  const targetIds = new Set(linkedIds(p, [clipId]));
  const targetClips = p.clips.filter(c => targetIds.has(c.id));
  if (targetClips.some(c => locked(p, c))) return p;
  
  const delta = edge === 'start' ? t - clip.start : end(clip) - t;
  if (delta <= 0) return p;

  const affectedTrackIds = new Set(targetClips.map(c => c.trackId));

  const newClips = p.clips.map(c => {
    if (targetIds.has(c.id)) {
      if (edge === 'start') {
        const trimmed = t - c.start;
        return {
          ...c,
          sourceIn: c.sourceIn + trimmed * c.speed,
          duration: c.duration - trimmed,
        };
      } else {
        return {
          ...c,
          duration: t - c.start,
        };
      }
    }
    if (
      affectedTrackIds.has(c.trackId) &&
      c.start >= (edge === 'start' ? clip.start + clip.duration - 1e-8 : end(clip) - 1e-8)
    ) {
      return {
        ...c,
        start: Math.max(0, c.start - delta),
      };
    }
    return c;
  });

  return { ...p, clips: newClips };
}

export function closeGap(p: Project, trackId: string, atTime: number): Project {
  const track = p.tracks.find(t => t.id === trackId);
  if (!track || track.locked) return p;
  const trackClips = p.clips.filter(c => c.trackId === trackId).sort((a, b) => a.start - b.start);
  if (!trackClips.length) return p;

  let gapStart = -1;
  let gapDuration = 0;

  if (trackClips[0].start > 1e-4 && atTime <= trackClips[0].start) {
    gapStart = 0;
    gapDuration = trackClips[0].start;
  } else {
    for (let i = 0; i < trackClips.length - 1; i++) {
      const c1 = trackClips[i];
      const c2 = trackClips[i + 1];
      const c1End = c1.start + c1.duration;
      if (c2.start > c1End + 1e-4) {
        if (atTime >= c1End - 1e-4 && atTime <= c2.start + 1e-4) {
          gapStart = c1End;
          gapDuration = c2.start - c1End;
          break;
        }
      }
    }
  }

  if (gapDuration <= 0) return p;

  const laterClips = trackClips.filter(c => c.start >= gapStart + gapDuration - 1e-4);
  const laterIds = new Set(laterClips.map(c => c.id));
  const allAffectedIds = new Set(linkedIds(p, Array.from(laterIds)));

  return {
    ...p,
    clips: p.clips.map(c => {
      if (allAffectedIds.has(c.id)) {
        return {
          ...c,
          start: Math.max(0, c.start - gapDuration),
        };
      }
      return c;
    }),
  };
}

/**
 * Ripple snap all clips on a track to eliminate gaps and align the first clip to 00:00.
 * Preserves linked audio synchronicity.
 */
export function rippleSnapTrack(p: Project, trackId: string): Project {
  const track = p.tracks.find(t => t.id === trackId);
  if (!track || track.locked) return p;

  const trackClips = p.clips
    .filter(c => c.trackId === trackId)
    .sort((a, b) => a.start - b.start);
  if (!trackClips.length) return p;

  let cursor = 0;
  const newStarts = new Map<string, number>();

  for (const clip of trackClips) {
    if (Math.abs(clip.start - cursor) > 1e-4) {
      newStarts.set(clip.id, cursor);
    }
    cursor = snapToFrame(cursor + clip.duration, p.fps);
  }

  if (newStarts.size === 0) return p;

  const linkedDeltas = new Map<string, number>();
  for (const [clipId, newStart] of newStarts.entries()) {
    const original = p.clips.find(c => c.id === clipId);
    if (original && original.linkId) {
      const delta = newStart - original.start;
      linkedDeltas.set(original.linkId, delta);
    }
  }

  return {
    ...p,
    clips: p.clips.map(c => {
      if (newStarts.has(c.id)) {
        return { ...c, start: newStarts.get(c.id)! };
      }
      if (c.linkId && linkedDeltas.has(c.linkId)) {
        return { ...c, start: Math.max(0, snapToFrame(c.start + linkedDeltas.get(c.linkId)!, p.fps)) };
      }
      return c;
    }),
  };
}

/**
 * Snap all unlocked tracks in the project to eliminate gaps (magnetic timeline snap).
 */
export function rippleSnapAllTracks(p: Project): Project {
  let project = p;
  const videoTracks = p.tracks.filter(t => t.kind === "video" && !t.locked);
  const otherTracks = p.tracks.filter(t => t.kind !== "video" && !t.locked);

  for (const track of videoTracks) {
    project = rippleSnapTrack(project, track.id);
  }
  for (const track of otherTracks) {
    project = rippleSnapTrack(project, track.id);
  }
  return project;
}

export function setClipSpeed(
  p: Project,
  clipId: string,
  speed: number,
  ripple = false,
): Project {
  const clip = p.clips.find(c => c.id === clipId);
  if (!clip || locked(p, clip) || !Number.isFinite(speed) || speed < 0.1 || speed > 8) {
    return p;
  }
  const oldDuration = clip.duration;
  const nextProject = speedLinked(p, clipId, speed);
  const updatedClip = nextProject.clips.find(c => c.id === clipId);
  if (!updatedClip || !ripple) return nextProject;

  const delta = updatedClip.duration - oldDuration;
  if (Math.abs(delta) < 1e-5) return nextProject;

  const targetIds = new Set(linkedIds(p, [clipId]));
  const targetClips = p.clips.filter(c => targetIds.has(c.id));
  const affectedTrackIds = new Set(targetClips.map(c => c.trackId));

  return {
    ...nextProject,
    clips: nextProject.clips.map(c => {
      if (
        !targetIds.has(c.id) &&
        affectedTrackIds.has(c.trackId) &&
        c.start >= clip.start + oldDuration - 1e-4
      ) {
        return {
          ...c,
          start: Math.max(0, c.start + delta),
        };
      }
      return c;
    }),
  };
}

export function createCompoundClip(project: Project, clipIds: string[]): Project {
  if (!clipIds || clipIds.length === 0) return project;
  const targetIds = new Set(clipIds);
  const selectedClips = project.clips.filter((c) => targetIds.has(c.id));
  if (selectedClips.length === 0) return project;

  const minStart = Math.min(...selectedClips.map((c) => c.start));
  const maxEnd = Math.max(...selectedClips.map((c) => c.start + c.duration));
  const duration = Math.max(0.1, maxEnd - minStart);

  const sortedClips = [...selectedClips].sort((a, b) => a.start - b.start);
  const targetTrackId = sortedClips[0].trackId;

  const nestedClips: Clip[] = selectedClips.map((c) => ({
    ...clone(c),
    start: c.start - minStart,
  }));

  const compoundClip: Clip = {
    id: id(),
    trackId: targetTrackId,
    name:
      selectedClips.length === 1
        ? `${selectedClips[0].name} (Compound)`
        : "Compound Clip",
    start: minStart,
    duration,
    sourceIn: 0,
    speed: 1,
    volume: 1,
    muted: false,
    transform: { ...DEFAULT_TRANSFORM },
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    keyframes: [],
    fadeIn: 0,
    fadeOut: 0,
    audioFadeIn: 0,
    audioFadeOut: 0,
    isCompound: true,
    nestedClips,
  };

  const survivingClips = project.clips.filter((c) => !targetIds.has(c.id));
  survivingClips.push(compoundClip);

  return {
    ...project,
    clips: survivingClips,
    updatedAt: new Date().toISOString(),
  };
}

export function ungroupCompoundClip(
  project: Project,
  compoundClipId: string,
): Project {
  const compoundClip = project.clips.find((c) => c.id === compoundClipId);
  if (!compoundClip || !compoundClip.isCompound || !compoundClip.nestedClips) {
    return project;
  }

  const baseStart = compoundClip.start;
  const restoredClips: Clip[] = compoundClip.nestedClips.map((nested) => ({
    ...clone(nested),
    start: baseStart + nested.start,
  }));

  const remainingClips = project.clips.filter((c) => c.id !== compoundClipId);

  return {
    ...project,
    clips: [...remainingClips, ...restoredClips],
    updatedAt: new Date().toISOString(),
  };
}

export function reorderClip(
  p: Project,
  clipId: string,
  targetTrackId: string,
  targetTime: number,
  mode: 'insert' | 'swap' | 'overwrite' = 'insert',
): Project {
  const primary = p.clips.find(c => c.id === clipId);
  if (!primary || locked(p, primary)) return p;

  const targetTrack = p.tracks.find(t => t.id === targetTrackId && !t.locked);
  if (!targetTrack) return p;

  const accepts = (t: Track, c: Clip) => {
    if (c.text) return t.kind === 'text';
    const asset = p.assets.find(a => a.id === c.assetId);
    const kind = asset?.kind ?? p.tracks.find(tr => tr.id === c.trackId)?.kind;
    return kind === 'audio'
      ? t.kind === 'audio'
      : kind === 'video'
        ? t.kind === 'video'
        : kind === 'image' && ['video', 'image'].includes(t.kind);
  };
  if (!accepts(targetTrack, primary)) return p;

  const primaryVideoTrack = p.tracks.find(t => t.name === "Video 1") ?? p.tracks.find(t => t.kind === 'video');
  const isMainTrack = targetTrack.id === primaryVideoTrack?.id;

  const targetIds = new Set(linkedIds(p, [clipId]));
  const otherClips = p.clips
    .filter(c => c.trackId === targetTrackId && !targetIds.has(c.id))
    .sort((a, b) => a.start - b.start);

  if (isMainTrack || mode === 'insert') {
    const t = Math.max(0, snapToFrame(targetTime, p.fps));
    let insertIndex = otherClips.length;
    for (let i = 0; i < otherClips.length; i++) {
      const oc = otherClips[i];
      const mid = oc.start + oc.duration / 2;
      if (t < mid) {
        insertIndex = i;
        break;
      }
    }

    const reorderedTrackClips = [
      ...otherClips.slice(0, insertIndex),
      primary,
      ...otherClips.slice(insertIndex),
    ];

    let cursor = 0;
    const newStarts = new Map<string, number>();
    for (const c of reorderedTrackClips) {
      newStarts.set(c.id, cursor);
      cursor = snapToFrame(cursor + c.duration, p.fps);
    }

    const primaryNewStart = newStarts.get(primary.id)!;
    const primaryDelta = primaryNewStart - primary.start;

    const linkedDeltas = new Map<string, number>();
    if (primary.linkId) {
      linkedDeltas.set(primary.linkId, primaryDelta);
    }

    let nextClips = p.clips.map(c => {
      if (c.id === primary.id) {
        return { ...c, trackId: targetTrackId, start: primaryNewStart };
      }
      if (newStarts.has(c.id)) {
        return { ...c, start: newStarts.get(c.id)! };
      }
      if (c.linkId && linkedDeltas.has(c.linkId)) {
        return {
          ...c,
          start: Math.max(0, snapToFrame(c.start + linkedDeltas.get(c.linkId)!, p.fps)),
        };
      }
      return c;
    });

    if (primary.trackId !== targetTrackId) {
      const oldTrack = p.tracks.find(t => t.id === primary.trackId);
      if (oldTrack && oldTrack.id === primaryVideoTrack?.id) {
        const tempP = { ...p, clips: nextClips };
        nextClips = rippleSnapTrack(tempP, oldTrack.id).clips;
      }
    }

    return { ...p, clips: nextClips.sort((a, b) => a.start - b.start) };
  }

  const delta = snapToFrame(targetTime - primary.start, p.fps);
  return moveLinked(p, [clipId], delta, targetTrackId);
}

export function swapClips(
  p: Project,
  clipId: string,
  direction: 'prev' | 'next',
): Project {
  const clip = p.clips.find(c => c.id === clipId);
  if (!clip || locked(p, clip)) return p;

  const trackClips = p.clips
    .filter(c => c.trackId === clip.trackId)
    .sort((a, b) => a.start - b.start);

  const idx = trackClips.findIndex(c => c.id === clipId);
  if (idx < 0) return p;

  const targetIdx = direction === 'prev' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= trackClips.length) return p;

  const targetClip = trackClips[targetIdx];
  if (locked(p, targetClip)) return p;

  const swappedList = [...trackClips];
  swappedList[idx] = targetClip;
  swappedList[targetIdx] = clip;

  const primaryVideoTrack = p.tracks.find(t => t.name === "Video 1") ?? p.tracks.find(t => t.kind === 'video');
  const isMainTrack = clip.trackId === primaryVideoTrack?.id;

  let cursor = isMainTrack ? 0 : trackClips[0].start;
  const newStarts = new Map<string, number>();
  for (const c of swappedList) {
    newStarts.set(c.id, cursor);
    cursor = snapToFrame(cursor + c.duration, p.fps);
  }

  const linkedDeltas = new Map<string, number>();
  for (const [cId, nStart] of newStarts.entries()) {
    const orig = p.clips.find(c => c.id === cId);
    if (orig && orig.linkId) {
      linkedDeltas.set(orig.linkId, nStart - orig.start);
    }
  }

  return {
    ...p,
    clips: p.clips
      .map(c => {
        if (newStarts.has(c.id)) {
          return { ...c, start: newStarts.get(c.id)! };
        }
        if (c.linkId && linkedDeltas.has(c.linkId)) {
          return {
            ...c,
            start: Math.max(0, snapToFrame(c.start + linkedDeltas.get(c.linkId)!, p.fps)),
          };
        }
        return c;
      })
      .sort((a, b) => a.start - b.start),
  };
}



