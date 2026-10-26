import { beforeEach, describe, expect, it } from "vitest";
import { createClip, createProject, splitClip } from "../src/core/model";
import { useEditorStore } from "../src/editor/store";
import type { Project, MediaAsset } from "../src/core/types";
function fixture(): Project {
  const p = createProject();
  const a: MediaAsset = {
    id: "asset",
    name: "视频",
    path: "/tmp/video.mp4",
    url: "file:///tmp/video.mp4",
    kind: "video",
    duration: 20,
    width: 1920,
    height: 1080,
    fps: 30,
    hasAudio: true,
  };
  p.assets = [a];
  p.clips = [createClip(a, p.tracks[1].id, 0, p.fps)];
  p.clips[0].duration = 3;
  return p;
}
beforeEach(() => {
  useEditorStore.getState().setProject(fixture());
  useEditorStore.setState({ magnetic: false, snapping: true, zoom: 60 });
});
const state = () => useEditorStore.getState();
describe("editor transactions", () => {
  it("groups continuous inspector edits into one undo and ignores empty transactions", () => {
    const c = state().project.clips[0];
    state().beginTransaction();
    state().endTransaction();
    expect(state().past).toHaveLength(0);
    state().beginTransaction();
    state().updateClip(c.id, { volume: 0.5 });
    state().updateClip(c.id, { volume: 0.2 });
    state().endTransaction();
    expect(state().past).toHaveLength(1);
    expect(state().project.clips[0].volume).toBe(0.2);
    state().undo();
    expect(state().project.clips[0].volume).toBe(1);
    state().redo();
    expect(state().project.clips[0].volume).toBe(0.2);
  });
  it("explicit fade editing resets only the selected channel cut envelope", () => {
    const p = state().project,
      c = p.clips[0];
    c.fadeIn = 2;
    c.audioFadeOut = 2;
    const cut = splitClip(p, c.id, 1);
    state().setProject(cut);
    const right = state().project.clips[1];
    expect(right.videoFadeWindow).toBeDefined();
    expect(right.audioFadeWindow).toBeDefined();
    state().updateClip(right.id, { fadeIn: 0.25 });
    expect(state().project.clips[1].videoFadeWindow).toBeUndefined();
    expect(state().project.clips[1].audioFadeWindow).toBeDefined();
    state().select([right.id]);
    state().updateSelected({ audioFadeOut: 0 });
    expect(state().project.clips[1].audioFadeWindow).toBeUndefined();
    state().undo();
    expect(state().project.clips[1].audioFadeWindow).toBeDefined();
  });
  it("undo and redo use detached snapshots unaffected by input/patch mutation", () => {
    const original = state().project;
    const patch = { transform: { ...original.clips[0].transform, x: 30 } };
    state().updateClip(original.clips[0].id, patch);
    patch.transform.x = 900;
    original.clips[0].transform.x = 800;
    expect(state().project.clips[0].transform.x).toBe(30);
    state().undo();
    expect(state().project.clips[0].transform.x).toBe(0);
    state().redo();
    expect(state().project.clips[0].transform.x).toBe(30);
    state().undo();
    state().updateProject({ name: "分支" });
    expect(state().future).toHaveLength(0);
  });
  it("ignores edits on locked tracks and does not add undo entries for noops", () => {
    const c = state().project.clips[0],
      track = c.trackId;
    state().updateTrack(track, { locked: true });
    const count = state().past.length;
    state().select([c.id]);
    state().updateClip(c.id, { speed: 2 });
    state().updateSelected({ volume: 0.2 });
    state().moveClips([c.id], 2);
    state().trim(c.id, "end", 1);
    state().split();
    state().deleteSelected();
    state().duplicate();
    state().copy();
    state().paste();
    expect(state().past).toHaveLength(count);
    expect(state().project.clips).toHaveLength(1);
    expect(state().project.clips[0].speed).toBe(1);
  });
  it("explicit locked/import-incompatible track does not silently choose another", () => {
    const p = state().project;
    state().updateTrack(p.tracks[1].id, { locked: true });
    const before = state().past.length;
    state().addAssetClip("asset", 0, p.tracks[1].id);
    state().addAssetClip("asset", 0, p.tracks[2].id);
    expect(state().past).toHaveLength(before);
    expect(state().project.clips).toHaveLength(1);
  });
  it("cannot move video into audio and preserves group relative offsets at origin", () => {
    const p = state().project,
      first = p.clips[0],
      second = { ...structuredClone(first), id: "second", start: 5 };
    state().commit({ ...p, clips: [{ ...first, start: 2 }, second] });
    state().moveClips([first.id, "second"], -10, p.tracks[2].id);
    expect(state().project.clips.map((c) => c.start)).toEqual([0, 3]);
    expect(state().project.clips.map((c) => c.trackId)).toEqual([
      first.trackId,
      first.trackId,
    ]);
  });
  it("copy/paste is independent and cleared on switching projects", () => {
    const c = state().project.clips[0];
    state().select([c.id]);
    state().copy();
    state().updateClip(c.id, { name: "修改" });
    state().seek(5);
    state().paste();
    expect(state().project.clips[1].name).toBe("视频");
    expect(state().project.clips[1].start).toBe(5);
    state().setProject(createProject());
    expect(state().clipboard).toHaveLength(0);
  });
  it("deduplicates an import batch by path and records it as one transaction", () => {
    const a = state().project.assets[0];
    state().addAssets([
      { ...a, id: "fresh", path: "/tmp/fresh.mp4" },
      { ...a, id: "another", path: "/tmp/fresh.mp4" },
      a,
    ]);
    expect(state().project.assets).toHaveLength(2);
    expect(state().past).toHaveLength(1);
  });
  it("magnetic delete compresses a union rather than double-counting overlapping deletions", () => {
    const p = state().project,
      c = p.clips[0];
    state().commit({
      ...p,
      clips: [
        { ...c, duration: 4 },
        { ...structuredClone(c), id: "overlap", start: 2, duration: 4 },
        { ...structuredClone(c), id: "tail", start: 8, duration: 3 },
      ],
    });
    state().setMagnetic(true);
    state().select([c.id, "overlap"]);
    state().deleteSelected();
    expect(state().project.clips[0].start).toBe(2);
    state().undo();
    expect(state().project.clips).toHaveLength(3);
  });
  it("adds subframe subtitles with positive duration and ignores invalid cues", () => {
    state().addSubtitles([
      { start: 1, end: 1.001, text: "短字幕" },
      { start: NaN, end: 4, text: "坏字幕" },
    ]);
    expect(state().project.clips).toHaveLength(2);
    expect(state().project.clips[1].duration).toBeCloseTo(1 / 30);
  });
});

