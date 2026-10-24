# Timeline Overhaul & Advanced Editing System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the ReaCut timeline and editor with high-productivity tools: full-height playhead scrubbing, playhead-centric zoom, Razor tool (`C`), Quick Ripple Trim (`Q`/`W`), magnetic gap closure, audio waveform rendering, real-time Player visual effects (Chroma/Mask/Crop), drag-and-drop transitions, right-click context menu, Solid Color clips, Compound Clips, iPhone MOV auto-rotation & smart proxies, and robust multi-layer overlay tracks.

**Architecture:** 
1. **Frontend Timeline & Editor (React + Zustand + TypeScript):** Enhance `Timeline.tsx` with dedicated hit-boxes, tool states (`select` vs `razor`), keyboard shortcuts, playhead-centered zoom maths, and context menus. Wire `imagePreviewLayer` into `Player.tsx` for real-time visual composite rendering.
2. **Core Domain & Model (`src/core/`):** Extend `model.ts`, `timelineEdits.ts`, and `types.ts` with Compound Clip nesting/unnesting, Solid Color generator, and ripple duration calculations for speed changes.
3. **Backend Media Engine (Go + FFmpeg + FFprobe):** Upgrade `pkg/ffmpeg/process.go` to parse QuickTime rotation metadata, extract audio peak waveforms for timeline canvas rendering, and provide smart proxy generation for HEVC/ProRes iPhone MOV files.

**Tech Stack:** Go 1.23+, Wails v2, React 19, TypeScript, Vitest, HTML5 Canvas 2D / WebGL, FFmpeg & FFprobe.

