import { linkedIds } from "./timelineEdits";
/** Original, offline editing recipes. MIT; no third-party templates or media. */
import type { Clip, Keyframe, Project, TextStyle } from "./types";
import {
  createClip,
  createTrack,
  evaluateKeyframes,
  id,
  snapToFrame,
} from "./model";

export interface TextPreset {
  id: string;
  name: string;
  category: "Title" | "Subtitle" | "Badge" | "Dynamic" | "标题" | "字幕" | "标记" | "动态";
  style: Partial<TextStyle> & { text: string };
  y?: number;
  motion?: "rise" | "pop" | "fade";
}
export const TEXT_PRESETS: readonly TextPreset[] = [
  {
    id: "classic",
    name: "Classic Title",
    category: "Title",
    style: { text: "Turn inspiration into visuals", fontSize: 80 },
  },
  {
    id: "chapter",
    name: "Chapter Title",
    category: "Title",
    style: {
      text: "CHAPTER 01\nMy Story",
      fontSize: 66,
      color: "#ffd69a",
      strokeWidth: 0,
    },
  },
  {
    id: "cinema",
    name: "Cinematic Title",
    category: "Title",
    style: {
      text: "ON THE ROAD\nA JOURNEY",
      fontSize: 90,
      color: "#fff0d5",
      strokeWidth: 0,
    },
  },
  {
    id: "editorial",
    name: "Minimal Editorial",
    category: "Title",
    style: {
      text: "LIFESTYLE\nVOL. 01",
      fontSize: 70,
      bold: false,
      strokeWidth: 0,
    },
  },
  {
    id: "subtitle",
    name: "Lower Third Subtitle",
    category: "Subtitle",
    y: 0.36,
    style: {
      text: "Every frame is worth capturing",
      fontSize: 52,
      bold: false,
      background: "#11151c",
      strokeWidth: 0,
    },
  },
  {
    id: "outline",
    name: "Bold Outline",
    category: "Subtitle",
    y: 0.36,
    style: { text: "Add some light to an ordinary day", fontSize: 54, strokeWidth: 4 },
  },
  {
    id: "warm-caption",
    name: "Warm Narration",
    category: "Subtitle",
    y: 0.32,
    style: {
      text: "Walk slowly, enjoy the journey",
      fontSize: 48,
      bold: false,
      color: "#fff0d5",
      background: "#493b32",
      strokeWidth: 0,
    },
  },
  {
    id: "quote",
    name: "Interview Quote",
    category: "Subtitle",
    style: {
      text: "“Put passion into every single day.”",
      fontSize: 64,
      color: "#a0f1df",
      strokeWidth: 0,
    },
  },
  {
    id: "mint",
    name: "Mint Badge",
    category: "Badge",
    style: { text: "GOCUT", fontSize: 104, color: "#62ead1", strokeWidth: 0 },
  },
  {
    id: "comic",
    name: "Comic Pop",
    category: "Badge",
    style: {
      text: "WOW!",
      fontSize: 100,
      color: "#ffd176",
      stroke: "#382637",
      strokeWidth: 7,
    },
  },
  {
    id: "news",
    name: "News Alert",
    category: "Badge",
    y: 0.29,
    style: {
      text: "LIVE · BREAKING NEWS",
      fontSize: 60,
      background: "#b63f43",
      strokeWidth: 0,
    },
  },
  {
    id: "label",
    name: "Name Card",
    category: "Badge",
    y: 0.3,
    style: {
      text: "Alex River · Creator",
      fontSize: 52,
      color: "#15252c",
      background: "#62ead1",
      strokeWidth: 0,
    },
  },
  {
    id: "rise",
    name: "Gentle Rise",
    category: "Dynamic",
    motion: "rise",
    style: { text: "A new story begins now", fontSize: 74, strokeWidth: 0 },
  },
  {
    id: "pop",
    name: "Pop In",
    category: "Dynamic",
    motion: "pop",
    style: { text: "HELLO!", fontSize: 108, color: "#ffd176", strokeWidth: 4 },
  },
  {
    id: "fade",
    name: "Soft Glow Intro",
    category: "Dynamic",
    motion: "fade",
    style: {
      text: "A moment of serendipity",
      fontSize: 72,
      bold: false,
      color: "#fff0d5",
      strokeWidth: 0,
    },
  },
  {
    id: "end",
    name: "Gentle Outro",
    category: "Dynamic",
    motion: "fade",
    style: {
      text: "Thanks for watching\nSee you next time",
      fontSize: 76,
      color: "#a0f1df",
      strokeWidth: 0,
    },
  },
];
type VisualProperty = Exclude<Keyframe["property"], "volume">;
function keys(
  property: VisualProperty,
  points: [number, number][],
): Keyframe[] {
  return points.map(([time, value]) => ({
    id: id(),
    property,
    time,
    value,
    easing: "easeInOut",
  }));
}
function replaceKeys(clip: Clip, additions: Keyframe[]): Keyframe[] {
  const properties = new Set(additions.map((k) => k.property));
  return [
    ...clip.keyframes.filter((k) => !properties.has(k.property)),
    ...additions,
  ];
}
export function makeTextPreset(
  preset: TextPreset,
  trackId: string,
  start: number,
  project: Pick<Project, "width" | "height" | "fps">,
): Clip {
  const clip = createClip(undefined, trackId, start, project.fps);
  const scale = Math.min(project.width / 1920, project.height / 1080);
  clip.text = {
    ...clip.text!,
    ...preset.style,
    fontSize: Math.min(
      1000,
      Math.max(8, (preset.style.fontSize ?? 72) * scale),
    ),
    strokeWidth: (preset.style.strokeWidth ?? 2) * scale,
  };
  clip.name = preset.style.text.replaceAll("\n", " · ");
  clip.transform.y = (preset.y ?? 0) * project.height;
  if (preset.motion) {
    clip.fadeIn = 0.5;
    clip.fadeOut = 0.5;
  }
  if (preset.motion === "rise")
    clip.keyframes = keys("y", [
      [0, clip.transform.y + project.height * 0.12],
      [0.65, clip.transform.y],
    ]);
  if (preset.motion === "pop")
    clip.keyframes = keys("scale", [
      [0, 0.45],
      [0.4, 1.1],
      [0.65, 1],
    ]);
  return clip;
}
export function addTextPreset(
  project: Project,
  preset: TextPreset,
  start: number,
): { project: Project; clip: Clip } {
  const track =
    project.tracks.find((t) => t.kind === "text" && !t.locked) ??
    createTrack("text");
  const clip = makeTextPreset(preset, track.id, start, project);
  return {
    project: {
      ...project,
      tracks: project.tracks.includes(track)
        ? project.tracks
        : [track, ...project.tracks],
      clips: [...project.clips, clip],
    },
    clip,
  };
}
export const MOTION_PRESETS = [
  { id: "push", name: "Slow Push In", description: "Slowly zooms in to emphasize the subject" },
  { id: "pull", name: "Pull Back", description: "Zooms out from close-up to reveal the scene" },
  { id: "pan-left", name: "Pan Left", description: "Smooth horizontal glide to the left" },
  { id: "pan-right", name: "Pan Right", description: "Smooth horizontal glide to the right" },
  { id: "float", name: "Gentle Float", description: "Gently floats up and down" },
  { id: "pulse", name: "Breathe Pulse", description: "Two soft zoom pulses and ease-backs" },
  { id: "sway", name: "Soft Sway", description: "Subtle side-to-side tilting" },
  { id: "shake", name: "Rhythm Shake", description: "Short energetic camera shake returning to position" },
] as const;
export type MotionId = (typeof MOTION_PRESETS)[number]["id"];
export function motionPatch(
  clip: Clip,
  motion: MotionId,
  project: Pick<Project, "width" | "height">,
): Partial<Clip> {
  const d = clip.duration,
    t = clip.transform;
  const scale = (v: number) => Math.max(0.01, Math.min(10, v));
  let frames: Keyframe[];
  switch (motion) {
    case "push":
      frames = keys("scale", [
        [0, t.scale],
        [d, scale(t.scale * 1.18)],
      ]);
      break;
    case "pull":
      frames = keys("scale", [
        [0, scale(t.scale * 1.18)],
        [d, t.scale],
      ]);
      break;
    case "pan-left":
    case "pan-right": {
      const delta = project.width * 0.06 * (motion === "pan-left" ? -1 : 1);
      frames = keys("x", [
        [0, t.x - delta],
        [d, t.x + delta],
      ]);
      break;
    }
    case "float":
      frames = keys("y", [
        [0, t.y],
        [d * 0.25, t.y - project.height * 0.025],
        [d * 0.75, t.y + project.height * 0.025],
        [d, t.y],
      ]);
      break;
    case "pulse":
      frames = keys("scale", [
        [0, t.scale],
        [d * 0.25, scale(t.scale * 1.08)],
        [d * 0.5, t.scale],
        [d * 0.75, scale(t.scale * 1.08)],
        [d, t.scale],
      ]);
      break;
    case "sway":
      frames = keys("rotation", [
        [0, t.rotation],
        [d * 0.25, t.rotation - 3],
        [d * 0.75, t.rotation + 3],
        [d, t.rotation],
      ]);
      break;
    case "shake":
      frames = keys("x", [
        [0, t.x],
        ...Array.from(
          { length: 6 },
          (_, i) =>
            [
              (d * (i + 1)) / 12,
              t.x + project.width * 0.014 * (i % 2 ? 1 : -1),
            ] as [number, number],
        ),
        [d * 0.65, t.x],
        [d, t.x],
      ]);
      break;
  }
  return { keyframes: replaceKeys(clip, frames) };
}
export const TRANSITION_PRESETS = [
  {
    id: "dissolve",
    name: "Cross Dissolve",
    description: "Smooth blend between consecutive clips",
    category: "Basic",
  },
  {
    id: "dip",
    name: "Dip to Color",
    description: "Fades out to canvas background, then enters next clip",
    category: "Basic",
  },
  {
    id: "slide-left",
    name: "Slide Left",
    description: "Next clip slides in from the right edge",
    category: "Motion",
  },
  {
    id: "slide-right",
    name: "Slide Right",
    description: "Next clip slides in from the left edge",
    category: "Motion",
  },
  {
    id: "slide-up",
    name: "Slide Up",
    description: "Next clip slides in from the bottom edge",
    category: "Motion",
  },
  {
    id: "slide-down",
    name: "Slide Down",
    description: "Next clip slides in from the top edge",
    category: "Motion",
  },
  {
    id: "zoom",
    name: "Zoom Cross",
    description: "Next clip zooms in from small and fades in",
    category: "Dynamic",
  },
  {
    id: "spin",
    name: "Spin Cross",
    description: "Next clip rotates slightly, scales up, and fades in",
    category: "Dynamic",
  },
] as const;
export type TransitionId = (typeof TRANSITION_PRESETS)[number]["id"];
/** Make the leading edge meet the existing curve at duration; preserve its later keys. */
function incomingKeys(
  clip: Clip,
  property: VisualProperty,
  value: number,
  duration: number,
): Keyframe[] {
  const target = evaluateKeyframes(clip, duration).transform[property];
  const sorted = clip.keyframes
    .filter((k) => k.property === property)
    .sort((a, b) => a.time - b.time);
  const curve = sorted.filter(
    (k, i) => i === sorted.length - 1 || sorted[i + 1].time !== k.time,
  );
  const rightIndex = curve.findIndex((k) => k.time > duration);
  const right = curve[rightIndex],
    left = curve[rightIndex - 1];
  // Restrict the first surviving non-linear segment to its remaining interval.
  // Merely keeping its destination key would restart easing and change later motion.
  const remaining = clip.keyframes
    .filter((k) => k.property !== property || k.time > duration)
    .map((k) => {
      if (
        k.id !== right?.id ||
        !left ||
        left.time >= duration ||
        right.easing === "linear"
      )
        return k;
      const window = right.easingWindow ?? { start: 0, end: 1 };
      return {
        ...k,
        easingWindow: {
          start:
            window.start +
            ((window.end - window.start) * (duration - left.time)) /
              (right.time - left.time),
          end: window.end,
        },
      };
    });
  return [
    ...remaining,
    ...keys(property, [
      [0, value],
      [duration, target],
    ]),
  ];
}
export function applyTransition(
  project: Project,
  clipId: string,
  transition: TransitionId,
  seconds: number,
): { project: Project; duration: number } {
  if (
    !TRANSITION_PRESETS.some((p) => p.id === transition) ||
    !Number.isFinite(seconds) ||
    seconds <= 0
  )
    throw new Error("Invalid transition parameters (转场参数无效)");
  const front = project.clips.find((c) => c.id === clipId),
    track = project.tracks.find((t) => t.id === front?.trackId);
  if (!front || !track || front.text || track.kind === "audio")
    throw new Error("Please select a video or image clip (请选择一个画面片段)");
  if (track.locked) throw new Error("Please unlock track first (请先解锁轨道)");
  const siblings = project.clips
    .filter((c) => c.trackId === track.id)
    .sort((a, b) => a.start - b.start);
  const index = siblings.findIndex((c) => c.id === front.id),
    next = siblings[index + 1];
  const end = front.start + front.duration,
    tolerance = 1 / project.fps + 0.00001;
  if (
    !next ||
    next.text ||
    next.start > end + tolerance ||
    next.start < end - front.duration / 2 - 0.00001
  )
    throw new Error("需要同轨相邻的两个画面片段；请先消除间隙或过大的重叠 (Requires two adjacent clips without gaps)");
  const limit = Math.min(5, front.duration / 2, next.duration / 2);
  const duration =
    Math.floor(Math.min(seconds, limit) * project.fps + 1e-8) / project.fps;
  if (duration < 1 / project.fps) throw new Error("片段太短，无法添加转场 (Clip is too short for transition)");
  const newStart = snapToFrame(
    end - (transition === "dip" ? 0 : duration),
    project.fps,
  );
  if (
    siblings[index + 2] &&
    newStart + next.duration > siblings[index + 2].start + 0.00001
  )
    throw new Error("转场会与后续片段重叠；请先为后片段留出空间 (Transition would overlap subsequent clip)");
  let incoming: Clip = {
    ...next,
    start: newStart,
    fadeIn: duration,
    audioFadeIn: duration,
    videoFadeWindow: undefined,
    audioFadeWindow: undefined,
  };
  const at = evaluateKeyframes(next, duration).transform;
  if (transition.startsWith("slide")) {
    const horizontal =
        transition === "slide-left" || transition === "slide-right",
      property = horizontal ? "x" : "y";
    const sign =
      transition === "slide-left" || transition === "slide-up" ? 1 : -1;
    incoming.keyframes = incomingKeys(
      incoming,
      property,
      at[property] + (horizontal ? project.width : project.height) * sign,
      duration,
    );
    incoming.fadeIn = 0;
  }
  if (transition === "zoom" || transition === "spin")
    incoming.keyframes = incomingKeys(
      incoming,
      "scale",
      Math.max(0.01, at.scale * 0.3),
      duration,
    );
  if (transition === "spin")
    incoming.keyframes = incomingKeys(
      incoming,
      "rotation",
      at.rotation - 35,
      duration,
    );
  const outgoing: Clip = {
    ...front,
    fadeOut: transition === "dip" ? duration : 0,
    videoFadeWindow: front.videoFadeWindow
      ? {
          ...front.videoFadeWindow,
          fadeOut: transition === "dip" ? duration : 0,
        }
      : undefined,
    audioFadeOut: duration,
    audioFadeWindow: undefined,
  };
  const outgoingIds = new Set(linkedIds(project, [front.id]));
  const incomingIds = new Set(linkedIds(project, [next.id]));
  if (project.clips.some(c => (outgoingIds.has(c.id) || incomingIds.has(c.id)) && project.tracks.find(t => t.id === c.trackId)?.locked))
    throw new Error("关联音频轨道已锁定，请先解锁");
  // A trimmed envelope's original end need not equal this clip's end: materialize the outgoing dip.
  if (transition === "dip") outgoing.videoFadeWindow = undefined;
  return {
    duration,
    project: {
      ...project,
      clips: project.clips.map((c) =>
        c.id === front.id ? outgoing : c.id === next.id ? incoming :
        incomingIds.has(c.id) ? { ...c, start: c.start + newStart - next.start, audioFadeIn: duration, audioFadeWindow: undefined } :
        outgoingIds.has(c.id) ? { ...c, audioFadeOut: duration, audioFadeWindow: undefined } : c,
      ),
    },
  };
}