describe("track management", () => {
  it("deletes clips with their track in one transaction, keeps media, cleans selection and undoes", () => {
    const p = state().project,
      c = p.clips[0];
    state().addText();
    const text = state().project.clips.find((c) => c.text)!;
    state().select([c.id, text.id]);
    const before = state().past.length;
    state().deleteTrack(c.trackId);
    expect(state().past).toHaveLength(before + 1);
    expect(state().project.tracks.some((t) => t.id === c.trackId)).toBe(false);
    expect(state().project.clips.map((c) => c.id)).toEqual([text.id]);
    expect(state().project.assets).toEqual(p.assets);
    expect(state().selectedIds).toEqual([text.id]);
    state().undo();
    expect(state().project.clips.some((item) => item.id === c.id)).toBe(true);
    expect(state().project.tracks.some((t) => t.id === c.trackId)).toBe(true);
  });
  it("allows deleting the last track and later recreating a compatible track on add", () => {
    const p = state().project;
    state().commit({ ...p, tracks: [p.tracks[1]] });
    state().deleteTrack(p.tracks[1].id);
    expect(state().project.tracks).toHaveLength(0);
    expect(state().project.clips).toHaveLength(0);
    state().addAssetClip("asset");
    expect(state().project.tracks).toHaveLength(1);
    expect(state().project.clips).toHaveLength(1);
  });
  it("reorders one adjacent track with undo and refuses locked sources, locked neighbors and bounds", () => {
    const initial = state().project.tracks.map((t) => t.id);
    state().reorderTrack(initial[1], "up");
    expect(state().project.tracks.map((t) => t.id)).toEqual([
      initial[1],
      initial[0],
      initial[2],
    ]);
    expect(state().past).toHaveLength(1);
    state().undo();
    expect(state().project.tracks.map((t) => t.id)).toEqual(initial);
    state().updateTrack(initial[0], { locked: true });
    const before = state().past.length;
    state().reorderTrack(initial[0], "down");
    state().reorderTrack(initial[1], "up");
    state().reorderTrack(initial[2], "down");
    state().deleteTrack(initial[0]);
    expect(state().past).toHaveLength(before);
    expect(state().project.tracks.map((t) => t.id)).toEqual(initial);
  });
  it("trims renamed tracks, rejects empty/locked renames, and still permits unlocking and flags", () => {
    const track = state().project.tracks[1];
    state().updateTrack(track.id, { name: "  镜头  " });
    expect(state().project.tracks[1].name).toBe("镜头");
    let before = state().past.length;
    state().updateTrack(track.id, { name: "   " });
    expect(state().past).toHaveLength(before);
    state().updateTrack(track.id, { locked: true });
    before = state().past.length;
    state().updateTrack(track.id, { name: "locked rename" });
    expect(state().past).toHaveLength(before);
    expect(state().project.tracks[1].name).toBe("镜头");
    state().updateTrack(track.id, { muted: true, locked: false });
    expect(state().project.tracks[1]).toMatchObject({
      muted: true,
      locked: false,
    });
  });
  it("reorders clips in store with undo and redo history", () => {
    const p = state().project;
    const c1 = p.clips[0];
    const c2 = { ...structuredClone(c1), id: "c2", start: 3, duration: 4 };
    state().commit({ ...p, clips: [c1, c2] });

    state().reorderClip(c1.id, p.tracks[1].id, 5, "insert");
    expect(state().project.clips.map((c) => c.id)).toEqual(["c2", c1.id]);
    expect(state().past.length).toBeGreaterThan(0);

    state().undo();
    expect(state().project.clips.map((c) => c.id)).toEqual([c1.id, "c2"]);

    state().redo();
    expect(state().project.clips.map((c) => c.id)).toEqual(["c2", c1.id]);
  });
  it("swaps clip with adjacent clip in store with swapClipWithAdjacent", () => {
    const p = state().project;
    const c1 = p.clips[0];
    const c2 = { ...structuredClone(c1), id: "c2", start: 3, duration: 4 };
    state().commit({ ...p, clips: [c1, c2] });

    state().swapClipWithAdjacent(c1.id, "next");
    expect(state().project.clips.map((c) => c.id)).toEqual(["c2", c1.id]);

    state().swapClipWithAdjacent(c1.id, "prev");
    expect(state().project.clips.map((c) => c.id)).toEqual([c1.id, "c2"]);
  });

  it("addTrack('video') inserts overlay track above Video 1", () => {
    state().addTrack("video");
    const tracks = state().project.tracks;
    const v1Index = tracks.findIndex((t) => t.name === "Video 1");
    const newVideoIndex = tracks.findIndex((t) => t.name === "Video 2");
    expect(newVideoIndex).toBeLessThan(v1Index);
  });

  it("magnetic mode preserves overlay track clip timing without forcing 0s snap", () => {
    state().addTrack("video");
    const newTrack = state().project.tracks.find((t) => t.name === "Video 2")!;
    const p = state().project;
    const c1 = p.clips[0];
    const overlayClip = { ...structuredClone(c1), id: "overlay-1", trackId: newTrack.id, start: 8, duration: 2 };
    state().commit({ ...p, clips: [c1, overlayClip] });

    state().setMagnetic(true);
    state().moveClips(["overlay-1"], 2, newTrack.id);

    const updatedOverlay = state().project.clips.find((c) => c.id === "overlay-1");
    expect(updatedOverlay?.start).toBe(10);
  });

  it("auto-prunes empty overlay video tracks when clip moves to another track", () => {
    state().addTrack("video");
    const v2Track = state().project.tracks.find((t) => t.name === "Video 2")!;
    const v1Track = state().project.tracks.find((t) => t.name === "Video 1")!;
    const p = state().project;
    const c1 = p.clips[0];
    const overlayClip = { ...structuredClone(c1), id: "overlay-1", trackId: v2Track.id, start: 5, duration: 2 };
    state().commit({ ...p, clips: [c1, overlayClip] });

    expect(state().project.tracks.some((t) => t.id === v2Track.id)).toBe(true);

    // Move overlay clip down to Video 1
    state().moveClips(["overlay-1"], 0, v1Track.id);

    // Video 2 should now be pruned automatically
    expect(state().project.tracks.some((t) => t.id === v2Track.id)).toBe(false);
    expect(state().project.tracks.some((t) => t.name === "Video 1")).toBe(true);

    // 1x Undo restores both clip and the overlay track
    state().undo();
    expect(state().project.tracks.some((t) => t.id === v2Track.id)).toBe(true);
    expect(state().project.clips.find((c) => c.id === "overlay-1")?.trackId).toBe(v2Track.id);
  });

  it("auto-prunes empty overlay video tracks when clip on overlay is deleted", () => {
    state().addTrack("video");
    const v2Track = state().project.tracks.find((t) => t.name === "Video 2")!;
    const p = state().project;
    const c1 = p.clips[0];
    const overlayClip = { ...structuredClone(c1), id: "overlay-delete", trackId: v2Track.id, start: 5, duration: 2 };
    state().commit({ ...p, clips: [c1, overlayClip] });

    state().select(["overlay-delete"]);
    state().deleteSelected();

    // Video 2 should be pruned automatically after deleting its only clip
    expect(state().project.tracks.some((t) => t.id === v2Track.id)).toBe(false);
    expect(state().project.tracks.some((t) => t.name === "Video 1")).toBe(true);
  });

  it("applies transition with ripple and removes transition cleanly", () => {
    const p = state().project;
    const c1 = p.clips[0];
    const c2 = { ...structuredClone(c1), id: "c2", start: 3, duration: 3 };
    const c3 = { ...structuredClone(c1), id: "c3", start: 6, duration: 3 };
    state().commit({ ...p, clips: [c1, c2, c3] });

    // Apply transition between c1 and c2 (duration 0.5)
    state().applyTransition(c1.id, "dissolve", 0.5);

    const afterTrans = state().project.clips;
    const updatedC2 = afterTrans.find((c) => c.id === "c2")!;
    const updatedC3 = afterTrans.find((c) => c.id === "c3")!;

    expect(updatedC2.start).toBe(2.5);
    expect(updatedC2.fadeIn).toBe(0.5);
    // c3 was rippled along with c2
    expect(updatedC3.start).toBe(5.5);

    // Now remove transition on c2
    state().removeTransition("c2");

    const afterRemove = state().project.clips;
    const restoredC2 = afterRemove.find((c) => c.id === "c2")!;
    const restoredC3 = afterRemove.find((c) => c.id === "c3")!;

    expect(restoredC2.start).toBe(3);
    expect(restoredC2.fadeIn).toBe(0);
    expect(restoredC3.start).toBe(6);
  });
});
