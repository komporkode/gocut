const fs = require('fs');
const path = require('path');

const root = path.resolve('d:/PROJECT/GAWEAN/PROJECT/APP/rea-capcut');

// 1. Update src/styles.css for Studio Full-Height Layout and CapCut Transition styling
const stylesPath = path.join(root, 'src/styles.css');
let stylesContent = fs.readFileSync(stylesPath, 'utf8');

const studioAndTransitionStyles = `
/* Studio layout mode (CapCut desktop vertical full-height) */
.app-shell.layout-studio {
  display: flex !important;
  flex-direction: column !important;
  height: 100dvh !important;
  padding: 0 8px !important;
  background: #151515 !important;
  overflow: hidden !important;
}
.app-shell.layout-studio .titlebar {
  flex-shrink: 0;
}
.app-shell.layout-studio .app-status {
  flex-shrink: 0;
}
.studio-main-container {
  flex: 1;
  display: flex;
  flex-direction: row;
  min-height: 0;
  min-width: 0;
  position: relative;
  overflow: hidden;
  gap: 0;
}
.studio-left-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.studio-top-workspace {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(280px, 1fr);
  min-height: 180px;
  min-width: 0;
  gap: 7px;
  padding-bottom: 7px;
}
.studio-top-workspace .resource-panel {
  min-width: 0;
  height: 100%;
}
.studio-top-workspace .inspector-panel {
  min-width: 0;
  height: 100%;
}
.studio-left-column .timeline-pane {
  min-width: 0;
  position: relative;
  border-top: 1px solid #282828;
}
.studio-vertical-splitter {
  width: 7px;
  cursor: col-resize;
  background: transparent;
  position: relative;
  z-index: 15;
  touch-action: none;
  flex-shrink: 0;
}
.studio-vertical-splitter::after {
  content: "";
  position: absolute;
  top: 25%;
  bottom: 25%;
  left: 2px;
  width: 3px;
  border-radius: 3px;
  background: transparent;
  transition: background 0.15s;
}
.studio-vertical-splitter:hover::after,
.studio-vertical-splitter:focus-visible::after {
  background: var(--accent);
}
.studio-right-column {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 280px;
  background: #181818;
  border-left: 1px solid #282828;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
}
.studio-right-column .player-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.studio-right-column .player-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #141414;
}

/* CapCut Seam Transition Indicator (Non-stacking) */
.tl-transition-block {
  position: absolute;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.14);
  background-image: repeating-linear-gradient(
    45deg,
    rgba(255, 255, 255, 0.08),
    rgba(255, 255, 255, 0.08) 4px,
    transparent 4px,
    transparent 8px
  );
  border: 1.5px solid rgba(255, 255, 255, 0.55);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
  cursor: pointer;
  z-index: 12;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  backdrop-filter: blur(2px);
  transition: border-color 0.15s, background-color 0.15s;
}
.tl-transition-block:hover {
  border-color: #ffffff;
  background-color: rgba(255, 255, 255, 0.22);
}
.tl-transition-block.is-selected {
  border: 2px solid #ffffff;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.5), 0 0 8px rgba(255, 255, 255, 0.6);
  background-color: rgba(255, 255, 255, 0.28);
}
.tl-transition-center-seam {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  background: rgba(255, 255, 255, 0.85);
  transform: translateX(-50%);
}
.tl-transition-bowtie {
  position: relative;
  z-index: 2;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
}
`;

if (!stylesContent.includes('.studio-main-container')) {
  stylesContent += '\n' + studioAndTransitionStyles;
  fs.writeFileSync(stylesPath, stylesContent, 'utf8');
  console.log('Appended studio layout & transition styles to src/styles.css');
}

// 2. Update src/components/Timeline.tsx
const timelinePath = path.join(root, 'src/components/Timeline.tsx');
let timelineContent = fs.readFileSync(timelinePath, 'utf8');

