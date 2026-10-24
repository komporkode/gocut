# Porting ReaCut ke Wails v2 (Go) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mem-porting desktop shell ReaCut dari Electron ke Wails v2 (Go backend), mempertahankan 100% UI React 19 tanpa merombak komponen antarmuka, memangkas ukuran biner menjadi ~15MB, dan menurunkan idle RAM menjadi ~50MB tanpa memerlukan Visual Studio C++ Build Tools.

**Architecture:** Frontend React di `src/` berkomunikasi secara bersih melalui interface `window.editorAPI`. Di Wails, kita membuat file jembatan `src/wails/wailsBridge.ts` yang mengimplementasikan `EditorAPI` dengan memanggil Go bindings yang di-generate otomatis oleh Wails (`wailsjs/go/main/App`). Backend Go di `app.go` dan package modular Go mengelola pembacaan draft CapCut, file I/O atomic, proses FFmpeg/FFprobe, dan streaming media lokal.

**Tech Stack:** Go 1.22+, Wails v2, React 19, TypeScript, Zustand, Vite, FFmpeg/FFprobe lokal.

**Spec:** Dokumen arsitektur [docs/ARCHITECTURE.md](file:///d:/PROJECT/GAWEAN/PROJECT/APP/rea-capcut/docs/ARCHITECTURE.md) dan interface [src/core/types.ts:EditorAPI](file:///d:/PROJECT/GAWEAN/PROJECT/APP/rea-capcut/src/core/types.ts#L178-L247).

## Global Constraints

- Go 1.22+ mandiri di Windows (tidak memerlukan compiler C++ Visual Studio).
- 100% kompatibilitas dengan format `.reacut` (JSON valid) dan format draft CapCut lokal (`draft_content.json`).
- UI React 19, komponen timeline, player, dan Zustand store di `src/` tidak boleh di-rewrite; hanya lapisan bridge yang diganti.
- Menggunakan native Windows WebView2 runtime (sudah pre-installed di Windows 10/11).
- Tetap mematuhi aturan keamanan `AGENTS.md`: sandboxing webview, validasi path (mencegah directory traversal), dan batasan akses file.

## Review Focus

- Streaming video preview berukuran besar melalui custom asset handler HTTP Wails (dukungan byte-range headers).
- Interupsi/pembatalan proses FFmpeg saat rendering export dibatalkan (`cancelExport`).
- Pengelolaan atomic write pada penyimpanan project dan autosave untuk menghindari korupsi data saat shutdown mendadak.
- Kompatibilitas cross-platform path separator (Windows `\` vs macOS/Linux `/`) saat impor draft CapCut.
- Penanganan multi-goroutine aman (*concurrency-safe*) pada status export dan pembacaan media.

---

### Task 1: Verifikasi Instalasi Go & Wails CLI

**Files:**
- Test: `go version` dan `wails version`

**Interfaces:**
- Consumes: Go installer (`go1.23.x.windows-amd64.msi`, ~160MB).
- Produces: Lingkungan build Go dan CLI Wails siap pakai.

- [ ] **Step 1: Unduh & pasang Go 1.22+**
Pasang Go MSI dari https://go.dev/dl/.

- [ ] **Step 2: Pasang Wails CLI**
Run: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`
Expected: Perintah `wails doctor` menunjukkan checklist hijau.

---

### Task 2: Inisialisasi Konfigurasi Wails (`wails.json`)

**Files:**
- Create: `wails.json`
- Create: `main.go`
- Create: `app.go`

**Interfaces:**
- Consumes: Vite dev server (`http://localhost:5173`) dan asset `dist/`
- Produces: Jendela aplikasi desktop Wails dengan WebView2.

- [ ] **Step 1: Buat konfigurasi `wails.json`**
Atur target frontend ke `dist/`, dev server ke `http://localhost:5173`, dan reload otomatis.

- [ ] **Step 2: Buat entrypoint `main.go` dan struct `App` di `app.go`**
Konfigurasikan judul jendela `ReaCut · 映刻`, ukuran 1500x950, dan background `#141518`.

- [ ] **Step 3: Uji jalankan skeleton Wails**
Run: `wails dev`
Expected: Window Wails terbuka dan merender halaman index Vite.

---

### Task 3: Streaming Media Handler di Go (`reacut-media`)

**Files:**
- Create: `pkg/media/handler.go`
- Modify: `main.go`

**Interfaces:**
- Consumes: Request HTTP GET untuk file media lokal dengan header `Range: bytes=start-end`
- Produces: HTTP 206 Partial Content dengan mime-type yang sesuai untuk video, audio, dan gambar.

- [ ] **Step 1: Implementasikan custom asset handler di `main.go`**
Gunakan `http.HandlerFunc` yang memvalidasi path berada dalam daftar media yang diizinkan (`allowedMedia`).

- [ ] **Step 2: Gunakan `http.ServeContent` bawaan Go**
`http.ServeContent` di standard library Go secara otomatis menangani byte-range parsing, Content-Length, dan streaming seek video tanpa overhead.

---

### Task 4: Perintah Manajemen Proyek di Go (`pkg/project/project.go`)

**Files:**
- Create: `pkg/project/project.go`
- Modify: `app.go`

**Interfaces:**
- Consumes: JSON string proyek `.reacut`
- Produces: Method Go pada struct `App`:
  - `OpenProject(path string) (*ProjectResult, error)`
  - `SaveProject(projectJson string, path string) (string, error)`
  - `AutosaveProject(projectJson string) error`
  - `GetRecentProjects() ([]RecentProject, error)`

- [ ] **Step 1: Tulis unit test di Go (`pkg/project/project_test.go`)**
Uji fungsi penulisan atomic file (`.tmp` lalu `os.Rename`) dan serialisasi JSON.

- [ ] **Step 2: Implementasikan penulisan dan pembacaan file di Go**
Pastikan path traversal dicegah dengan validasi `filepath.Clean`.

- [ ] **Step 3: Binding method ke struct `App`**
Buka akses method agar bisa dipanggil dari frontend via auto-generated `wailsjs`.

---

### Task 5: Integrasi FFmpeg / FFprobe di Go (`pkg/ffmpeg/runner.go`)

**Files:**
- Create: `pkg/ffmpeg/probe.go`
- Create: `pkg/ffmpeg/export.go`
- Modify: `app.go`

**Interfaces:**
- Consumes: File path media, argumen export.
- Produces:
  - `ProbeFile(path string) (*MediaAsset, error)`
  - `StartExport(projectJson string, options ExportOptions) (string, error)`
  - `CancelExport(jobId string) error`
  - Mengirim progres via Wails runtime `runtime.EventsEmit(ctx, "export-progress", progress)`.

- [ ] **Step 1: Implementasikan deteksi path FFmpeg/FFprobe**
Cari di direktori aplikasi, setting konfigurasi, atau `os.Getenv("PATH")`.

- [ ] **Step 2: Implementasikan pembacaan metadata media dengan `exec.Command("ffprobe", ...)`**
Parse output JSON durasi, resolusi, FPS, dan audio channels.

- [ ] **Step 3: Implementasikan eksekusi export dengan `exec.CommandContext` (dukungan pembatalan)**
Gunakan `io.Pipe` untuk membaca stdout progress FFmpeg dan pancarkan event progres secara realtime ke UI.

---

### Task 6: Pembacaan Draft CapCut di Go (`pkg/capcut/parser.go`)

**Files:**
- Create: `pkg/capcut/parser.go`
- Modify: `app.go`

**Interfaces:**
- Consumes: Folder project CapCut atau `draft_content.json`
- Produces:
  - `ChooseCapcutProject(mode string) (*CapcutSelection, error)`
  - `ReadCapcutDraft(token string, timelineId string) (*CapcutDraftResult, error)`

- [ ] **Step 1: Implementasikan parser JSON draft CapCut di Go**
Struktur Go untuk mem-parse `draft_content.json` tanpa dependensi eksternal.

- [ ] **Step 2: Implementasikan session cache in-memory untuk token impor**
Gunakan map dengan mutex `sync.RWMutex` untuk keamanan konkurensi.

---

### Task 7: Adapter Frontend Wails (`src/wails/wailsBridge.ts`)

**Files:**
- Create: `src/wails/wailsBridge.ts`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: Auto-generated Wails client di `wailsjs/go/main/App` dan `wailsjs/runtime/runtime`
- Produces: Implementasi lengkap interface `EditorAPI` pada `window.editorAPI`.

- [ ] **Step 1: Generate bindings Wails**
Run: `wails generate module`

- [ ] **Step 2: Petakan panggilan `EditorAPI` ke method Go**
```ts
export function createWailsEditorAPI(): EditorAPI {
  return {
    openProject: () => App.OpenProject(""),
    saveProject: (project, path) => App.SaveProject(JSON.stringify(project), path ?? ""),
    exportProject: (project, options) => App.StartExport(JSON.stringify(project), options),
    onExportProgress: (callback) => EventsOn("export-progress", callback),
    // ...semua method terhubung ke Go
  };
}
```

- [ ] **Step 3: Aktifkan di `src/main.tsx`**
Pasang adapter ke `window.editorAPI` saat mendeteksi environment Wails.

---

### Task 8: Pengujian & Benchmarking

**Files:**
- Test: Pengujian manual & benchmarking performa

**Interfaces:**
- Consumes: Aplikasi ReaCut berjalan di Wails runtime
- Produces: Verifikasi fitur dan catatan penurunan RAM.

- [ ] **Step 1: Jalankan `wails build`**
Expected: Terbentuk file biner tunggal `.exe` berukuran **~15 MB**.

- [ ] **Step 2: Uji alur kerja editing video**
Impor klip, potong timeline, render video export, dan impor draft CapCut.

- [ ] **Step 3: Verifikasi RAM**
Ukur penggunaan RAM di Task Manager.
Expected: Konsumsi idle RAM berkisar **~40MB – 60MB**.