**Spec:** User requirements agreed across 5 rounds of the Grilling interview (see [conversation history](file:///d:/PROJECT/GAWEAN/PROJECT/APP/rea-capcut/bugraph/export-failure/bugraph-20261024.html)).

## Global Constraints
- Desktop offline-first app: no external network calls or telemetry.
- Zero text-selection bleed: `user-select: none` globally, except editable text inputs.
- Non-destructive media editing: raw source files (including iPhone MOVs) are never modified or degraded.
- High performance: 60 FPS timeline scrubbing and zoom; canvas waveforms must render with zero stutter.
- All existing 192 tests must remain green; new features backed by regression tests.

## Review Focus
1. Playhead drag at extreme timeline scales (5 pps vs 400 pps) does not drift or jump.
2. Speed slider changes at 0.1x to 8x with Magnet ON do not cause clip collision or negative durations.
3. iPhone MOV vertical videos with 90° rotation do not appear sideways or distorted in preview or export.
4. Dragging clips above the highest track gracefully spawns a new overlay track without index errors.
5. Unnesting a compound clip restores original track items without ID collisions.

---

### Task 1: Global App Styling & Text Selection Hygiene

**Files:**
- Modify: `src/styles.css`
- Modify: `src/components/Timeline.css`
- Test: `tests/visual-ui.test.ts`

**Interfaces:**
- Produces: Global desktop app styling with `user-select: none`, allowing text selection only in `input`, `textarea`, and `.selectable`.

- [ ] **Step 1: Write test for user-select rule and selectable elements**
- [ ] **Step 2: Run test to verify current state**
- [ ] **Step 3: Add global `user-select: none` to `src/styles.css` and ensure input fields remain selectable**
- [ ] **Step 4: Verify test passes and CSS compiles cleanly**

---

### Task 2: Playhead Scrubbing Overhaul & Playhead-Centric Zoom

**Files:**
- Modify: `src/components/Timeline.tsx`
- Modify: `src/components/Timeline.css`
- Test: `tests/timeline.test.ts`

**Interfaces:**
- Consumes: `onSeek`, `playhead`, `zoom`, `pps`.
- Produces: 
  - Full-height hit-box (`--tl-playhead-hitbox`) spanning entire timeline height.
  - Single click in empty lane = instant seek; click-and-drag > 5px = marquee selection.
  - Zoom centered on playhead: scroll position adjusts so playhead retains visual percentage in viewport.

- [ ] **Step 1: Write unit test for playhead-centered zoom calculation in `tests/timeline.test.ts`**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement playhead-centered zoom in `Timeline.tsx` on wheel and zoom slider**
- [ ] **Step 4: Add vertical hit-box overlay to `tl-playhead` and adjust lane pointer down handler for instant seek**
- [ ] **Step 5: Run tests and verify smooth scrubbing**

---

### Task 3: Razor Tool (`C`), Selection Tool (`V`), and Quick Ripple Trim (`Q`/`W`)

**Files:**
- Modify: `src/components/Timeline.tsx`
- Modify: `src/components/Timeline.css`
- Modify: `src/core/timelineEdits.ts`
- Test: `tests/timeline-edits.test.ts`

**Interfaces:**
- Produces: 
  - `activeTool: "select" | "razor"` state.
  - `rippleTrim(project, clipId, "start" | "end", playhead)` in `timelineEdits.ts`.
  - Keyboard shortcuts: `C` (Razor), `V` (Select), `Q` (Ripple Trim Start), `W` (Ripple Trim End).

- [ ] **Step 1: Write unit test for `rippleTrim` in `tests/timeline-edits.test.ts`**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `rippleTrim` in `src/core/timelineEdits.ts`**
- [ ] **Step 4: Wire Razor Tool toggle (`C`), cursor visual, and `Q`/`W` shortcuts in `Timeline.tsx`**
- [ ] **Step 5: Run tests to verify passing status**

---

### Task 4: Auto-Snapping, Magnetic Timeline & Clickable Gap Closure

**Files:**
- Modify: `src/components/Timeline.tsx`
- Modify: `src/core/timelineEdits.ts`
- Test: `tests/timeline.test.ts`

**Interfaces:**
- Consumes: `snapping`, `magnetic`.
- Produces: 
  - Two-way snapping (playhead-to-clip and clip-to-playhead/adjacent clips) with visual guide line.
  - Selected gap state: clicking empty space between two clips highlights the gap; `Del` or `Backspace` calls `closeGap`.
  - Auto gap closure on clip delete/trim when `magnetic` is true.

- [ ] **Step 1: Write tests for `closeGap` and magnetic deletion in `tests/timeline-edits.test.ts`**
- [ ] **Step 2: Implement `closeGap` in `timelineEdits.ts`**
- [ ] **Step 3: Implement clickable gap elements in `Timeline.tsx` with Delete key listener**
- [ ] **Step 4: Enhance two-way snap calculations and snap line visualization**
- [ ] **Step 5: Run tests to verify all pass**

---

### Task 5: Speed Slider & Proportional Timeline Clip Scaling

**Files:**
- Modify: `src/components/Inspector.tsx`
- Modify: `src/core/timelineEdits.ts`
- Test: `tests/timeline-edits.test.ts`

**Interfaces:**
- Produces: 
  - `setClipSpeed(project, clipId, newSpeed, ripple)` function that updates `clip.speed` and scales `clip.duration = (assetDuration - clip.sourceIn) / newSpeed` or `originalDuration / speedDelta`.
  - Speed tab UI in `Inspector.tsx` with range slider, presets (0.25x, 0.5x, 1x, 2x, 4x), and live timeline sync.

- [ ] **Step 1: Write unit test for `setClipSpeed` with duration recalculation and magnetic ripple**
- [ ] **Step 2: Implement `setClipSpeed` in `src/core/timelineEdits.ts`**
- [ ] **Step 3: Connect `Inspector.tsx` Speed tab to `setClipSpeed`**
- [ ] **Step 4: Verify test passes and clip visibly resizes on timeline**

---

### Task 6: Real-time Player Visual Tools (Crop, Chroma Key, Mask)

**Files:**
- Modify: `src/components/Player.tsx`
- Modify: `src/editor/previewLayers.ts`
- Test: `tests/visual-ui.test.ts`

**Interfaces:**
- Consumes: `imagePreviewLayer` from `previewLayers.ts`.
- Produces: Real-time live composite preview in `Player.tsx` where Crop, Chroma Key, and Mask are rendered directly onto the playback canvas.

- [ ] **Step 1: Write unit test in `tests/visual-ui.test.ts` asserting Player applies `imagePreviewLayer` when visual effects are active**
- [ ] **Step 2: Wire `imagePreviewLayer` into `renderFrame` in `src/components/Player.tsx`**
- [ ] **Step 3: Verify green screen removal, shape masks, and crop rectangles render at 60 FPS**
- [ ] **Step 4: Run tests to verify compliance**

---

### Task 7: Drag & Drop Transitions to Timeline Cuts

**Files:**
- Modify: `src/components/CreativeLibrary.tsx`
- Modify: `src/components/Timeline.tsx`
- Modify: `src/components/Timeline.css`
- Test: `tests/creativePresets.test.ts`

**Interfaces:**
- Produces: 
  - Drag type `application/x-reacut-transition` with transition ID payload.
  - Seam drop zones between adjacent clips on video tracks.
  - Drops trigger `applyTransition` with default 0.5s duration.

- [ ] **Step 1: Add drag start handlers to transition cards in `CreativeLibrary.tsx`**
- [ ] **Step 2: Add drop target detection between adjacent video clips in `Timeline.tsx`**
- [ ] **Step 3: Connect drop action to `applyTransition` and dispatch notification**
- [ ] **Step 4: Verify test passes**

---

### Task 8: Timeline Right-Click Context Menu

**Files:**
- Create: `src/components/TimelineContextMenu.tsx`
- Modify: `src/components/Timeline.tsx`
- Modify: `src/components/Timeline.css`
- Test: `tests/timeline.test.ts`

**Interfaces:**
- Produces: Native-styled dark-mode right-click context menu for clips (Split, Delete, Ripple Delete, Copy, Duplicate, Speed, Mute, Create Compound Clip) and timeline background (Paste, Close Gap, Add Solid Color).

- [ ] **Step 1: Create `TimelineContextMenu.tsx` with keyboard focus and dismiss handlers**
- [ ] **Step 2: Integrate `onContextMenu` on clips and lanes in `Timeline.tsx`**
- [ ] **Step 3: Hook actions to store/editor dispatchers**
- [ ] **Step 4: Verify with unit test**

---

### Task 9: Solid Color / Color Matte Feature

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/model.ts`
- Modify: `src/components/MediaLibrary.tsx`
- Modify: `src/components/Inspector.tsx`
- Modify: `app.go`
- Test: `tests/model.test.ts`
- Test: `app_export_test.go`

**Interfaces:**
- Produces:
  - Solid Color virtual asset generator with customizable hex color.
  - Modal color picker & presets (Black, White, Green Screen) in Media Library and Context Menu.
  - FFmpeg color filter (`color=c=...`) or SVG data URI support during playback and export.

- [ ] **Step 1: Write test for creating and exporting solid color clips**
- [ ] **Step 2: Implement Solid Color asset generation in `model.ts` and `MediaLibrary.tsx`**
- [ ] **Step 3: Support color editing in `Inspector.tsx` under Video tab**
- [ ] **Step 4: Verify export and playback tests pass**

---

### Task 10: Compound Clip (Nest & Unnest)

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/timelineEdits.ts`
- Modify: `src/components/Timeline.tsx`
- Test: `tests/timeline-edits.test.ts`

**Interfaces:**
- Produces:
  - `createCompoundClip(project, clipIds: string[]): Project`
  - `ungroupCompoundClip(project, compoundClipId: string): Project`
  - Visual badge on timeline: "Compound Clip".

- [ ] **Step 1: Write unit tests for `createCompoundClip` and `ungroupCompoundClip`**
- [ ] **Step 2: Implement compound clip data structure and unnesting in `timelineEdits.ts`**
- [ ] **Step 3: Add context menu actions "Create Compound Clip" and "Ungroup Compound Clip"**
- [ ] **Step 4: Run tests to verify round-trip integrity**

---

### Task 11: Apple iPhone MOV Support (Rotation, Smart Proxy & Probe)

**Files:**
- Modify: `pkg/ffmpeg/process.go`
- Modify: `pkg/media/server.go`
- Modify: `app.go`
- Test: `pkg/media/resolver_test.go`
- Test: `app_export_test.go`

**Interfaces:**
- Produces:
  - FFprobe QuickTime rotation metadata parsing (`rotate 90/270` -> swap width/height).
  - Background H.264 proxy transcode for HEVC/ProRes MOV in `.reacut/cache/proxies/`.
  - Media stream serves proxy for smooth playback while export uses original high-res MOV.

- [ ] **Step 1: Write test for probe rotation extraction in Go**
- [ ] **Step 2: Implement QuickTime rotation tag & displaymatrix parsing in `process.go`**
- [ ] **Step 3: Implement smart proxy check in `app.go` and `server.go`**
- [ ] **Step 4: Run tests to confirm zero black screens and correct aspect ratio**

---

### Task 12: Robust Overlay & Infinite Vertical Layer System

**Files:**
- Modify: `src/components/Timeline.tsx`
- Modify: `src/editor/previewLayers.ts`
- Modify: `app.go`
- Test: `tests/timeline.test.ts`
- Test: `app_export_test.go`

**Interfaces:**
- Produces:
  - Dragging clips or assets above the top track dynamically creates a new `Video Track` at the top.
  - Strict visual stacking: top tracks render over bottom tracks in Player and FFmpeg export.

- [ ] **Step 1: Write test for auto-creating video track when dragging above top track**
- [ ] **Step 2: Implement top-boundary drop zone and track creation in `Timeline.tsx`**
- [ ] **Step 3: Ensure top-to-bottom composite order in `previewLayers.ts` and `app.go`**
- [ ] **Step 4: Run complete suite: `npm run check` and `go test ./...`**
