<p align="center">
  <img src="public/icons/gocut.png" width="96" height="96" alt="GoCut icon" />
</p>
<h1 align="center">GoCut</h1>
<p align="center">
  <strong>Fast, ultra-lightweight, offline desktop video editor powered by Go, Wails v2, and React.</strong><br />
  A modernized, high-performance evolution forked from <a href="https://github.com/Xiangyu-CAS/rea-capcut">ReaCut</a>.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v0.7.0-blue?style=flat-square" alt="Version: v0.7.0-beta" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-45d6c0?style=flat-square" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/backend-Go_1.23+_·_Wails_v2-00ADD8?style=flat-square" alt="Backend: Go & Wails" />
  <img src="https://img.shields.io/badge/frontend-React_19_·_TypeScript_·_Vite-61DAFB?style=flat-square" alt="Frontend: React & Vite" />
  <img src="https://img.shields.io/badge/platform-Windows_|_macOS_|_Linux-purple?style=flat-square" alt="Platform: Cross-platform" />
  <img src="https://img.shields.io/badge/status-active_beta-orange?style=flat-square" alt="Status: Active Beta" />
</p>

<p align="center">
  <a href="#about-gocut">About GoCut</a> · 
  <a href="#what-changed-from-reacut">What Changed from ReaCut</a> · 
  <a href="#-why-go-instead-of-rust-the-practical-rationale">Why Go over Rust?</a> · 
  <a href="#key-features">Key Features</a> · 
  <a href="#keyboard-shortcuts">Shortcuts</a> · 
  <a href="#getting-started">Getting Started</a> · 
  <a href="#testing--quality-assurance">Testing</a> · 
  <a href="#license--acknowledgments">License</a>
</p>

---

## About GoCut

**GoCut** is an open-source, completely offline desktop non-linear video editor (NLE). It provides a full-featured creative editing suite multi-track timeline, keyframing, color grading, visual effects, subtitle workflows, and video export without requiring user accounts, internet access, or cloud services.

GoCut is built on a lean native architecture: **Go + Wails v2** replaces heavy browser container frameworks, providing instant startup, minimal memory consumption, and native streaming performance.

---

## What Changed from ReaCut (Fork & Architecture Evolution)

