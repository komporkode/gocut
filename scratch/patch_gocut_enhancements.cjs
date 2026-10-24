const fs = require('fs');
const path = require('path');

const root = path.resolve('d:/PROJECT/GAWEAN/PROJECT/APP/rea-capcut');

// 1. Update src/styles.css
const stylesPath = path.join(root, 'src/styles.css');
let stylesContent = fs.readFileSync(stylesPath, 'utf8');

const layoutStudioStyles = `
/* Layout modes: studio (CapCut desktop vertical) and classic */
.editor-workspace.layout-studio {
  display: grid;
  grid-template-columns: 320px minmax(320px, 1fr) minmax(360px, 480px);
}
.editor-workspace.layout-classic {
  display: grid;
  grid-template-columns: 320px minmax(360px, 1fr) 320px;
}

/* Aspect ratio quick selector */
.player-ratio-picker {
  display: inline-flex;
  align-items: center;
  margin-right: 4px;
}
.player-ratio-picker select {
  background: #1e1e1e;
  color: #cfd3dc;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  font-size: 11px;
  padding: 2px 6px;
  height: 24px;
  cursor: pointer;
  outline: none;
  font-weight: 500;
}
.player-ratio-picker select:hover {
  border-color: var(--accent);
  color: #fff;
}
`;

if (!stylesContent.includes('.editor-workspace.layout-studio')) {
  stylesContent += '\n' + layoutStudioStyles;
  fs.writeFileSync(stylesPath, stylesContent, 'utf8');
  console.log('Updated src/styles.css');
}

// 2. Update src/components/Player.tsx
const playerPath = path.join(root, 'src/components/Player.tsx');
let playerContent = fs.readFileSync(playerPath, 'utf8');

if (!playerContent.includes('player-ratio-picker')) {
  // Add updateProject hook call
  playerContent = playerContent.replace(
    'const storePlaying = useEditorStore((s) => s.playing);',
    'const storePlaying = useEditorStore((s) => s.playing);\n  const updateProject = useEditorStore((s) => s.updateProject);'
  );

  // Add ratio picker before volume button
  const targetTools = '<div className="player-tools">';
  const ratioPickerJSX = `<div className="player-tools">
          <div className="player-ratio-picker">
            <select
              aria-label="Aspect Ratio"
              value={
                project.width === 1080 && project.height === 1920 ? "9:16" :
                project.width === 1920 && project.height === 1080 ? "16:9" :
                project.width === 1080 && project.height === 1080 ? "1:1" :
                project.width === 1440 && project.height === 1080 ? "4:3" :
                project.width === 1080 && project.height === 1440 ? "3:4" : "custom"
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === "9:16") updateProject({ width: 1080, height: 1920 });
                else if (v === "16:9") updateProject({ width: 1920, height: 1080 });
                else if (v === "1:1") updateProject({ width: 1080, height: 1080 });
                else if (v === "4:3") updateProject({ width: 1440, height: 1080 });
                else if (v === "3:4") updateProject({ width: 1080, height: 1440 });
              }}
            >
              <option value="9:16">9:16</option>
              <option value="16:9">16:9</option>
              <option value="1:1">1:1</option>
              <option value="4:3">4:3</option>
              <option value="3:4">3:4</option>
              {!(
                (project.width === 1080 && project.height === 1920) ||
                (project.width === 1920 && project.height === 1080) ||
                (project.width === 1080 && project.height === 1080) ||
                (project.width === 1440 && project.height === 1080) ||
                (project.width === 1080 && project.height === 1440)
              ) && (
                <option value="custom">{project.width}:{project.height}</option>
              )}
            </select>
          </div>`;

  playerContent = playerContent.replace(targetTools, ratioPickerJSX);
  fs.writeFileSync(playerPath, playerContent, 'utf8');
  console.log('Updated src/components/Player.tsx');
}

// 3. Update src/components/Timeline.tsx
const timelinePath = path.join(root, 'src/components/Timeline.tsx');
let timelineContent = fs.readFileSync(timelinePath, 'utf8');

