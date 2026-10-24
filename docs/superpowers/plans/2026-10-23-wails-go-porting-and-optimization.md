# ReaCut Wails (Go) Porting & Core Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mem-porting desktop shell ReaCut dari Electron ke Wails v2 (Go backend) sekaligus menuntaskan 5 bottleneck render & memory leak di sisi React, menghasilkan aplikasi desktop mandiri berukuran ~15MB dengan idle RAM ~40-60MB dan CPU playback ultra-ringan tanpa memerlukan Visual Studio C++ Build Tools.

**Architecture:** Frontend React di `src/` mempertahankan 100% komponen UI melalui interface adapter `EditorAPI` di `src/wails/wailsBridge.ts`. Backend Go (`app.go`, `main.go`) dirancang minimalis sesuai filosofi Ponytail (<400 baris Go) yang hanya menangani streaming HTTP byte-range, native dialogs, file I/O atomic, dan proses FFmpeg/FFprobe via `os/exec`. Secara bersamaan, 5 bug pemborosan performa (Playhead Render Storm di `App.tsx`, RAF continuous loop di `Player.tsx`, double JSON.stringify di `store.ts`, dan software pixel loop di `previewLayers.ts`) diselesaikan.

**Tech Stack:** Go 1.22+, Wails v2, React 19, TypeScript, Zustand, Vite, HTML5 Canvas, FFmpeg/FFprobe lokal.