// Replace layoutTrackClips so transition overlaps stay on lane 0
const oldLayoutTrackClips = `export function layoutTrackClips(clips: Clip[]) {
  const ends: number[] = [];
  const lanes = new Map<string, number>();
  for (const clip of [...clips].sort((a, b) => a.start - b.start)) {
    let lane = ends.findIndex((end) => end <= clip.start + 0.00001);
    if (lane < 0) lane = ends.length;
    ends[lane] = clip.start + clip.duration;
    lanes.set(clip.id, lane);
  }
  return {
    lanes,
    count: Math.max(1, ends.length),
    height: Math.max(ROW, ends.length * 62 + 8),
  };
}`;

const newLayoutTrackClips = `export function layoutTrackClips(clips: Clip[]) {
  const ends: number[] = [];
  const lanes = new Map<string, number>();
  const sorted = [...clips].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i++) {
    const clip = sorted[i];
    const prev = sorted[i - 1];
    // Adjacent clips with transition overlap share the same lane (non-stacking, CapCut style)
    const isTransitionOverlap = prev && (
      (clip.fadeIn > 0 || prev.fadeOut > 0 || clip.videoFadeWindow || prev.videoFadeWindow) &&
      clip.start >= prev.start + prev.duration - Math.max(prev.fadeOut, clip.fadeIn, 2.5) - 0.05
    );
    let lane = ends.findIndex((end) => end <= clip.start + 0.00001);
    if (lane < 0 && isTransitionOverlap && ends.length > 0) {
      lane = lanes.get(prev.id) ?? 0;
    }
    if (lane < 0) lane = ends.length;
    ends[lane] = Math.max(ends[lane] ?? 0, clip.start + clip.duration);
    lanes.set(clip.id, lane);
  }
  return {
    lanes,
    count: Math.max(1, ends.length),
    height: Math.max(ROW, ends.length * 62 + 8),
  };
}`;

if (timelineContent.includes(oldLayoutTrackClips)) {
  timelineContent = timelineContent.replace(oldLayoutTrackClips, newLayoutTrackClips);
  console.log('Replaced layoutTrackClips in src/components/Timeline.tsx');
}

// Add selectedTransition state in Timeline component
if (!timelineContent.includes('const [selectedTransition, setSelectedTransition] = useState<string | null>(null);')) {
  timelineContent = timelineContent.replace(
    'const [snapLine, setSnapLine] = useState<number | null>(null);',
    'const [snapLine, setSnapLine] = useState<number | null>(null);\n  const [selectedTransition, setSelectedTransition] = useState<string | null>(null);'
  );
}