if (!timelineContent.includes('const visibleTracks =')) {
  // Add draggedKind state
  timelineContent = timelineContent.replace(
    'const [viewportWidth, setViewportWidth] = useState(800);',
    'const [viewportWidth, setViewportWidth] = useState(800);\n  const [draggedKind, setDraggedKind] = useState<TrackKind | null>(null);'
  );

  // Add visibleTracks logic right before clips definition
  const targetClipsDef = '  const clips = project.clips.map(displayClip);';
  const visibleTracksCode = `  // Dynamic tracks: Hide empty placeholder tracks unless they have clips, are targeted, or matching media is dragged
  const primaryVideoTrack = project.tracks.find((t) => t.kind === "video") ?? project.tracks[0];
  const visibleTracks = project.tracks.filter((track) => {
    if (track.id === primaryVideoTrack?.id) return true;
    if (project.clips.some((c) => c.trackId === track.id)) return true;
    if (dropTarget?.trackId === track.id) return true;
    if (trackActions?.id === track.id) return true;
    if (gesture?.kind === "move" && gesture.targetTrackId === track.id) return true;
    if (draggedKind && (track.kind === draggedKind || (draggedKind === "image" && track.kind === "video"))) return true;
    return false;
  });

  const clips = project.clips.map(displayClip);`;

  timelineContent = timelineContent.replace(targetClipsDef, visibleTracksCode);

  // Replace trackLayouts mapping from project.tracks to visibleTracks
  timelineContent = timelineContent.replace(
    'const trackLayouts = project.tracks.map((track) => {',
    'const trackLayouts = visibleTracks.map((track) => {'
  );

  // Replace targetTrack
  const targetTrackOld = `  const targetTrack = (clientY: number) => {
    const y = locate(0, clientY).y;
    const index = trackLayouts.findIndex(
      (layout) => y < layout.top + layout.height,
    );
    return project.tracks[index < 0 ? project.tracks.length - 1 : index];
  };`;

  const targetTrackNew = `  const targetTrack = (clientY: number) => {
    const y = locate(0, clientY).y;
    const index = trackLayouts.findIndex(
      (layout) => y < layout.top + layout.height,
    );
    return visibleTracks[index < 0 ? visibleTracks.length - 1 : index];
  };`;

  timelineContent = timelineContent.replace(targetTrackOld, targetTrackNew);

  // Replace marquee row finding
  timelineContent = timelineContent.replace(
    'const row = project.tracks.findIndex((t) => t.id === c.trackId);',
    'const row = visibleTracks.findIndex((t) => t.id === c.trackId);'
  );

  // Replace JSX rendering project.tracks.map with visibleTracks.map
  timelineContent = timelineContent.replace(
    '{project.tracks.map((track, index) => (',
    '{visibleTracks.map((track, index) => ('
  );

  // Replace disabled bounds on moveTrackUp and moveTrackDown
  timelineContent = timelineContent.replace(
    'disabled={index <= 0 || track.locked || project.tracks[index - 1]?.locked}',
    'disabled={index <= 0 || track.locked || visibleTracks[index - 1]?.locked}'
  );
  timelineContent = timelineContent.replace(
    'disabled={index >= project.tracks.length - 1 || track.locked || project.tracks[index + 1]?.locked}',
    'disabled={index >= visibleTracks.length - 1 || track.locked || visibleTracks[index + 1]?.locked}'
  );

  // Add drag listeners to tl-content
  timelineContent = timelineContent.replace(
    'style={{\n            width: bodyWidth + GUTTER,\n            minWidth: "100%",\n            minHeight: "100%",\n          }}',
    `style={{
            width: bodyWidth + GUTTER,
            minWidth: "100%",
            minHeight: "100%",
          }}
          onDragOver={(e) => {
            const kind = (["audio", "video", "image", "text"] as const).find((k) =>
              e.dataTransfer.types.includes(\`application/x-reacut-kind-\${k}\`)
            );
            if (kind && kind !== draggedKind) {
              setDraggedKind(kind);
            }
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setDraggedKind(null);
            }
          }}
          onDropCapture={() => setDraggedKind(null)}`
  );

  fs.writeFileSync(timelinePath, timelineContent, 'utf8');
  console.log('Updated src/components/Timeline.tsx');
}

// 4. Update src/App.tsx
const appPath = path.join(root, 'src/App.tsx');
let appContent = fs.readFileSync(appPath, 'utf8');