**Spec:** Dokumen arsitektur [docs/ARCHITECTURE.md](file:///d:/PROJECT/GAWEAN/PROJECT/APP/rea-capcut/docs/ARCHITECTURE.md), interface [src/core/types.ts:EditorAPI](file:///d:/PROJECT/GAWEAN/PROJECT/APP/rea-capcut/src/core/types.ts#L178-L247), dan hasil audit sistem sebelumnya.

## Global Constraints

- Backend Go **TIDAK menduplikasi struct domain video** (`Project`, `Track`, `Clip`). Proyek diperlakukan sebagai JSON mentah (`json.RawMessage`) oleh Go; parsing & validasi domain tetap 100% di TypeScript yang sudah teruji.
- Go 1.22+ mandiri di Windows (tidak memerlukan compiler C++ Visual Studio / link.exe).
- Kompatibilitas 100% dengan format file proyek `.reacut` dan pembacaan draft CapCut lokal (`draft_content.json`).
- Penggunaan native WebView2 runtime di Windows.
- Sesuai prinsip **Ponytail**: Deletion beats addition; gunakan standard library `net/http` dan `os/exec` bawaan Go, hindari abstraksi berlebih (*no useless wrappers*).

## Review Focus

- Loop `requestAnimationFrame` di `Player.tsx` harus tidur (*idle*) saat video di-pause dan hanya aktif saat `playing === true` atau ada event seek/edit.
- Root component `App.tsx` tidak boleh me-render ulang saat `playhead` bergerak; playhead cursor harus diisolasi ke komponen mandiri.
- Eliminasi `JSON.stringify` dobel di `store.ts:commit` dengan menggantinya ke penanda versi numerik (`revisionId`).
- Streaming media lokal di Go via `http.ServeContent` wajib mendukung status `206 Partial Content` untuk seeking video 4K yang mulus.
- Pembatalan export FFmpeg (`cancelExport`) harus mematikan child process dan membersihkan file sementara secara terjamin (*atomic cleanup*).

---

### Task 1: Optimasi P0 Frontend — Eliminasi Playhead Render Storm di `App.tsx`

**Files:**
- Modify: `src/App.tsx:475-520`
- Modify: `src/App.tsx:1300-1335`
- Test: Verifikasi re-render di browser/dev mode

**Interfaces:**
- Consumes: Zustand store `useEditorStore`
- Produces: `App` root component yang tidak lagi subscribe ke seluruh store tanpa selektor.

- [ ] **Step 1: Identifikasi semua properti store yang dibutuhkan `App.tsx`**
Pisahkan state jarang berubah (`project`, `selectedIds`, `zoom`, `snapping`, `magnetic`) dari state frekuensi tinggi (`playhead`, `playing`).

- [ ] **Step 2: Ubah pemanggilan `const s = useEditorStore();` menjadi targeted selectors**
Di `src/App.tsx:476`:
```tsx
const project = useEditorStore(s => s.project);
const selectedIds = useEditorStore(s => s.selectedIds);
const zoom = useEditorStore(s => s.zoom);
const snapping = useEditorStore(s => s.snapping);
const magnetic = useEditorStore(s => s.magnetic);
const dirty = useEditorStore(s => s.dirty);
const pastLength = useEditorStore(s => s.past.length);
const futureLength = useEditorStore(s => s.future.length);
```

- [ ] **Step 3: Ganti pemanggilan method store langsung dari `useEditorStore.getState()`**
Aksi seperti `undo`, `redo`, `split`, `deleteSelected`, `setZoom` dipanggil langsung dari `useEditorStore.getState()` tanpa memicu re-render pada `App`.

- [ ] **Step 4: Jalankan typecheck untuk memastikan kompatibilitas**
Run: `npm run typecheck`
Expected: PASS

---

### Task 2: Optimasi P0 Frontend — Idle Throttling RAF Loop di `Player.tsx`

**Files:**
- Modify: `src/components/Player.tsx:185-340`
- Test: Monitor CPU usage saat video pause vs play

**Interfaces:**
- Consumes: `playing: boolean`, `playhead: number`, canvas 2D context
- Produces: Loop `paint` yang hanya berjalan saat video diputar atau saat ada perubahan visual (seek/edit/resize).

- [ ] **Step 1: Buat fungsi `renderFrame()` terpisah dari loop playback**
Ekstraksi logika render canvas (clear, draw video/image/text) ke fungsi `renderFrame(time)`.

- [ ] **Step 2: Jalankan `requestAnimationFrame` HANYA saat `playing === true`**
Jika `playing === false`, jangan jadwalkan frame baru (`frame = requestAnimationFrame(paint)` di-skip).

- [ ] **Step 3: Panggil `renderFrame()` sekali saat event scrub / edit terjadi**
Gunakan `useEffect` yang merender satu frame saat `playhead`, `project`, atau `size` berubah saat kondisi paused.

- [ ] **Step 4: Jalankan typecheck**
Run: `npm run typecheck`
Expected: PASS

---

### Task 3: Optimasi P1 Frontend — Eliminasi Double JSON.stringify di `store.ts`

**Files:**
- Modify: `src/editor/store.ts:20-68`
- Modify: `src/editor/store.ts:160-177`
- Test: `tests/store.test.ts`

**Interfaces:**
- Consumes: `project: Project` baru pada setiap mutasi editor.
- Produces: `commit()` ultra-cepat tanpa serialisasi stringify dobel, undo history dibatasi maks 50 snapshot.

- [ ] **Step 1: Tambahkan `revisionId: number` ke `EditorState`**
Inisialisasi `revisionId: 0`.

- [ ] **Step 2: Ganti `JSON.stringify(project) === JSON.stringify(s.project)`**
Ganti dengan pengecekan referensi `project === s.project` dan shallow comparison timestamp/ID.

- [ ] **Step 3: Kurangi batas undo stack dari 150 ke 50**
Di `store.ts:173`:
```ts
past: s.transactionOpen && s.transactionRecorded
  ? s.past
  : [...s.past, clone(s.project)].slice(-50),
```
Menghemat ~150MB-250MB RAM saat mengedit proyek dengan banyak klip.

- [ ] **Step 4: Jalankan unit test store**
Run: `npm test tests/store.test.ts`
Expected: PASS

---

### Task 4: Optimasi P1 Frontend — Hardware-Accelerated CSS Filters di `previewLayers.ts`

**Files:**
- Modify: `src/editor/previewLayers.ts:39-66`
- Modify: `src/components/Player.tsx:285-300`

**Interfaces:**
- Consumes: `clip.adjustments` (brightness, contrast, saturation, blur)
- Produces: Render visual menggunakan GPU Canvas context filter (`ctx.filter`) alih-alih per-pixel CPU loop `getImageData`/`putImageData`.

- [ ] **Step 1: Deteksi apakah klip hanya memakai color adjustments tanpa chroma-key/mask kustom**
Jika `!clip.chromaKey?.enabled && !clip.mask`, lewati loop CPU `getImageData`.

- [ ] **Step 2: Pasang filter native di `ctx.filter`**
Gunakan `ctx.filter = brightness(...) contrast(...) saturate(...) blur(...)` yang di-rasterisasi langsung oleh hardware GPU browser.

- [ ] **Step 3: Pertahankan CPU loop hanya saat Chroma-Key / Shape Mask aktif**
Menjaga akurasi fitur tanpa membebani klip biasa dengan pemrosesan pixel mentah.

- [ ] **Step 4: Jalankan typecheck**
Run: `npm run typecheck`
Expected: PASS

---

### Task 5: Inisialisasi Project Wails v2 (Go)

**Files:**
- Create: `wails.json`
- Create: `main.go`
- Create: `app.go`
- Create: `go.mod`

**Interfaces:**
- Consumes: Go 1.22+, `dist/` web assets, dev server `http://localhost:5173`.
- Produces: Jendela native Windows WebView2 berukuran 1500x950 dengan title `ReaCut · 映刻`.

- [ ] **Step 1: Buat `go.mod`**
Nama modul: `reacut`
Dependensi: `github.com/wailsapp/wails/v2`.

- [ ] **Step 2: Buat `wails.json`**
```json
{
  "$schema": "https://wails.io/schemas/config.v2.json",
  "name": "reacut",
  "outputfilename": "reacut",
  "frontend:dir": ".",
  "frontend:install": "npm install",
  "frontend:build": "npm run build",
  "frontend:dev:watcher": "npm run dev",
  "frontend:dev:serverUrl": "http://localhost:5173",
  "author": { "name": "ReaCut Contributors" }
}
```

- [ ] **Step 3: Buat `main.go` dan struct `App` di `app.go`**
Konfigurasi startup Wails dengan opsi window, asset handler, dan bind `app`.

---

### Task 6: Streaming Media Lokal di Go via `http.ServeContent`

**Files:**
- Create: `pkg/media/server.go`
- Modify: `main.go`

**Interfaces:**
- Consumes: Request URL `http://wails.localhost/media-stream?path=...` dengan header `Range: bytes=start-end`.
- Produces: HTTP 206 Partial Content / HTTP 200 dengan streaming seekable tanpa buffer memori.

- [ ] **Step 1: Buat custom asset handler di `pkg/media/server.go`**
Gunakan `http.HandlerFunc` yang memvalidasi bahwa path file adalah file absolut yang terdaftar di `allowedMedia`.

- [ ] **Step 2: Gunakan `http.ServeContent` bawaan Go**
```go
func HandleMediaStream(w http.ResponseWriter, r *http.Request) {
    filePath := r.URL.Query().Get("path")
    file, err := os.Open(filePath)
    if err != nil {
        http.Error(w, "File not found", http.StatusNotFound)
        return
    }
    defer file.Close()
    info, _ := file.Stat()
    http.ServeContent(w, r, filepath.Base(filePath), info.ModTime(), file)
}
```
*Prinsip Ponytail: 10 baris Go menggantikan 150 baris kode custom streaming Electron.*

- [ ] **Step 3: Hubungkan ke `options.AssetServer` di `main.go`**

---

### Task 7: File I/O & Native Dialogs di Go

**Files:**
- Create: `pkg/project/storage.go`
- Modify: `app.go`

**Interfaces:**
- Consumes: Dialog native Wails runtime (`runtime.OpenFileDialog`, `runtime.SaveFileDialog`)
- Produces: Method Go pada struct `App`:
  - `OpenProject(path string) (string, error)`
  - `SaveProject(projectJson string, path string) (string, error)`
  - `AutosaveProject(projectJson string) error`
  - `GetRecentProjects() ([]RecentEntry, error)`
  - `ChooseMediaFiles() ([]string, error)`

- [ ] **Step 1: Implementasikan penulisan file atomic**
Tulis file ke `.tmp` (mode 0600) lalu `os.Rename` ke target path untuk mencegah korupsi file saat listrik padam.

- [ ] **Step 2: Implementasikan autosave**
Simpan ke direktori data aplikasi pengguna (`os.UserConfigDir() / "ReaCut" / "autosave.reacut"`).

---

### Task 8: Eksekusi FFmpeg / FFprobe di Go

**Files:**
- Create: `pkg/ffmpeg/process.go`
- Modify: `app.go`

**Interfaces:**
- Consumes: Command FFmpeg/FFprobe
- Produces: Method Go:
  - `ProbeMedia(path string) (string, error)`
  - `StartExport(projectJson string, optionsJson string) (string, error)`
  - `CancelExport(jobId string) error`
  - Emisi realtime event: `runtime.EventsEmit(a.ctx, "export-progress", event)`

- [ ] **Step 1: Implementasikan deteksi lokasi binary FFmpeg/FFprobe**
Cari di direktori aplikasi, path kustom pengguna, atau `PATH` sistem.

- [ ] **Step 2: Jalankan export dengan `exec.CommandContext`**
Gunakan `context.WithCancel` agar proses FFmpeg langsung mati seketika saat pengguna menekan tombol `cancelExport`.

- [ ] **Step 3: Baca progress pipe stdout secara realtime**
Parse `-progress pipe:1` dan pancarkan event progres ke frontend via Wails event runtime.

---

### Task 9: CapCut Draft File Reader Aman di Go

**Files:**
- Create: `pkg/capcut/reader.go`
- Modify: `app.go`

**Interfaces:**
- Consumes: Path folder draft CapCut
- Produces: Method Go `ReadCapcutDraft(dirPath string) (string, error)` yang mengembalikan isi file `draft_content.json`.

- [ ] **Step 1: Validasi keamanan folder (mencegah directory traversal)**
Pastikan path bersih dan target file `draft_content.json` berada di dalam folder yang dipilih.

- [ ] **Step 2: Baca file dan kembalikan string JSON ke frontend**
Parsing detail klip, teks, dan keyframe tetap dilakukan oleh `src/core/capcutImport.ts` di TypeScript.

---

### Task 10: Frontend Wails Adapter (`src/wails/wailsBridge.ts`)

**Files:**
- Create: `src/wails/wailsBridge.ts`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: Auto-generated Wails client di `wailsjs/go/main/App` dan `wailsjs/runtime`
- Produces: Objek `window.editorAPI` yang memenuhi seluruh kontrak interface `EditorAPI`.

- [ ] **Step 1: Buat adapter `createWailsEditorAPI()`**
Implementasikan 30+ method `EditorAPI` dengan memanggil method Go:
```ts
export function createWailsEditorAPI(): EditorAPI {
  return {
    openProject: async () => {
      const data = await App.OpenProject("");
      return data ? { project: JSON.parse(data.json), path: data.path } : null;
    },
    saveProject: async (project, path) => App.SaveProject(JSON.stringify(project), path ?? ""),
    exportProject: async (project, options) => {
      const jobId = await App.StartExport(JSON.stringify(project), JSON.stringify(options));
      return { jobId };
    },
    onExportProgress: (callback) => {
      EventsOn("export-progress", callback);
      return () => EventsOff("export-progress");
    },
    // ...semua method terhubung ke Go
  };
}
```

- [ ] **Step 2: Sambungkan di `src/main.tsx`**
```ts
if ((window as any).go) {
  window.editorAPI = createWailsEditorAPI();
}
```

- [ ] **Step 3: Jalankan typecheck penuh**
Run: `npm run typecheck`
Expected: PASS tanpa error tipe.

---

### Task 11: Verifikasi End-to-End & Audit Penghematan

**Files:**
- Test: Verifikasi fungsional dan resource Task Manager

**Interfaces:**
- Consumes: File biner `reacut.exe` (Wails)
- Produces: Laporan metrik penurunan RAM, CPU, dan ukuran instalasi.

- [ ] **Step 1: Jalankan `wails build`**
Expected: Biner `.exe` terbentuk dengan ukuran **~15MB**.

- [ ] **Step 2: Uji fungsionalitas editor video**
  1. Impor klip MP4/WAV.
  2. Putar timeline (pastikan audio sync dan video 60 FPS).
  3. Potong klip (*split*), tambah teks dan transisi.
  4. Simpan ke file `.reacut` dan buka kembali.
  5. Export video MP4.
  6. Impor draft CapCut lokal.

- [ ] **Step 3: Ukur performa di Task Manager**
  - **Idle RAM**: Berada di kisaran **40MB – 60MB** (turun >70% dibanding Electron).
  - **CPU Playback**: Di bawah 10–15% (eliminasi total dari re-render storm dan idle RAF loop).
