import React, { useState, useRef, useEffect } from "react";
import type { Clip, Project, Transform } from "../core/types";
import { textPreviewLayer } from "../editor/previewLayers";
import { useEditorStore } from "../editor/store";

interface CanvasTransformGizmoProps {
  clip: Clip;
  project: Project;
  displayW: number;
  displayH: number;
  onUpdateClip: (id: string, patch: Partial<Clip>) => void;
  renderFrame: (time: number, isPlaying: boolean) => void;
  playhead: number;
}

type DragMode =
  | { type: "move"; startClientX: number; startClientY: number; initialX: number; initialY: number }
  | { type: "rotate"; startAngle: number; initialRotation: number; centerStageX: number; centerStageY: number }
  | {
      type: "scale";
      handle: "tl" | "tr" | "bl" | "br" | "tc" | "bc" | "ml" | "mr";
      startDist: number;
      initialScale: number;
      centerStageX: number;
      centerStageY: number;
    };

export default function CanvasTransformGizmo({
  clip,
  project,
  displayW,
  displayH,
  onUpdateClip,
  renderFrame,
  playhead,
}: CanvasTransformGizmoProps) {
  const canvasRatio = displayW / project.width;
  const beginTransaction = useEditorStore((s) => s.beginTransaction);
  const endTransaction = useEditorStore((s) => s.endTransaction);

  const [dragInfo, setDragInfo] = useState<string | null>(null);
  const activeDrag = useRef<DragMode | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Compute base dimensions of the clip
  let baseW = project.width;
  let baseH = project.height;

  if (clip.text) {
    try {
      const layer = textPreviewLayer(clip);
      baseW = layer.width;
      baseH = layer.height;
    } catch {
      baseW = 300;
      baseH = 100;
    }
  } else if (clip.assetId) {
    const asset = project.assets.find((a) => a.id === clip.assetId);
    if (asset) {
      const assetW = asset.width || project.width;
      const assetH = asset.height || project.height;
      const contain = Math.min(project.width / assetW, project.height / assetH);
      baseW = assetW * contain;
      baseH = assetH * contain;
    }
  }

  const tr = clip.transform;
  const cx = (project.width / 2 + tr.x) * canvasRatio;
  const cy = (project.height / 2 + tr.y) * canvasRatio;
  const scaledW = Math.max(20, baseW * tr.scale * canvasRatio);
  const scaledH = Math.max(20, baseH * tr.scale * canvasRatio);
  const rot = tr.rotation || 0;

  const handlePointerDownMove = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    beginTransaction();

    activeDrag.current = {
      type: "move",
      startClientX: e.clientX,
      startClientY: e.clientY,
      initialX: tr.x,
      initialY: tr.y,
    };
    setDragInfo(`X: ${Math.round(tr.x)}, Y: ${Math.round(tr.y)}`);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerDownRotate = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    beginTransaction();

    const rect = boxRef.current?.getBoundingClientRect();
    const centerScreenX = rect ? rect.left + rect.width / 2 : e.clientX;
    const centerScreenY = rect ? rect.top + rect.height / 2 : e.clientY;

    const startRad = Math.atan2(e.clientY - centerScreenY, e.clientX - centerScreenX);
    const startAngle = (startRad * 180) / Math.PI + 90;

    activeDrag.current = {
      type: "rotate",
      startAngle,
      initialRotation: rot,
      centerStageX: centerScreenX,
      centerStageY: centerScreenY,
    };
    setDragInfo(`${Math.round(rot)}°`);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerDownScale = (
    handle: "tl" | "tr" | "bl" | "br" | "tc" | "bc" | "ml" | "mr",
    e: React.PointerEvent,
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    beginTransaction();

    const rect = boxRef.current?.getBoundingClientRect();
    const centerScreenX = rect ? rect.left + rect.width / 2 : e.clientX;
    const centerScreenY = rect ? rect.top + rect.height / 2 : e.clientY;

    const startDist = Math.max(10, Math.hypot(e.clientX - centerScreenX, e.clientY - centerScreenY));

    activeDrag.current = {
      type: "scale",
      handle,
      startDist,
      initialScale: tr.scale,
      centerStageX: centerScreenX,
      centerStageY: centerScreenY,
    };
    setDragInfo(`${Math.round(tr.scale * 100)}%`);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = activeDrag.current;
    if (!drag) return;

    if (drag.type === "move") {
      const dx = (e.clientX - drag.startClientX) / canvasRatio;
      const dy = (e.clientY - drag.startClientY) / canvasRatio;
      const nextX = Math.round(drag.initialX + dx);
      const nextY = Math.round(drag.initialY + dy);

      onUpdateClip(clip.id, {
        transform: {
          ...clip.transform,
          x: nextX,
          y: nextY,
        },
      });
      setDragInfo(`X: ${nextX > 0 ? "+" + nextX : nextX}, Y: ${nextY > 0 ? "+" + nextY : nextY}`);
      renderFrame(playhead, false);
    } else if (drag.type === "rotate") {
      const currRad = Math.atan2(e.clientY - drag.centerStageY, e.clientX - drag.centerStageX);
      const currAngle = (currRad * 180) / Math.PI + 90;
      let nextRot = drag.initialRotation + (currAngle - drag.startAngle);

      // Snap to 15 deg if Shift key is pressed
      if (e.shiftKey) {
        nextRot = Math.round(nextRot / 15) * 15;
      }
      nextRot = Math.round(((nextRot % 360) + 360) % 360);
      if (nextRot > 180) nextRot -= 360;

      onUpdateClip(clip.id, {
        transform: {
          ...clip.transform,
          rotation: nextRot,
        },
      });
      setDragInfo(`${nextRot}°${e.shiftKey ? " (Snap 15°)" : ""}`);
      renderFrame(playhead, false);
    } else if (drag.type === "scale") {
      const currDist = Math.max(5, Math.hypot(e.clientX - drag.centerStageX, e.clientY - drag.centerStageY));
      const factor = currDist / drag.startDist;
      let nextScale = Math.max(0.05, Math.min(10, drag.initialScale * factor));

      // Snap to 1.0 (100%) if close
      if (Math.abs(nextScale - 1) < 0.03) {
        nextScale = 1;
      }

      const formatted = Math.round(nextScale * 100);
      onUpdateClip(clip.id, {
        transform: {
          ...clip.transform,
          scale: Number(nextScale.toFixed(3)),
        },
      });
      setDragInfo(`${formatted}%`);
      renderFrame(playhead, false);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeDrag.current) {
      activeDrag.current = null;
      setDragInfo(null);
      endTransaction();
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Double click resets position and scale to defaults
    beginTransaction();
    onUpdateClip(clip.id, {
      transform: {
        ...clip.transform,
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
      },
    });
    endTransaction();
    renderFrame(playhead, false);
  };

  return (
    <div
      className="canvas-gizmo-container"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: displayW,
        height: displayH,
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      <div
        ref={boxRef}
        className="canvas-gizmo-box"
        style={{
          position: "absolute",
          left: cx,
          top: cy,
          width: scaledW,
          height: scaledH,
          transform: `translate(-50%, -50%) rotate(${rot}deg)`,
          pointerEvents: "auto",
        }}
        onPointerDown={handlePointerDownMove}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        title="Drag: Geser posisi | Dobel klik: Reset posisi & ukuran"
      >
        {/* Floating Value Pill Badge */}
        {dragInfo && (
          <div
            className="gizmo-badge"
            style={{
              position: "absolute",
              bottom: "100%",
              left: "50%",
              transform: "translate(-50%, -36px)",
              pointerEvents: "none",
            }}
          >
            {dragInfo}
          </div>
        )}

        {/* Rotation Stalk and Knob */}
        <div
          className="gizmo-rotate-stalk"
          style={{
            position: "absolute",
            top: -24,
            left: "50%",
            width: 1.5,
            height: 24,
            transform: "translateX(-50%)",
            pointerEvents: "none",
          }}
        />
        <div
          className="gizmo-rotate-knob"
          style={{
            position: "absolute",
            top: -34,
            left: "50%",
            transform: "translateX(-50%)",
          }}
          onPointerDown={handlePointerDownRotate}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          title="Drag: Putar sudut (Tahan Shift untuk snap kelipatan 15°)"
        />

        {/* 4 Corner Scale Handles */}
        <div
          className="gizmo-handle corner tl"
          onPointerDown={(e) => handlePointerDownScale("tl", e)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        <div
          className="gizmo-handle corner tr"
          onPointerDown={(e) => handlePointerDownScale("tr", e)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        <div
          className="gizmo-handle corner bl"
          onPointerDown={(e) => handlePointerDownScale("bl", e)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        <div
          className="gizmo-handle corner br"
          onPointerDown={(e) => handlePointerDownScale("br", e)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />

        {/* 4 Side Scale Handles */}
        <div
          className="gizmo-handle side tc"
          onPointerDown={(e) => handlePointerDownScale("tc", e)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        <div
          className="gizmo-handle side bc"
          onPointerDown={(e) => handlePointerDownScale("bc", e)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        <div
          className="gizmo-handle side ml"
          onPointerDown={(e) => handlePointerDownScale("ml", e)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        <div
          className="gizmo-handle side mr"
          onPointerDown={(e) => handlePointerDownScale("mr", e)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />

        {/* Center Anchor Crosshair */}
        <div className="gizmo-center-crosshair" />
      </div>
    </div>
  );
}
