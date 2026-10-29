import type { Project, Transition, TransitionType, Clip } from './types';
import { clone, id, snapToFrame } from './model';

/** Add a transition between two adjacent clips on the same track with overlap ripple. */
export function addTransition(
  project: Project,
  trackId: string,
  fromClipId: string,
  toClipId: string,
  type: TransitionType,
  duration: number
): { project: Project; transition: Transition } {
  const p = clone(project);
  p.transitions = p.transitions ? [...p.transitions] : [];

  const fromClip = p.clips.find((c) => c.id === fromClipId && c.trackId === trackId);
  const toClip = p.clips.find((c) => c.id === toClipId && c.trackId === trackId);
  if (!fromClip || !toClip) throw new Error('Adjacent clips not found on track');

  // Clamp duration to minimum of adjacent clips and frame bounds
  const maxDur = Math.min(fromClip.duration, toClip.duration);
  const clampedDur = snapToFrame(Math.max(1 / p.fps, Math.min(duration, maxDur)), p.fps);

  // Check if transition already exists between these clips
  const existingIdx = p.transitions.findIndex(
    (t) => t.trackId === trackId && t.fromClipId === fromClipId && t.toClipId === toClipId
  );

  let transition: Transition;
  if (existingIdx >= 0) {
    const existing = p.transitions[existingIdx];
    const updated = resizeTransition(p, existing.id, clampedDur);
    const found = updated.transitions?.find((t) => t.id === existing.id)!;
    found.type = type;
    return { project: updated, transition: found };
  }

  // Create transition object
  transition = {
    id: id(),
    trackId,
    fromClipId,
    toClipId,
    type,
    duration: clampedDur,
  };

  // Overlap incoming clip and ripple all downstream clips on the same track
  const delta = clampedDur;
  toClip.start = snapToFrame(fromClip.start + fromClip.duration - delta, p.fps);

  // Set audio fade crossfade helpers
  fromClip.audioFadeOut = clampedDur;
  toClip.audioFadeIn = clampedDur;

  // Ripple subsequent clips on track
  for (const c of p.clips) {
    if (c.trackId === trackId && c.id !== toClip.id && c.id !== fromClip.id && c.start >= toClip.start) {
      c.start = snapToFrame(c.start - delta, p.fps);
    }
  }

  p.transitions.push(transition);
  return { project: p, transition };
}

/** Resize transition duration and adjust downstream clips dynamically. */
export function resizeTransition(
  project: Project,
  transitionId: string,
  newDuration: number
): Project {
  const p = clone(project);
  if (!p.transitions) return p;

  const trans = p.transitions.find((t) => t.id === transitionId);
  if (!trans) return p;

  const fromClip = p.clips.find((c) => c.id === trans.fromClipId);
  const toClip = p.clips.find((c) => c.id === trans.toClipId);
  if (!fromClip || !toClip) return p;

  const maxDur = Math.min(fromClip.duration, toClip.duration);
  const clampedDur = snapToFrame(Math.max(1 / p.fps, Math.min(newDuration, maxDur)), p.fps);
  const delta = clampedDur - trans.duration; // positive means overlap increases (downstream moves left)

  trans.duration = clampedDur;
  toClip.start = snapToFrame(toClip.start - delta, p.fps);
  fromClip.audioFadeOut = clampedDur;
  toClip.audioFadeIn = clampedDur;

  for (const c of p.clips) {
    if (c.trackId === trans.trackId && c.id !== toClip.id && c.id !== fromClip.id && c.start >= toClip.start) {
      c.start = snapToFrame(c.start - delta, p.fps);
    }
  }

  return p;
}

/** Remove transition and restore flush cut by rippling downstream clips rightward. */
export function removeTransition(project: Project, transitionId: string): Project {
  const p = clone(project);
  if (!p.transitions) return p;

  const transIdx = p.transitions.findIndex((t) => t.id === transitionId);
  if (transIdx === -1) return p;

  const trans = p.transitions[transIdx];
  const fromClip = p.clips.find((c) => c.id === trans.fromClipId);
  const toClip = p.clips.find((c) => c.id === trans.toClipId);

  if (fromClip && toClip) {
    const shift = trans.duration;
    toClip.start = snapToFrame(fromClip.start + fromClip.duration, p.fps);
    fromClip.audioFadeOut = 0;
    toClip.audioFadeIn = 0;

    for (const c of p.clips) {
      if (c.trackId === trans.trackId && c.id !== toClip.id && c.id !== fromClip.id && c.start >= toClip.start - shift - 0.001) {
        c.start = snapToFrame(c.start + shift, p.fps);
      }
    }
  }

  p.transitions.splice(transIdx, 1);
  return p;
}

/** Apply a transition to all adjacent cuts on the specified track or all video tracks. */
export function applyTransitionToAll(
  project: Project,
  type: TransitionType,
  duration: number,
  trackId?: string
): Project {
  let p = clone(project);
  const tracks = trackId
    ? p.tracks.filter((t) => t.id === trackId)
    : p.tracks.filter((t) => t.kind === 'video');

  for (const track of tracks) {
    const trackClips = p.clips
      .filter((c) => c.trackId === track.id)
      .sort((a, b) => a.start - b.start);

    for (let i = 0; i < trackClips.length - 1; i++) {
      const from = trackClips[i];
      const to = trackClips[i + 1];
      // Adjacent if touching or already overlapping
      if (to.start <= from.start + from.duration + 0.05) {
        const res = addTransition(p, track.id, from.id, to.id, type, duration);
        p = res.project;
      }
    }
  }

  return p;
}