if (!appContent.includes('layoutMode')) {
  // Import Columns3 and captureVideoFrame
  if (!appContent.includes('Columns3')) {
    appContent = appContent.replace(
      'import {',
      'import { Columns3,'
    );
  }
  if (!appContent.includes('captureVideoFrame')) {
    appContent = appContent.replace(
      'import EditorWorkspace from "./components/EditorWorkspace";',
      'import EditorWorkspace from "./components/EditorWorkspace";\nimport { captureVideoFrame } from "./core/mediaThumbnail";'
    );
  }

  // Add layoutMode state
  appContent = appContent.replace(
    'const [assistantOpen, setAssistantOpen] = useState(false);',
    `const [assistantOpen, setAssistantOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<"studio" | "classic">(() => {
    try {
      return (localStorage.getItem("gocut-layout-mode") as "studio" | "classic") || "studio";
    } catch {
      return "studio";
    }
  });`
  );

  // Add titlebar button for layout switcher
  const titlebarActionsTarget = '<div className="titlebar-actions">';
  const titlebarActionsNew = `<div className="titlebar-actions">
          <button
            title={layoutMode === "studio" ? "Tata Letak: Studio (Vertikal)" : "Tata Letak: Klasik"}
            aria-label="Ganti Tata Letak"
            className={layoutMode === "studio" ? "active" : ""}
            onClick={() => {
              const next = layoutMode === "studio" ? "classic" : "studio";
              setLayoutMode(next);
              try { localStorage.setItem("gocut-layout-mode", next); } catch {}
            }}
          >
            <Columns3 size={15} />
            <span>{layoutMode === "studio" ? "Studio" : "Klasik"}</span>
          </button>`;
  appContent = appContent.replace(titlebarActionsTarget, titlebarActionsNew);

  // Update browserAssets to capture video thumbnail
  appContent = appContent.replace(
    `      const video = element instanceof HTMLVideoElement ? element : null;
      results.push({
        id: id(),
        name: file.name,
        path: diskPath,
        url: diskPath !== file.name ? toMediaStreamUrl(diskPath) : url,
        kind,
        duration: element.duration,
        width: video?.videoWidth ?? 0,
        height: video?.videoHeight ?? 0,
        fps: 30,`,
    `      const video = element instanceof HTMLVideoElement ? element : null;
      let thumb: string | undefined;
      if (kind === "video") {
        try {
          const cap = await captureVideoFrame(url, 0.1);
          if (cap) thumb = cap;
        } catch {}
      }
      results.push({
        id: id(),
        name: file.name,
        path: diskPath,
        url: diskPath !== file.name ? toMediaStreamUrl(diskPath) : url,
        kind,
        duration: element.duration,
        width: video?.videoWidth ?? 0,
        height: video?.videoHeight ?? 0,
        fps: 30,
        thumbnail: thumb,`
  );

  // Background thumbnail capture effect in App
  const appEffectTarget = '  const active = s.project.clips.find((c) => c.id === s.selectedIds[0]);';
  const appEffectCode = `  // Automatically generate video thumbnails for assets in background
  useEffect(() => {
    const videoAssetsWithoutThumb = s.project.assets.filter(
      (a) => a.kind === "video" && !a.thumbnail && !a.missing && a.url
    );
    if (!videoAssetsWithoutThumb.length) return;
    let cancelled = false;
    for (const asset of videoAssetsWithoutThumb) {
      void (async () => {
        try {
          const thumb = await captureVideoFrame(asset.url, 0.1);
          if (!cancelled && thumb) {
            useEditorStore.getState().updateAsset(asset.id, { thumbnail: thumb });
          }
        } catch {}
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [s.project.assets]);

  const active = s.project.clips.find((c) => c.id === s.selectedIds[0]);`;

  appContent = appContent.replace(appEffectTarget, appEffectCode);

  // Update EditorWorkspace panels ordering
  const workspaceTarget = `      <EditorWorkspace assistantOpen={assistantOpen}>
        <section className="resource-panel panel">`;
  const workspaceNew = `      <EditorWorkspace assistantOpen={assistantOpen} layoutMode={layoutMode}>
        <section className="resource-panel panel">`;
  appContent = appContent.replace(workspaceTarget, workspaceNew);

  // Replace inside EditorWorkspace
  const oldPanels = `        {sourceAsset ? <SourcePreview
          asset={sourceAsset}
          fps={s.project.fps}
          tracks={s.project.tracks.filter(t => t.kind === sourceAsset.kind || (sourceAsset.kind === "image" && t.kind === "video"))}
          onClose={() => setSourceAssetId(null)}
          onAddRange={(sourceIn, duration, mode, trackId) => void safe(() => {
            s.placeAsset(sourceAsset.id, trackId, { sourceIn, duration }, mode ?? "insert");
            setSourceAssetId(null);
          })}
        /> : <Player
          project={s.project}
          selectedIds={s.selectedIds}
          onSelect={s.select}
          onUpdateClip={s.updateClip}
          onSeek={s.seek}
          onPlayingChange={s.setPlaying}
        />}
        {assistantOpen ? <AssistantPanel onClose={() => setAssistantOpen(false)} /> : <Inspector
          project={s.project}
          clip={active}
          onUpdate={(patch) => active && s.updateClip(active.id, patch)}
          onProjectUpdate={s.updateProject}
        />}`;

  const newPanels = `        {layoutMode === "studio" ? (
          <>
            {assistantOpen ? <AssistantPanel onClose={() => setAssistantOpen(false)} /> : <Inspector
              project={s.project}
              clip={active}
              onUpdate={(patch) => active && s.updateClip(active.id, patch)}
              onProjectUpdate={s.updateProject}
            />}
            {sourceAsset ? <SourcePreview
              asset={sourceAsset}
              fps={s.project.fps}
              tracks={s.project.tracks.filter(t => t.kind === sourceAsset.kind || (sourceAsset.kind === "image" && t.kind === "video"))}
              onClose={() => setSourceAssetId(null)}
              onAddRange={(sourceIn, duration, mode, trackId) => void safe(() => {
                s.placeAsset(sourceAsset.id, trackId, { sourceIn, duration }, mode ?? "insert");
                setSourceAssetId(null);
              })}
            /> : <Player
              project={s.project}
              selectedIds={s.selectedIds}
              onSelect={s.select}
              onUpdateClip={s.updateClip}
              onSeek={s.seek}
              onPlayingChange={s.setPlaying}
            />}
          </>
        ) : (
          <>
            {sourceAsset ? <SourcePreview
              asset={sourceAsset}
              fps={s.project.fps}
              tracks={s.project.tracks.filter(t => t.kind === sourceAsset.kind || (sourceAsset.kind === "image" && t.kind === "video"))}
              onClose={() => setSourceAssetId(null)}
              onAddRange={(sourceIn, duration, mode, trackId) => void safe(() => {
                s.placeAsset(sourceAsset.id, trackId, { sourceIn, duration }, mode ?? "insert");
                setSourceAssetId(null);
              })}
            /> : <Player
              project={s.project}
              selectedIds={s.selectedIds}
              onSelect={s.select}
              onUpdateClip={s.updateClip}
              onSeek={s.seek}
              onPlayingChange={s.setPlaying}
            />}
            {assistantOpen ? <AssistantPanel onClose={() => setAssistantOpen(false)} /> : <Inspector
              project={s.project}
              clip={active}
              onUpdate={(patch) => active && s.updateClip(active.id, patch)}
              onProjectUpdate={s.updateProject}
            />}
          </>
        )}`;

  appContent = appContent.replace(oldPanels, newPanels);

  fs.writeFileSync(appPath, appContent, 'utf8');
  console.log('Updated src/App.tsx');
}

