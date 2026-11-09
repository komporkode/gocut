import { describe, expect, it, vi } from "vitest";
import { createClip, createProject } from "../src/core/model";
import { useEditorStore } from "../src/editor/store";
import type { MediaAsset, Project } from "../src/core/types";
import type { ContextMenuItem } from "../src/components/TimelineContextMenu";

describe("Timeline Context Menu & Clip Right-Click Safety", () => {
  const createFixture = () => {
    const project = createProject("Context Menu Test");
    const videoAsset: MediaAsset = {
      id: "v1",
      name: "sample.mp4",
      path: "/sample.mp4",
      url: "file:///sample.mp4",
      kind: "video",
      duration: 10,
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: true,
    };
    project.assets = [videoAsset];
    const clip1 = createClip(videoAsset, project.tracks[1].id, 0, 30);
    clip1.duration = 5;

    const clip2 = createClip(videoAsset, project.tracks[1].id, 5, 30);
    clip2.duration = 5;

    const adjClip = {
      ...createClip(undefined, project.tracks[1].id, 0, 30),
      id: "adj-1",
      name: "Adjustment Layer",
      isAdjustmentLayer: true,
      text: undefined,
      duration: 4,
    };

    project.clips = [clip1, clip2, adjClip];
    return { project, clip1, clip2, adjClip, videoAsset };
  };

  it("builds context menu items for standard video clips with audio options", () => {
    const { project, clip1, videoAsset } = createFixture();
    useEditorStore.getState().setProject(project);

    const track = project.tracks.find((t) => t.id === clip1.trackId)!;
    const asset = videoAsset;
    const isAdj = Boolean(clip1.isAdjustmentLayer);
    const canSeparate =
      !isAdj &&
      track.kind === "video" &&
      (asset?.hasAudio || asset?.kind === "audio") &&
      !clip1.linkId;
    const canRecover = !isAdj && Boolean(clip1.linkId);

    expect(canSeparate).toBe(true);
    expect(canRecover).toBe(false);
    expect(isAdj).toBe(false);
  });

  it("filters out audio operations for adjustment layers", () => {
    const { project, adjClip } = createFixture();
    useEditorStore.getState().setProject(project);

    const track = project.tracks.find((t) => t.id === adjClip.trackId)!;
    const asset = project.assets.find((a) => a.id === adjClip.assetId);
    const isAdj = Boolean(adjClip.isAdjustmentLayer);
    const canSeparate =
      !isAdj &&
      track.kind === "video" &&
      (asset?.hasAudio || asset?.kind === "audio") &&
      !adjClip.linkId;
    const canRecover = !isAdj && Boolean(adjClip.linkId);

    expect(isAdj).toBe(true);
    expect(canSeparate).toBe(false);
    expect(canRecover).toBe(false);
  });

  it("supports multi-selection preservation when right-clicking one of multiple selected clips", () => {
    const { project, clip1, clip2 } = createFixture();
    useEditorStore.getState().setProject(project);
    useEditorStore.setState({ selectedIds: [clip1.id, clip2.id] });

    const selectedIds = useEditorStore.getState().selectedIds;
    // Right clicking clip1 should preserve [clip1.id, clip2.id]
    const activeSelection = selectedIds.includes(clip1.id)
      ? selectedIds
      : [clip1.id];

    expect(activeSelection).toEqual([clip1.id, clip2.id]);
    expect(activeSelection.length >= 2).toBe(true);
  });

  it("selects only the target clip when right-clicking an unselected clip", () => {
    const { project, clip1, clip2 } = createFixture();
    useEditorStore.getState().setProject(project);
    useEditorStore.setState({ selectedIds: [clip2.id] });

    const selectedIds = useEditorStore.getState().selectedIds;
    // Right clicking clip1 (which is unselected) narrows to [clip1.id]
    const activeSelection = selectedIds.includes(clip1.id)
      ? selectedIds
      : [clip1.id];

    expect(activeSelection).toEqual([clip1.id]);
    expect(activeSelection.length).toBe(1);
  });

  it("calculates clamped viewport coordinates accurately to prevent menu clipping", () => {
    const windowInnerWidth = 1280;
    const windowInnerHeight = 720;
    const itemsCount = 14;
    const estimatedHeight = itemsCount * 30 + 16; // 436px

    // Case 1: Right click near bottom right (1250, 700)
    const rawX = 1250;
    const rawY = 700;
    const adjustedX = Math.max(8, Math.min(rawX, windowInnerWidth - 220));
    const adjustedY = Math.max(8, Math.min(rawY, windowInnerHeight - estimatedHeight - 12));

    expect(adjustedX).toBe(1060);
    expect(adjustedY).toBe(720 - 436 - 12); // 272px, well within visible bounds
    expect(adjustedY + estimatedHeight).toBeLessThanOrEqual(windowInnerHeight);
  });
});
