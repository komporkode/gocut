import { useEffect, useMemo, useRef, useState } from "react";
import type { Clip, Keyframe, Project } from "../core/types";
import { evaluateKeyframes } from "../core/model";
import { EASINGS } from "../core/easing";
import {
  copyKeys,
  deleteKeys,
  editKey,
  EASING_LABELS,
  KEY_LABELS,
  KEY_PROPERTIES,
  keyLimits,
  pasteKeys,
  putKey,
  type KeyClipboard,
} from "../core/keyframeEdits";
import { useEditorStore } from "../editor/store";
import { useTranslation } from "../i18n";
import "./KeyframeCurveEditor.css";

// Internal clipboard only: no operating-system clipboard access or private data reads.
let clipboard: KeyClipboard | null = null;
const W = 320,
  H = 190,
  L = 42,
  R = 12,
  T = 16,
  B = 30;
export default function KeyframeCurveEditor({
  project,
  clip,
  playhead,
  visual,
  onUpdate,
}: {
  project: Project;
  clip: Clip;
  playhead: number;
  visual: boolean;
  onUpdate(patch: Partial<Clip>): void;
}) {
  const { t } = useTranslation();
  const propertyLabels: Record<Keyframe["property"], string> = {
    x: t("inspector.positionX"),
    y: t("inspector.positionY"),
    scale: t("inspector.scale"),
    rotation: t("inspector.rotation"),
    opacity: t("inspector.opacity"),
    volume: t("inspector.volume"),
  };
  const easingLabels: Record<Keyframe["easing"], string> = {
    linear: t("keyframes.linear"),
    easeIn: t("keyframes.easeIn"),
    easeOut: t("keyframes.easeOut"),
    easeInOut: t("keyframes.easeInOut"),
  };
  const [property, setProperty] = useState<Keyframe["property"]>(
    visual ? "x" : "volume",
  );
  const [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState("");
  const [, refresh] = useState(0);
  const drag = useRef<{
    keyId: string;
    clip: Clip;
    low: number;
    high: number;
    element: SVGSVGElement;
  } | null>(null);
  const locked = !!project.tracks.find((t) => t.id === clip.trackId)?.locked;
  const keys = clip.keyframes
    .filter((k) => k.property === property)
    .sort((a, b) => a.time - b.time);
  const chosen = clip.keyframes.find(
    (k) => k.id === selected[0] && k.property === property,
  );
  const [timeInput, setTimeInput] = useState(""),
    [valueInput, setValueInput] = useState("");
  useEffect(() => {
    setTimeInput(chosen ? String(chosen.time) : "");
    setValueInput(chosen ? String(chosen.value) : "");
  }, [chosen?.id, chosen?.time, chosen?.value]);
  useEffect(
    () => () => {
      if (drag.current) useEditorStore.getState().endTransaction();
    },
    [],
  );
  const local = Math.max(0, Math.min(clip.duration, playhead - clip.start));
  // Sampling depends on the clip, not the moving playhead. Include exact key
  // times so short peaks cannot disappear between regularly spaced samples.
  const samples = useMemo(() => {
    const times = [
      ...new Set([
        ...Array.from({ length: 161 }, (_, i) => (i / 160) * clip.duration),
        ...clip.keyframes
          .filter((k) => k.property === property)
          .map((k) => k.time),
      ]),
    ].sort((a, b) => a - b);
    return times.map((time) => {
      const evaluated = evaluateKeyframes(clip, time);
      return {
        time,
        value:
          property === "volume"
            ? evaluated.volume
            : evaluated.transform[property],
      };
    });
  }, [clip, property]);
  const values = [samples[0].value, ...keys.map((k) => k.value)];
  const limits = keyLimits(property);
  let low = Math.min(...values),
    high = Math.max(...values);
  const pad = Math.max(
    (high - low) * 0.2,
    property === "scale"
      ? 0.25
      : property === "opacity"
        ? 0.1
        : property === "volume"
          ? 0.25
          : 20,
  );
  low = Math.max(limits[0], low - pad);
  high = Math.min(limits[1], high + pad);
  if (drag.current) {
    low = drag.current.low;
    high = drag.current.high;
  }
  const x = (t: number) => L + (t / clip.duration) * (W - L - R),
    y = (v: number) => T + ((high - v) / (high - low)) * (H - T - B);
  const curve = samples
    .map(
      ({ time, value }, i) =>
        `${i ? "L" : "M"}${x(time).toFixed(3)},${y(value).toFixed(3)}`,
    )
    .join(" ");
  const safe = (action: () => void) => {
    try {
      action();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const select = (key: Keyframe, additive: boolean) => {
    setSelected((current) =>
      additive
        ? current.includes(key.id)
          ? current.filter((id) => id !== key.id)
          : [...current, key.id]
        : [key.id],
    );
    useEditorStore.getState().seek(clip.start + key.time);
  };
  const remove = () =>
    safe(() => {
      if (locked) return;
      onUpdate({ keyframes: deleteKeys(project, clip, selected) });
      setSelected([]);
    });
  const copy = () =>
    safe(() => {
      clipboard = copyKeys(clip, selected);
      refresh((n) => n + 1);
    });
  const paste = () =>
    safe(() => {
      if (!clipboard || locked) return;
      const result = pasteKeys(project, clip, clipboard, local);
      onUpdate({ keyframes: result.keys });
      setSelected(
        result.ids.filter(
          (id) => result.keys.find((k) => k.id === id)?.property === property,
        ),
      );
    });
  const endDrag = () => {
    if (drag.current) {
      drag.current = null;
      useEditorStore.getState().endTransaction();
      refresh((n) => n + 1);
    }
  };
  const commitInput = (field: "time" | "value", text: string) =>
    safe(() => {
      if (!chosen || locked) return;
      if (!text.trim() || !Number.isFinite(Number(text)))
        throw new Error("Invalid finite number");
      onUpdate({
        keyframes: editKey(project, clip, chosen.id, { [field]: Number(text) }),
      });
    });
  return (
    <section
      className="keyframe-curve"
      aria-label={t("curve.title")}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest("input,select")) {
          e.stopPropagation();
          return;
        }
        const modifier = e.metaKey || e.ctrlKey;
        if (
          (modifier && ["a", "c", "v"].includes(e.key.toLowerCase())) ||
          ["Delete", "Backspace"].includes(e.key)
        ) {
          e.preventDefault();
          e.stopPropagation();
          if (modifier && e.key.toLowerCase() === "a")
            setSelected(keys.map((k) => k.id));
          else if (modifier && e.key.toLowerCase() === "c") copy();
          else if (modifier && e.key.toLowerCase() === "v") paste();
          else remove();
        }
      }}
    >
      <header>
        <h3>{t("curve.title")}</h3>
        <select
          aria-label={t("curve.propertyAria")}
          value={property}
          onChange={(e) => {
            endDrag();
            setProperty(e.target.value as Keyframe["property"]);
            setSelected([]);
            setError("");
          }}
        >
          {KEY_PROPERTIES.filter((p) => visual || p === "volume").map((p) => (
            <option key={p} value={p}>
              {propertyLabels[p]}
            </option>
          ))}
        </select>
      </header>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="group"
        aria-label={`${propertyLabels[property]} ${t("curve.title")}`}
        tabIndex={0}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || locked) return;
          const rect = d.element.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W,
            py = ((e.clientY - rect.top) / rect.height) * H;
          safe(() =>
            onUpdate({
              keyframes: editKey(project, d.clip, d.keyId, {
                time: ((px - L) / (W - L - R)) * clip.duration,
                value: Math.max(
                  limits[0],
                  Math.min(
                    limits[1],
                    d.high - ((py - T) / (H - T - B)) * (d.high - d.low),
                  ),
                ),
              }),
            }),
          );
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line
              x1={L}
              x2={W - R}
              y1={T + t * (H - T - B)}
              y2={T + t * (H - T - B)}
              className="curve-grid"
            />
            <text x={L - 5} y={T + t * (H - T - B) + 4} textAnchor="end">
              {Number((high - t * (high - low)).toPrecision(3))}
            </text>
            <text x={x(t * clip.duration)} y={H - 9} textAnchor="middle">
              {Number((t * clip.duration).toFixed(2))}s
            </text>
          </g>
        ))}
        <path d={curve} className="curve-line" />
        <line
          x1={x(local)}
          x2={x(local)}
          y1={T}
          y2={H - B}
          className="curve-playhead"
        />
        {keys.map((k) => (
          <circle
            key={k.id}
            data-key-id={k.id}
            role="button"
            tabIndex={0}
            aria-label={`${t("keyframes.title")} ${property} ${k.time.toFixed(3)}s`}
            aria-pressed={selected.includes(k.id)}
            cx={x(k.time)}
            cy={y(k.value)}
            r={selected.includes(k.id) ? 6 : 5}
            className={`curve-point ${selected.includes(k.id) ? "selected" : ""}`}
            aria-disabled={locked}
            onPointerDown={(e) => {
              e.stopPropagation();
              select(k, e.shiftKey);
              if (locked || e.shiftKey) return;
              const svg = e.currentTarget.ownerSVGElement!;
              svg.focus();
              svg.setPointerCapture(e.pointerId);
              useEditorStore.getState().beginTransaction();
              drag.current = { keyId: k.id, clip, low, high, element: svg };
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                select(k, e.shiftKey);
              } else if (
                ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                  e.key,
                )
              ) {
                e.preventDefault();
                e.stopPropagation();
                if (locked) return;
                safe(() =>
                  onUpdate({
                    keyframes: editKey(
                      project,
                      clip,
                      k.id,
                      e.key === "ArrowLeft" || e.key === "ArrowRight"
                        ? {
                            time:
                              k.time +
                              (e.key === "ArrowLeft" ? -1 : 1) / project.fps,
                          }
                        : {
                            value:
                              k.value +
                              (e.key === "ArrowDown" ? -1 : 1) *
                                (property === "opacity" || property === "scale"
                                  ? 0.01
                                  : property === "volume"
                                    ? 0.1
                                    : 1),
                          },
                    ),
                  }),
                );
              }
            }}
          />
        ))}
      </svg>
      <p className="field-hint">{t("curve.helpHint")}</p>
      <div className="curve-actions">
        <button
          disabled={locked}
          onClick={() =>
            safe(() => {
              const result = putKey(project, clip, property, local);
              onUpdate({ keyframes: result.keys });
              setSelected([result.id]);
            })
          }
        >{t("curve.addCurrentFrame")}</button>
        <button disabled={!selected.length} onClick={copy}>{t("curve.copyKeyframe")}</button>
        <button disabled={locked || !clipboard} onClick={paste}>{t("curve.pasteToPlayhead")}</button>
        <button disabled={locked || !selected.length} onClick={remove}>{t("curve.deleteSelected")}</button>
        <button
          disabled={!keys.length}
          onClick={() => setSelected(keys.map((k) => k.id))}
        >{t("curve.selectAll")}</button>
      </div>
      {chosen && (
        <div className="curve-fields">
          <label>
            {t("curve.timeSec")}
            <input
              aria-label={t("curve.timeSec")}
              type="number"
              min="0"
              max={clip.duration}
              step={1 / project.fps}
              value={timeInput}
              disabled={locked}
              onChange={(e) => setTimeInput(e.target.value)}
              onBlur={() => commitInput("time", timeInput)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          </label>
          <label>
            {t("curve.value")}
            <input
              aria-label={t("curve.value")}
              type="number"
              min={limits[0]}
              max={limits[1]}
              step="0.01"
              value={valueInput}
              disabled={locked}
              onChange={(e) => setValueInput(e.target.value)}
              onBlur={() => commitInput("value", valueInput)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          </label>
          <label>
            {t("curve.easingIntoPoint")}
            <select
              aria-label={t("keyframes.easing")}
              disabled={locked}
              value={chosen.easing}
              onChange={(e) =>
                safe(() =>
                  onUpdate({
                    keyframes: editKey(project, clip, chosen.id, {
                      easing: e.target.value as Keyframe["easing"],
                    }),
                  }),
                )
              }
            >
              {EASINGS.map((e) => (
                <option key={e} value={e}>
                  {easingLabels[e]}
                </option>
              ))}
            </select>
          </label>
          {chosen.easingWindow && (
            <p className="field-hint">{t("curve.trimmedRangeHint")}</p>
          )}
        </div>
      )}
      {error && (
        <p className="inline-warning" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