// 5. Update src/components/MediaLibrary.tsx & MediaLibrary.css
const mediaLibPath = path.join(root, 'src/components/MediaLibrary.tsx');
let mediaLibContent = fs.readFileSync(mediaLibPath, 'utf8');

if (!mediaLibContent.includes('media-used-badge')) {
  mediaLibContent = mediaLibContent.replace(
    `          <span className="media-kind">
            <KindIcon kind={asset.kind} />
          </span>
          <span className="media-time">
            {asset.kind === "image"
              ? t("media.filterImage")
              : formatMediaDuration(asset.duration)}
          </span>
          {inTimeline && (
            <span className="media-used" title={t("media.usedInTimeline")}>
              <Check size={10} />
            </span>
          )}`,
    `          {inTimeline ? (
            <span className="media-used media-used-badge" title={t("media.usedInTimeline")}>
              <Check size={10} />
              <span>{t("common.added") || "Added"}</span>
            </span>
          ) : (
            <span className="media-kind">
              <KindIcon kind={asset.kind} />
            </span>
          )}
          <span className="media-time">
            {asset.kind === "image"
              ? t("media.filterImage")
              : formatMediaDuration(asset.duration)}
          </span>`
  );
  fs.writeFileSync(mediaLibPath, mediaLibContent, 'utf8');
  console.log('Updated src/components/MediaLibrary.tsx');
}

const mediaLibCssPath = path.join(root, 'src/components/MediaLibrary.css');
let mediaLibCss = fs.readFileSync(mediaLibCssPath, 'utf8');
if (!mediaLibCss.includes('.media-used-badge')) {
  mediaLibCss += `
.media-used-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  bottom: auto;
  background: var(--accent) !important;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: #fff !important;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 600;
  z-index: 3;
}
`;
  fs.writeFileSync(mediaLibCssPath, mediaLibCss, 'utf8');
  console.log('Updated src/components/MediaLibrary.css');
}

// 6. Update Timeline.css filmstrip opacity
const timelineCssPath = path.join(root, 'src/components/Timeline.css');
let timelineCss = fs.readFileSync(timelineCssPath, 'utf8');
if (timelineCss.includes('opacity: 0.65;')) {
  timelineCss = timelineCss.replace('opacity: 0.65;', 'opacity: 0.88;');
  fs.writeFileSync(timelineCssPath, timelineCss, 'utf8');
  console.log('Updated src/components/Timeline.css filmstrip opacity');
}

console.log('Patch complete!');