// Add moveClipVertically and moveClipToNewTrack helpers
const moveHelpers = `
  const moveClipVertically = (clip: Clip, direction: "up" | "down") => {
    const p = useEditorStore.getState().project;
    const currentIdx = p.tracks.findIndex((t) => t.id === clip.trackId);
    if (currentIdx < 0) return;
    const currentTrack = p.tracks[currentIdx];

    if (direction === "up") {
      const upperTrack = p.tracks.slice(0, currentIdx).reverse().find((t) => t.kind === currentTrack.kind && !t.locked);
      if (upperTrack) {
        props.onMoveClips([clip.id], 0, upperTrack.id);
      } else {
        const newTrack = {
          id: "track-" + Math.random().toString(36).substring(2, 9),
          name: \`Video \${p.tracks.filter(t => t.kind === "video").length + 1}\`,
          kind: currentTrack.kind,
          muted: false,
          hidden: false,
          locked: false,
        };
        const tracks = [...p.tracks];
        tracks.splice(currentIdx, 0, newTrack);
        const clips = p.clips.map((c) => c.id === clip.id ? { ...c, trackId: newTrack.id } : c);
        useEditorStore.getState().commit({ ...p, tracks, clips });
      }
    } else {
      const lowerTrack = p.tracks.slice(currentIdx + 1).find((t) => t.kind === currentTrack.kind && !t.locked);
      if (lowerTrack) {
        props.onMoveClips([clip.id], 0, lowerTrack.id);
      } else {
        const newTrack = {
          id: "track-" + Math.random().toString(36).substring(2, 9),
          name: \`Video \${p.tracks.filter(t => t.kind === "video").length + 1}\`,
          kind: currentTrack.kind,
          muted: false,
          hidden: false,
          locked: false,
        };
        const tracks = [...p.tracks];
        tracks.splice(currentIdx + 1, 0, newTrack);
        const clips = p.clips.map((c) => c.id === clip.id ? { ...c, trackId: newTrack.id } : c);
        useEditorStore.getState().commit({ ...p, tracks, clips });
      }
    }
  };

  const moveClipToNewTrack = (clip: Clip) => {
    const p = useEditorStore.getState().project;
    const currentIdx = p.tracks.findIndex((t) => t.id === clip.trackId);
    if (currentIdx < 0) return;
    const currentTrack = p.tracks[currentIdx];
    const newTrack = {
      id: "track-" + Math.random().toString(36).substring(2, 9),
      name: \`Video \${p.tracks.filter(t => t.kind === "video").length + 1}\`,
      kind: currentTrack.kind,
      muted: false,
      hidden: false,
      locked: false,
    };
    const tracks = [...p.tracks];
    tracks.splice(currentIdx, 0, newTrack);
    const clips = p.clips.map((c) => c.id === clip.id ? { ...c, trackId: newTrack.id } : c);
    useEditorStore.getState().commit({ ...p, tracks, clips });
  };
`;

if (!timelineContent.includes('const moveClipVertically =')) {
  timelineContent = timelineContent.replace(
    '  const clips = project.clips.map(displayClip);',
    moveHelpers + '\n  const clips = project.clips.map(displayClip);'
  );
}

// Add Delete/Backspace key listener for selectedTransition
if (!timelineContent.includes('selectedTransition && (event.key === "Delete" || event.key === "Backspace")')) {
  timelineContent = timelineContent.replace(
    'if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(',
    `if (selectedTransition && (event.key === "Delete" || event.key === "Backspace")) {
                      event.preventDefault();
                      const trClip = project.clips.find(c => c.id === selectedTransition);
                      if (trClip) {
                        const trackClips = project.clips.filter(c => c.trackId === trClip.trackId).sort((a,b) => a.start - b.start);
                        const idx = trackClips.findIndex(c => c.id === trClip.id);
                        const prevClip = trackClips[idx - 1];
                        if (prevClip) {
                          const shift = prevClip.start + prevClip.duration - trClip.start;
                          const updatedClips = project.clips.map(c => {
                            if (c.id === trClip.id) return { ...c, fadeIn: 0, start: prevClip.start + prevClip.duration };
                            if (c.id === prevClip.id) return { ...c, fadeOut: 0 };
                            if (c.trackId === trClip.trackId && c.start > trClip.start) return { ...c, start: c.start + shift };
                            return c;
                          });
                          useEditorStore.getState().commit({ ...project, clips: updatedClips });
                          setSelectedTransition(null);
                        }
                      }
                      return;
                    }
                    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(`
  );
}

// Add right click menu items in clip context menu
const contextMenuTarget = `{
                              label: t("shortcuts.duplicate") || "Duplicate",
                              icon: <Copy size={14} />,
                              shortcut: "⌘D",
                              disabled: track.locked,
                              onClick: () => useEditorStore.getState().duplicate(),
                            },`;

const contextMenuNew = `{
                              label: t("shortcuts.duplicate") || "Duplicate",
                              icon: <Copy size={14} />,
                              shortcut: "⌘D",
                              disabled: track.locked,
                              onClick: () => useEditorStore.getState().duplicate(),
                            },
                            { divider: true, label: "", onClick: () => {} },
                            {
                              label: "Pindah ke Trek Video Atas",
                              icon: <ArrowUp size={14} />,
                              disabled: track.locked,
                              onClick: () => moveClipVertically(clip, "up"),
                            },
                            {
                              label: "Pindah ke Trek Video Bawah",
                              icon: <ArrowDown size={14} />,
                              disabled: track.locked,
                              onClick: () => moveClipVertically(clip, "down"),
                            },
                            {
                              label: "Pisahkan ke Trek Overlay Baru",
                              icon: <Layers size={14} />,
                              disabled: track.locked,
                              onClick: () => moveClipToNewTrack(clip),
                            },`;

