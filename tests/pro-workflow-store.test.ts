import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../src/editor/store";
import { createProject, createClip } from "../src/core/model";
import { DEFAULT_CLIP_EFFECTS, DEFAULT_FILM_GRAIN } from "../src/core/defaults";

describe("Pro workflow store actions", () => {
  beforeEach(() => {
    useEditorStore.getState().setProject(createProject());
  });

  it("creates an adjustment layer clip on a video track", () => {
    const store = useEditorStore.getState();
    store.addAdjustmentLayer(1.5, 4);
    const { project } = useEditorStore.getState();
    const adj = project.clips.find((c) => c.isAdjustmentLayer);
    expect(adj).toBeDefined();
    expect(adj?.start).toBe(1.5);
    expect(adj?.duration).toBe(4);
  });

  it("copies and pastes clip attributes (adjustments, effects, blendMode, transform)", () => {
    const p = createProject();
    const vTrack = p.tracks.find((t) => t.kind === "video")!;
    const asset = {
      id: "a1",
      name: "v.mp4",
      path: "/v.mp4",
      url: "file:///v.mp4",
      kind: "video" as const,
      duration: 10,
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: true,
    };
    p.assets.push(asset);
    const c1 = createClip(asset, vTrack.id, 0, p.fps);
    c1.blendMode = "screen";
    c1.adjustments.contrast = 1.4;
    c1.effects = {
      ...DEFAULT_CLIP_EFFECTS,
      grain: { ...DEFAULT_FILM_GRAIN, enabled: true, intensity: 45 },
    };
    const c2 = createClip(asset, vTrack.id, 3, p.fps);
    p.clips.push(c1, c2);
    useEditorStore.getState().setProject(p);

    useEditorStore.getState().copyClipAttributes(c1.id);
    useEditorStore.getState().select([c2.id]);
    useEditorStore.getState().pasteClipAttributes();

    const updatedC2 = useEditorStore
      .getState()
      .project.clips.find((c) => c.id === c2.id)!;
    expect(updatedC2.blendMode).toBe("screen");
    expect(updatedC2.adjustments.contrast).toBe(1.4);
    expect(updatedC2.effects?.grain?.enabled).toBe(true);
    expect(updatedC2.effects?.grain?.intensity).toBe(45);

    // Regression (kecoak): copying a clean clip (no effects, normal blendMode) and pasting onto a modified clip must clear effects & blendMode
    const cClean = createClip(asset, vTrack.id, 6, p.fps);
    useEditorStore.getState().setProject({ ...useEditorStore.getState().project, clips: [c1, updatedC2, cClean] });
    useEditorStore.getState().copyClipAttributes(cClean.id);
    useEditorStore.getState().select([updatedC2.id]);
    useEditorStore.getState().pasteClipAttributes();

    const clearedC2 = useEditorStore
      .getState()
      .project.clips.find((c) => c.id === c2.id)!;
    expect(clearedC2.effects).toBeUndefined();
    expect(clearedC2.blendMode).toBeUndefined();
  });

  it("adds, updates, and removes timeline markers and toggles track solo", () => {
    const store = useEditorStore.getState();
    store.addMarker(2.5, "Beat Drop", "#f59e0b");
    let markers = useEditorStore.getState().project.markers ?? [];
    expect(markers).toHaveLength(1);
    expect(markers[0].label).toBe("Beat Drop");

    store.updateMarker(markers[0].id, { label: "Chorus" });
    markers = useEditorStore.getState().project.markers ?? [];
    expect(markers[0].label).toBe("Chorus");

    store.removeMarker(markers[0].id);
    expect(useEditorStore.getState().project.markers).toHaveLength(0);

    const trackId = useEditorStore.getState().project.tracks[0].id;
    store.toggleTrackSolo(trackId);
    expect(useEditorStore.getState().project.tracks[0].solo).toBe(true);
  });
});