GoCut is an independently enhanced fork of [**ReaCut**](https://github.com/Xiangyu-CAS/rea-capcut) (originally developed by Xiangyu-CAS and community contributors, informed by [REA](https://github.com/morluto/rea) research into Jianying / CapCut formats). 

While upstream ReaCut provided a solid prototype on macOS using Electron, GoCut completely overhauls the engine and expands the editing capabilities:

| Aspect | Original ReaCut | GoCut (v0.7.0-beta) |
|---|---|---|
| **Runtime Architecture** | Electron (Chromium + Node.js multi-process) | **Go 1.23+ and Wails v2** (native OS Webview, ultra-lightweight) |
| **Memory & Performance** | Heavy memory footprint; high idle resource usage | **Low RAM overhead**, instant cold boot, native Go subprocess execution |
| **Platform Priority** | macOS Apple Silicon first; known Windows issues | **First-class cross-platform** (Windows, macOS, Linux) with hidden process management |
| **Media Streaming** | File-based loading; prone to timeline scrubbing stutters | **Native HTTP 206 Partial Content byte-range streaming** with instant seek |
| **Apple iPhone / MOV** | Limited support; orientation tag mismatch | **Automatic QuickTime rotation tag transpose (90°/180°/270°)** + on-demand H.264 proxy cache |
| **Timeline Editing Tools** | Basic select and split | **Razor Tool (`C`)**, **Selection Tool (`V`)**, **Ripple Trim (`Q`/`W`)**, and interactive **Context Menus** |
| **Snapping & Alignment** | Basic clip snapping | **Two-way magnetic snapping** (edges & playhead) with dynamic yellow guide line |
| **Speed & Timing** | Basic duration changes | **Variable speed slider (0.1x to 10.0x)** with auto-ripple and timeline clip duration timecode |
| **Visual FX in Player** | Fixed CSS/DOM overlays | **60 FPS Real-time Canvas Player** with interactive Crop, Chroma Key, and Shape Masks (Rectangle, Circle, Star, Heart) |
| **Nesting & Compounds** | Not supported | **Compound Clips** (collapse multiple tracks into one, unnest/decompose anytime) |
| **Transitions & Backgrounds** | Click to apply | **Drag & Drop Transitions** directly to cut points; built-in **Solid Color / Color Matte Generator** |
| **Visual Overlay Parity** | Occasional mismatch between canvas and export | **100% pixel-parity** between interactive preview canvas and FFmpeg exporter |
| **Multi-Language (i18n)** | English / Chinese | **English, Indonesian (Bahasa Indonesia), Chinese (简体中文), and Turkish (Türkçe)** |

### ☕ Why Go instead of Rust? (The Practical Rationale)

People often ask: *"Why Go + Wails instead of Rust + Tauri?"*

The short, honest developer answer: **Because life is too short to wait for 400+ Rust crates to download and compile while laptop fans scream like a jet engine :v**

Beyond the developer sanity check, here is why Go was the deliberate architectural choice for GoCut:
1. **Blazing-Fast Compile Times & Iteration Speed**: Go compiles in literal seconds (`go test` / `wails build`). Rust's compile-time overhead (LLVM codegen, recursive trait resolutions, and massive macro expansions) dramatically slows down the rapid iteration cycle required when fine-tuning timeline UI and media streaming.
2. **Batteries-Included Standard Library**: Go's standard library (`net/http`, `os/exec`, `sync`, `io`) provides rock-solid, production-ready primitives out of the box. Our HTTP 206 Partial Content byte-range media server and FFmpeg process supervisors run entirely on native standard libraries no need to pull hundreds of third-party crates just to stream video chunks or spawn a child process.
3. **Painless Dependency Management**: A clean `go mod tidy` finishes in seconds. No bloated `target/` folders taking up 15 GB of disk space or wrestling with tricky C/C++ build dependencies.
4. **Effortless Concurrency with Goroutines**: Managing background tasks like real-time proxy transcoding, subtitle generation, and clip sampling is trivial with Go's lightweight goroutines and channels, without fighting the borrow checker over shared buffer lifetimes.
5. **Native Performance Sweet Spot**: Go provides native compiled execution, minimal memory usage, and near-instant startup without the extreme friction of systems-programming cognitive overhead.

> In short: **Go delivers 95% of native C/Rust speed with 10x the developer velocity and zero dependency headache.**

---

## Key Features

### 1. High-Performance Native Backend
- **Go + Wails v2**: Replaces Electron with a compiled Go binary and OS-native webview.
- **HTTP 206 Partial Content Streaming**: Native Go media server streams video frames in chunks, allowing smooth scrubbing even through multi-gigabyte files.
- **FFmpeg Integration**: Process execution with clean process isolation and Windows console suppression.

### 2. Overhauled Multi-Track Timeline
- **Razor Blade Tool (`C`)**: Split clips at the exact mouse cursor position with a single click.
- **Selection Tool (`V`)**: Seamlessly switch back to drag, select, and move clips.
- **Ripple Trim (`Q` & `W`)**:
  - `Q`: Ripple trim from clip start to current playhead position, automatically closing the preceding gap.
  - `W`: Ripple trim from playhead to clip end, pulling subsequent clips forward.
- **Two-Way Magnetic Snapping**: Snaps clips to adjacent boundaries and playhead; displays a glowing yellow visual alignment guideline.
- **Interactive Gap Closure**: One-click gap closure button appears when hovering empty track areas.
- **Timeline Context Menus**: Right-click on any clip or empty track lane for rapid access to Split, Ripple Delete, Detach Audio, Compound Clip, Speed, and Track Management.
- **Full-Height Playhead Scrubbing**: Scrub across the entire height of the timeline without aiming for the top time ruler.
- **Playhead-Centered Zoom**: Zooming with `Ctrl + Wheel` or the zoom slider remains anchored around the current playhead position.

### 3. Real-Time Canvas Player & Visual FX (60 FPS)
- **Interactive Crop Tool**: Drag bounding handles directly on the canvas to crop video footage.
- **Real-Time Chroma Key**: Live green/blue screen removal with color picker and similarity threshold slider.
- **Shape Masks**: Apply geometric masks Rectangle, Ellipse, Star, or Heart with invert and edge feathering options.
- **Drag & Drop Transitions**: Drag transitions (Crossfade, Slide, Wipe, Dissolve) from the Creative Library directly onto cut seams.
- **Full Rendering Parity**: What you see on the canvas preview matches the final FFmpeg render frame-for-frame.

### 4. Compound Clips (Nesting)
- Select multiple clips across any number of tracks and collapse them into a single **Compound Clip**.
- Identified by a distinct `[Compound]` badge on the timeline.
- Decompose or unnest back into individual original clips at any time via the Inspector or context menu.

### 5. Solid Color / Color Matte Generator
- Generate custom color backgrounds and solids (White, Black, Red, or custom Hex colors).
- Instant SVG data URI preview and native FFmpeg SVG overlay rasterization during export.

### 6. Apple iPhone QuickTime MOV & HEVC Support
- Reads QuickTime rotation metadata tags (`rotate` = 90°, 180°, 270°) and automatically transposes orientation during preview and export.
- On-demand H.264 proxy transcoding ensures high-bitrate iPhone HEVC recordings play back smoothly without frame drops.

### 7. Multi-Language Support
- Built-in dynamic language switching:
  - English (`en`)
  - Bahasa Indonesia (`id`)
  - 简体中文 (`zh-CN`)
  - Türkçe (`tr`)

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `V` | **Selection Tool** (default mode) |
| `C` | **Razor Tool** (click clip to split at cursor position) |
| `Q` | **Ripple Trim Head** (trim from start of clip to playhead) |
| `W` | **Ripple Trim Tail** (trim from playhead to end of clip) |
| `Space` | Play / Pause playback |
| `Delete` / `Backspace` | Delete selected clip(s) |
| `Shift + Delete` | Ripple delete (delete and close gap) |
| `Ctrl + Z` / `Cmd + Z` | Undo |
| `Ctrl + Shift + Z` / `Cmd + Shift + Z` | Redo |
| `Ctrl + Scroll` / `Cmd + Scroll` | Zoom timeline centered on playhead |
| `I` / `O` | Mark In / Out points in Source Preview |

---

## Getting Started

### Prerequisites
1. **Go 1.23+**: [golang.org/dl](https://golang.org/dl/)
2. **Node.js 20+** or **24+**: [nodejs.org](https://nodejs.org/)
3. **Wails v2 CLI**:
   ```sh
   go install github.com/wailsapp/wails/v2/cmd/wails@latest
   ```
4. **FFmpeg & FFprobe**: Available on your system `PATH` (e.g., via `winget install Gyan.FFmpeg`, `brew install ffmpeg`, or `apt install ffmpeg`).

### Development

Clone the repository and install dependencies:

```sh
# Clone repo
git clone https://github.com/komporkode/rea-capcut.git
cd rea-capcut

# Install frontend dependencies
npm install
```

To run GoCut in development mode with live reloading:

```sh
# Run the complete Wails desktop application
wails dev
```

Or run just the frontend in Vite for rapid UI iteration:

```sh
npm run dev
```

### Building for Release

Compile a standalone, highly-optimized native executable:

```sh
wails build
```

The compiled binary will be placed in `build/bin/` (e.g. `build/bin/gocut.exe` on Windows, or `build/bin/gocut.app` on macOS).

---

## Testing & Quality Assurance

GoCut maintains strict testing discipline across both frontend and native Go backends:

```sh
# Run TypeScript typechecks, Vitest unit tests, and Vite build
npm run check

# Run Vitest unit & integration tests only
npm test

# Run Go backend tests (including FFmpeg process, media streaming & export test)
go test ./...
```

All 206+ unit and integration tests are verified and passing cleanly.

---

## Project Structure

```text
pkg/
  capcut/        CapCut / Jianying draft reader and compatibility layer
  cmdutil/       Cross-platform command execution & console suppression utilities
  ffmpeg/        FFmpeg & FFprobe runner, process management, and exporter
  media/         HTTP 206 Partial Content streaming server and proxy cache
  project/       Local project persistence, autosave, and recovery manager
src/
  components/    UI components (Timeline, Player, Inspector, VisualTools, Libraries)
  core/          Core timeline models, subtitle parser, timeline edits, and transforms
  editor/        Zustand application store, undo/redo history, and preview compositing
  i18n/          Localization dictionary (en, id, zh-CN, tr)
tests/           Vitest unit and integration test suites
app.go           Wails application bridge and IPC bindings
main.go          Application entrypoint and desktop window configuration
wails.json       Wails v2 application configuration
package.json     Frontend dependencies and npm scripts
```

---

## License & Acknowledgments

GoCut is open-source software licensed under the [**MIT License**](LICENSE).

- **Upstream Origin**: Forked and modernized from [ReaCut](https://github.com/Xiangyu-CAS/rea-capcut) by Xiangyu-CAS and community contributors.
- **REA Research**: Informed by [REA](https://github.com/morluto/rea) for research into CapCut / Jianying draft interoperability.
- **Open Source Communities**: Special thanks to the Go, Wails, React, Vite, FFmpeg, Zustand, and Lucide project communities.