if (timelineContent.includes(contextMenuTarget) && !timelineContent.includes('Pindah ke Trek Video Atas')) {
  timelineContent = timelineContent.replace(contextMenuTarget, contextMenuNew);
  console.log('Added vertical movement options to clip context menu');
}

// Add CapCut transition seam badges rendering inside track lane
const transitionBadgeJSX = `
                {/* CapCut-style Transition Seam Badges (Non-stacking) */}
                {clips
                  .filter((c) => c.trackId === track.id)
                  .map((clip, ci, trackClips) => {
                    const prev = trackClips[ci - 1];
                    const hasTransition =
                      prev &&
                      (clip.fadeIn > 0 || prev.fadeOut > 0) &&
                      clip.start <= prev.start + prev.duration + 0.01 &&
                      clip.start >= prev.start + prev.duration - 4;
                    if (!hasTransition) return null;
                    const transitionWidth = Math.max(26, Math.min(80, (prev.start + prev.duration - clip.start) * pps));
                    const seamTime = prev.start + prev.duration;
                    const transitionLeft = seamTime * pps - transitionWidth / 2;
                    const isSelected = selectedTransition === clip.id;
                    return (
                      <div
                        key={\`trans-\${prev.id}-\${clip.id}\`}
                        className={\`tl-transition-block \${isSelected ? "is-selected" : ""}\`}
                        style={{
                          left: transitionLeft,
                          width: transitionWidth,
                          top: 8 + (trackLayouts[index].lanes.get(clip.id) ?? 0) * 62,
                          height: 54,
                        }}
                        title={\`Transisi: \${(prev.start + prev.duration - clip.start).toFixed(2)}s · Klik untuk memilih, Tekan Del untuk menghapus\`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTransition(clip.id);
                          onSelect([clip.id]);
                        }}
                      >
                        <div className="tl-transition-center-seam" />
                        <span className="tl-transition-bowtie" aria-hidden="true">
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <polygon points="1,2 8,8 1,14" />
                            <polygon points="15,2 8,8 15,14" />
                          </svg>
                        </span>
                      </div>
                    );
                  })}
`;

const laneStartTarget = `{getTrackGaps(track.id).map((gap, gi) => {`;
if (timelineContent.includes(laneStartTarget) && !timelineContent.includes('CapCut-style Transition Seam Badges')) {
  timelineContent = timelineContent.replace(laneStartTarget, transitionBadgeJSX + '\n                ' + laneStartTarget);
  console.log('Added CapCut-style transition badges to timeline lanes');
}

fs.writeFileSync(timelinePath, timelineContent, 'utf8');

// 3. Update src/App.tsx for Studio layout mode
const appPath = path.join(root, 'src/App.tsx');
let appContent = fs.readFileSync(appPath, 'utf8');

if (!appContent.includes('studioPlayerWidth')) {
  // Add studioPlayerWidth state
  appContent = appContent.replace(
    'const [layoutMode, setLayoutMode] = useState<"studio" | "classic">',
    `const [studioPlayerWidth, setStudioPlayerWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("gocut-studio-player-width");
      if (saved) {
        const parsed = parseFloat(saved);
        if (Number.isFinite(parsed) && parsed >= 280 && parsed <= 900) return parsed;
      }
    } catch {}
    return Math.max(340, Math.min(500, Math.round(window.innerWidth * 0.32)));
  });
  const [layoutMode, setLayoutMode] = useState<"studio" | "classic">`
  );
}

fs.writeFileSync(appPath, appContent, 'utf8');
console.log('Patch complete!');
