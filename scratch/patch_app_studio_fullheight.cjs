const fs = require('fs');
const path = require('path');

const root = path.resolve('d:/PROJECT/GAWEAN/PROJECT/APP/rea-capcut');
const appPath = path.join(root, 'src/App.tsx');
let appContent = fs.readFileSync(appPath, 'utf8');

// Define modular JSX blocks
const startMark = '      <EditorWorkspace assistantOpen={assistantOpen} layoutMode={layoutMode}>';
const endMark = '      </div>\n      <footer className="app-status">';

const startIndex = appContent.indexOf(startMark);
const endIndex = appContent.indexOf(endMark);

if (startIndex === -1 || endIndex === -1) {
  console.error('Could not find start or end mark in App.tsx');
  process.exit(1);
}

// Extract the section
const before = appContent.substring(0, startIndex);
const after = appContent.substring(endIndex + '      </div>\n'.length);

const modularJSX = `      {/* Common Panels */}
      {(() => {
        const resourcePanelJSX = (
          <section className="resource-panel panel">
            <nav className="resource-tabs">
              {[
                ["media", Video, t("nav.media")],
                ["audio", Music2, t("nav.audio")],
                ["text", Type, t("nav.text")],
                ["stickers", Shapes, t("nav.stickers")],
                ["effects", WandSparkles, t("nav.effects")],
                ["transitions", Sparkles, t("nav.transitions")],
                ["subtitles", Subtitles, t("nav.subtitles")],
              ].map(([key, Icon, label]) => (
                <button
                  key={key as string}
                  className={tab === key ? "active" : ""}
                  onClick={() => setTab(key as string)}
                >
                  {typeof Icon !== "string" && <Icon size={19} />}
                  <span>{label as string}</span>
                </button>
              ))}
            </nav>
            <div className="resource-body">
              {tab === "stickers" && <AssetLibrary onAdd={addBuiltin} addingId={addingBuiltin} />}
              {(tab === "media" || tab === "audio") && (
                <MediaLibrary
                  project={
                    tab === "audio"
                      ? {
                          ...s.project,
                          assets: s.project.assets.filter(
                            (a) => a.kind === "audio",
                          ),
                        }
                      : s.project
                  }
                  onImport={(paths) => void safe(() => importMedia(paths))}
                  onPreviewAsset={(assetId) => { s.setPlaying(false); setSourceAssetId(assetId); }}
                  onAddAsset={(assetId) => { setSourceAssetId(null); s.addAssetClip(assetId); }}
                  onRemoveAsset={(assetId) =>
                    void safe(() => s.removeAsset(assetId))
                  }
                  importing={importing}
                  onImportFiles={(files) =>
                    void safe(async () => s.addAssets(await browserAssets(files)))
                  }
                  onRevealAsset={(assetId) =>
                    void safe(() => {
                      const asset = s.project.assets.find(
                        (a) => a.id === assetId,
                      );
                      if (asset?.missing) return relink(asset);
                      if (asset && window.editorAPI)
                        return window.editorAPI.revealPath(asset.path);
                    })
                  }
                />
              )}
              {tab === "text" && <TextLibrary onAdd={addStyledText} onBlank={s.addText} />}
              {tab === "subtitles" && <SubtitlePanel onSpeech={setSpeechMode} onImport={() => safe(readSubtitles)} onExport={() => safe(exportSubtitles)} />}
              {tab === "effects" && (
                <EffectsPanel
                  clip={active}
                  project={s.project}
                  kind={activeTrack?.kind}
                  locked={activeTrack?.locked}
                  onApply={(patch) => {
                    if (active) s.updateClip(active.id, patch);
                    else notify(t("notify.selectClipFirst"));
                  }}
                />
              )}
              {tab === "transitions" && <TransitionLibrary
                disabled={!active || !!active.text || activeTrack?.kind === "audio" || !!activeTrack?.locked}
                onApply={(transition,seconds)=>void safe(()=>applySceneTransition(transition,seconds))}
              />}
            </div>
          </section>
        );

        const inspectorPanelJSX = assistantOpen ? (
          <AssistantPanel onClose={() => setAssistantOpen(false)} />
        ) : (
          <Inspector
            project={s.project}
            clip={active}
            onUpdate={(patch) => active && s.updateClip(active.id, patch)}
            onProjectUpdate={s.updateProject}
          />
        );

        const playerPanelJSX = sourceAsset ? (
          <SourcePreview
            asset={sourceAsset}
            fps={s.project.fps}
            tracks={s.project.tracks.filter(t => t.kind === sourceAsset.kind || (sourceAsset.kind === "image" && t.kind === "video"))}
            onClose={() => setSourceAssetId(null)}
            onAddRange={(sourceIn, duration, mode, trackId) => void safe(() => {
              s.placeAsset(sourceAsset.id, trackId, { sourceIn, duration }, mode ?? "insert");
              setSourceAssetId(null);
            })}
          />
        ) : (
          <Player
            project={s.project}
            selectedIds={s.selectedIds}
            onSelect={s.select}
            onUpdateClip={s.updateClip}
            onSeek={s.seek}
            onPlayingChange={s.setPlaying}
          />
        );

        const timelinePaneJSX = (
          <div className="timeline-pane" style={{ height: timelineHeight }}>
            <div
              className="timeline-resize"
              role="separator"
              tabIndex={0}
              aria-label={t("timeline.resizeHeight")}
              aria-orientation="horizontal"
              aria-valuenow={Math.round(timelineHeight)}
              aria-valuemin={190}
              aria-valuemax={Math.max(190, window.innerHeight - 290)}
              title={t("timeline.resizeHeight")}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                  event.preventDefault();
                  resizeTimeline(
                    timelineHeight + (event.key === "ArrowUp" ? 20 : -20),
                  );
                }
              }}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                timelineResize.current = {
                  y: event.clientY,
                  height: timelineHeight,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const drag = timelineResize.current;
                if (drag) resizeTimeline(drag.height + drag.y - event.clientY);
              }}
              onPointerUp={(event) => {
                timelineResize.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                timelineResize.current = null;
              }}
            />
            <Timeline
              project={s.project}
              selectedIds={s.selectedIds}
              zoom={s.zoom}
              onSeek={(time) => { setSourceAssetId(null); s.seek(time); }}
              onSelect={(ids) => { setSourceAssetId(null); s.select(ids); }}
              onClipUpdate={s.updateClip}
              onMoveClips={s.moveClips}
              onTrim={s.trim}
              onSplit={s.split}
              onDelete={() => void safe(s.deleteSelected)}
              onZoom={s.setZoom}
              onTrackUpdate={s.updateTrack}
              onTrackDelete={s.deleteTrack}
              onTrackMove={s.reorderTrack}
              onAddTrack={s.addTrack}
              onDropAsset={(assetId, time, trackId) => {
                setSourceAssetId(null); s.addAssetClip(assetId, time, trackId);
              }}
              snapping={s.snapping}
              onSnappingChange={s.setSnapping}
              magnetic={s.magnetic}
              onMagneticChange={s.setMagnetic}
              onDuplicate={s.duplicate}
              onAddText={s.addText}
              onUndo={s.undo}
              onRedo={s.redo}
              canUndo={pastLength > 0}
              canRedo={futureLength > 0}
            />
          </div>
        );

        if (layoutMode === "studio") {
          return (
            <div className="studio-main-container">
              <div className="studio-left-column">
                <div className="studio-top-workspace" style={{ height: \`calc(100% - \${timelineHeight}px)\` }}>
                  {resourcePanelJSX}
                  {inspectorPanelJSX}
                </div>
                {timelinePaneJSX}
              </div>

              <div
                className="studio-vertical-splitter"
                role="separator"
                tabIndex={0}
                aria-orientation="vertical"
                aria-label="Resize Player Preview"
                title="Tarik untuk mengubah ukuran preview vertikal"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  const startX = e.clientX;
                  const startWidth = studioPlayerWidth;
                  const onMove = (ev: PointerEvent) => {
                    const delta = startX - ev.clientX;
                    const newW = Math.max(280, Math.min(window.innerWidth - 450, startWidth + delta));
                    setStudioPlayerWidth(newW);
                    try { localStorage.setItem("gocut-studio-player-width", String(newW)); } catch {}
                  };
                  const onUp = () => {
                    window.removeEventListener("pointermove", onMove);
                    window.removeEventListener("pointerup", onUp);
                  };
                  window.addEventListener("pointermove", onMove);
                  window.addEventListener("pointerup", onUp);
                }}
              />

              <div className="studio-right-column" style={{ width: studioPlayerWidth }}>
                {playerPanelJSX}
              </div>
            </div>
          );
        }

        return (
          <>
            <EditorWorkspace assistantOpen={assistantOpen} layoutMode="classic">
              {resourcePanelJSX}
              {playerPanelJSX}
              {inspectorPanelJSX}
            </EditorWorkspace>
            {timelinePaneJSX}
          </>
        );
      })()}
`;

appContent = before + modularJSX + after;
fs.writeFileSync(appPath, appContent, 'utf8');
console.log('Successfully updated App.tsx with full-height Studio layout!');
