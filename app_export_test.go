package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"

	"reacut/pkg/capcut"
	"reacut/pkg/ffmpeg"
	"reacut/pkg/media"
	"reacut/pkg/project"
)

func TestUserProjectExport(t *testing.T) {
	appData := os.Getenv("APPDATA")
	autosavePath := filepath.Join(appData, "reacut", "autosave.gct")
	if _, err := os.Stat(autosavePath); os.IsNotExist(err) {
		autosavePath = filepath.Join(appData, "reacut", "autosave.reacut")
	}
	content, err := os.ReadFile(autosavePath)
	if err != nil {
		t.Skipf("Autosave file not found: %v", err)
	}

	var draft struct {
		Clips []any `json:"clips"`
	}
	if err := json.Unmarshal(content, &draft); err != nil || len(draft.Clips) == 0 {
		t.Skip("Autosave has no clips to export")
	}

	dummyDir := filepath.Join(os.TempDir(), "reacut_test_fixtures")
	_ = os.MkdirAll(dummyDir, 0755)
	dummyPng := filepath.Join(dummyDir, "Anin (2).png")
	// 1x1 transparent PNG bytes
	pngBytes := []byte{
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
		0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
		0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
		0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
		0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
		0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
	}
	_ = os.WriteFile(dummyPng, pngBytes, 0644)
	media.RegisterSearchDir(dummyDir)

	storage, err := project.NewStorageManager()
	if err != nil {
		t.Fatalf("Storage manager init failed: %v", err)
	}

	runner := ffmpeg.NewRunner()
	app := &App{
		ctx:     nil,
		storage: storage,
		runner:  runner,
		capcut:  capcut.NewDraftReader(),
	}

	// Test 1: Project's original 1080x1920 (Synchronous & probe verified)
	t.Run("Original_1080x1920", func(t *testing.T) {
		tempDir := t.TempDir()
		outputFile := filepath.Join(tempDir, "test_1080x1920.mp4")
		optionsJson := `{"path":"` + filepath.ToSlash(outputFile) + `","format":"mp4","width":1080,"height":1920,"fps":30,"duration":16}`

		targetFile, dur, args, err := app.BuildExportArgs(string(content), optionsJson)
		if err != nil {
			t.Fatalf("BuildExportArgs failed: %v", err)
		}

		err = runner.RunExport("job-test-1", args, dur, func(pct float64) {})
		if err != nil {
			t.Fatalf("RunExport failed: %v", err)
		}

		probe, err := runner.Probe(targetFile)
		if err != nil {
			t.Fatalf("Probe exported file failed: %v", err)
		}

		t.Logf("Exported file probed: %dx%d, dur: %.2fs, hasAudio: %v", probe.Width, probe.Height, probe.Duration, probe.HasAudio)
		if probe.Width != 1080 || probe.Height != 1920 {
			t.Errorf("Expected 1080x1920, got %dx%d", probe.Width, probe.Height)
		}
		if !probe.HasAudio {
			t.Errorf("Expected exported video to have audio stream")
		}
		if probe.Duration < 15.0 {
			t.Errorf("Expected duration >= 15s, got %.2f", probe.Duration)
		}
	})

	// Test 2: Scaled 720p (406x720) - odd width prevention test
	t.Run("Scaled_406x720", func(t *testing.T) {
		tempDir := t.TempDir()
		outputFile := filepath.Join(tempDir, "test_406x720.mp4")
		optionsJson := `{"path":"` + filepath.ToSlash(outputFile) + `","format":"mp4","width":406,"height":720,"fps":30,"duration":16}`

		targetFile, dur, args, err := app.BuildExportArgs(string(content), optionsJson)
		if err != nil {
			t.Fatalf("BuildExportArgs failed: %v", err)
		}

		err = runner.RunExport("job-test-2", args, dur, func(pct float64) {})
		if err != nil {
			t.Fatalf("RunExport failed: %v", err)
		}

		probe, err := runner.Probe(targetFile)
		if err != nil {
			t.Fatalf("Probe exported file failed: %v", err)
		}

		t.Logf("Exported 720p probed: %dx%d, dur: %.2fs, hasAudio: %v", probe.Width, probe.Height, probe.Duration, probe.HasAudio)
		if probe.Height != 720 {
			t.Errorf("Expected height 720, got %d", probe.Height)
		}
		if !probe.HasAudio {
			t.Errorf("Expected exported video to have audio stream")
		}
	})

	// Test 3: Destination directory auto-creation sibling check
	t.Run("NestedDirectoryCreation", func(t *testing.T) {
		tempDir := t.TempDir()
		nestedDir := filepath.Join(tempDir, "sub1", "sub2")
		outputFile := filepath.Join(nestedDir, "nested.mp4")
		optionsJson := `{"path":"` + filepath.ToSlash(outputFile) + `","format":"mp4","width":360,"height":640,"fps":30,"duration":5}`

		targetFile, dur, args, err := app.BuildExportArgs(string(content), optionsJson)
		if err != nil {
			t.Fatalf("BuildExportArgs failed: %v", err)
		}

		if _, err := os.Stat(nestedDir); err != nil {
			t.Fatalf("Target directory was not created: %v", err)
		}

		err = runner.RunExport("job-test-3", args, dur, func(pct float64) {})
		if err != nil {
			t.Fatalf("RunExport failed: %v", err)
		}
		if fi, err := os.Stat(targetFile); err != nil || fi.Size() == 0 {
			t.Fatalf("Nested output file was not produced: %v", err)
		}
	})

	// Test 4: Target file lock detection
	t.Run("LockedFileDetection", func(t *testing.T) {
		tempDir := t.TempDir()
		outputFile := filepath.Join(tempDir, "locked.mp4")
		p, err := syscall.UTF16PtrFromString(outputFile)
		if err != nil {
			t.Fatalf("UTF16PtrFromString failed: %v", err)
		}
		// Open with shared read only (no FILE_SHARE_WRITE) like Windows Media Player
		handle, err := syscall.CreateFile(p, syscall.GENERIC_READ, syscall.FILE_SHARE_READ, nil, syscall.CREATE_ALWAYS, syscall.FILE_ATTRIBUTE_NORMAL, 0)
		if err != nil {
			t.Fatalf("Failed to create locked test file: %v", err)
		}
		defer syscall.CloseHandle(handle)

		optionsJson := `{"path":"` + filepath.ToSlash(outputFile) + `","format":"mp4","width":360,"height":640,"fps":30,"duration":5}`
		_, _, _, err = app.BuildExportArgs(string(content), optionsJson)
		if err == nil {
			t.Fatalf("Expected error for locked target file, got nil")
		}
		t.Logf("Locked file correctly blocked: %v", err)
	})

	// Test 5: Export with transitions
	t.Run("TransitionsFilterComplex", func(t *testing.T) {
		transProj := `{
			"name": "Transition Project",
			"width": 1920,
			"height": 1080,
			"fps": 30,
			"background": "#000000",
			"assets": [
				{"id":"a1","name":"v.mp4","path":"` + filepath.ToSlash(dummyPng) + `","kind":"image","duration":10,"width":1920,"height":1080,"fps":30,"hasAudio":false}
			],
			"tracks": [
				{"id":"v1","name":"Video 1","kind":"video","muted":false,"hidden":false}
			],
			"clips": [
				{"id":"c1","trackId":"v1","assetId":"a1","name":"c1","start":0,"duration":4,"sourceIn":0,"speed":1,"volume":1,"muted":false,"fadeIn":0,"fadeOut":0},
				{"id":"c2","trackId":"v1","assetId":"a1","name":"c2","start":3,"duration":4,"sourceIn":0,"speed":1,"volume":1,"muted":false,"fadeIn":0,"fadeOut":0}
			],
			"transitions": [
				{"id":"t1","trackId":"v1","fromClipId":"c1","toClipId":"c2","type":"slide-left","duration":1.0}
			]
		}`
		tempDir := t.TempDir()
		outputFile := filepath.Join(tempDir, "test_transition.mp4")
		optionsJson := `{"path":"` + filepath.ToSlash(outputFile) + `","format":"mp4","width":1920,"height":1080,"fps":30,"duration":7}`

		_, _, args, err := app.BuildExportArgs(transProj, optionsJson)
		if err != nil {
			t.Fatalf("BuildExportArgs with transitions failed: %v", err)
		}

		filterStr := ""
		for idx, arg := range args {
			if arg == "-filter_complex" && idx+1 < len(args) {
				filterStr = args[idx+1]
				break
			}
		}

		if filterStr == "" {
			t.Fatalf("Expected -filter_complex in args, got: %v", args)
		}
		t.Logf("Generated filter_complex: %s", filterStr)
	})

	// Test 6: Simple sequential footage export uses fast concat filter and fast encoder
	t.Run("SequentialFootageFastConcat", func(t *testing.T) {
		seqProj := `{
			"name": "Sequential Test",
			"width": 1920,
			"height": 1080,
			"fps": 30,
			"background": "#000000",
			"assets": [
				{"id":"a1","name":"v.mp4","path":"` + filepath.ToSlash(dummyPng) + `","kind":"image","duration":10,"width":1920,"height":1080,"fps":30,"hasAudio":false}
			],
			"tracks": [
				{"id":"v1","name":"Video 1","kind":"video","muted":false,"hidden":false}
			],
			"clips": [
				{"id":"c1","trackId":"v1","assetId":"a1","name":"c1","start":0,"duration":5,"sourceIn":0,"speed":1,"volume":1,"muted":false,"fadeIn":0,"fadeOut":0},
				{"id":"c2","trackId":"v1","assetId":"a1","name":"c2","start":5,"duration":5,"sourceIn":0,"speed":1,"volume":1,"muted":false,"fadeIn":0,"fadeOut":0}
			]
		}`
		tempDir := t.TempDir()
		outputFile := filepath.Join(tempDir, "test_seq.mp4")
		optionsJson := `{"path":"` + filepath.ToSlash(outputFile) + `","format":"mp4","width":1920,"height":1080,"fps":30,"duration":10,"quality":"standard"}`

		_, _, args, err := app.BuildExportArgs(seqProj, optionsJson)
		if err != nil {
			t.Fatalf("BuildExportArgs sequential failed: %v", err)
		}

		filterStr := ""
		presetStr := ""
		for idx, arg := range args {
			if arg == "-filter_complex" && idx+1 < len(args) {
				filterStr = args[idx+1]
			}
			if arg == "-preset" && idx+1 < len(args) {
				presetStr = args[idx+1]
			}
		}

		if !strings.Contains(filterStr, "concat=n=2") {
			t.Errorf("Expected filter_complex to use concat=n=2, got: %s", filterStr)
		}
		if !strings.Contains(filterStr, "format=yuv420p") {
			t.Errorf("Expected filter_complex to use yuv420p for fast concat, got: %s", filterStr)
		}
		t.Logf("Sequential filter complex: %s, preset: %s", filterStr, presetStr)
	})

	t.Run("CustomBitrateOptions", func(t *testing.T) {
		tempDir := t.TempDir()
		outputFile := filepath.ToSlash(filepath.Join(tempDir, "bitrate.mp4"))
		projJSON := `{"width":1920,"height":1080,"fps":30,"clips":[],"tracks":[]}`
		optsJSON := `{"path":"` + outputFile + `","bitrate":"12M","encoder":"cpu"}`

		_, _, args, err := app.BuildExportArgs(projJSON, optsJSON)
		if err != nil {
			t.Fatalf("BuildExportArgs error: %v", err)
		}

		hasBitrate := false
		for i, arg := range args {
			if arg == "-b:v" && i+1 < len(args) && args[i+1] == "12M" {
				hasBitrate = true
				break
			}
		}
		if !hasBitrate {
			t.Errorf("Expected -b:v 12M in args, got: %v", args)
		}
	})

	t.Run("ProEffectsAndAdjustmentLayerFilterComplex", func(t *testing.T) {
		tempDir := t.TempDir()
		outputFile := filepath.ToSlash(filepath.Join(tempDir, "pro_effects.mp4"))
		projJSON := `{
			"width": 1920,
			"height": 1080,
			"fps": 30,
			"assets": [
				{"id":"a1","name":"v.png","path":"` + filepath.ToSlash(dummyPng) + `","kind":"image","duration":5,"width":1920,"height":1080,"fps":30,"hasAudio":false}
			],
			"tracks": [
				{"id":"v2","name":"V2 Adj","kind":"video","muted":false,"hidden":false,"solo":false},
				{"id":"v1","name":"V1 Base","kind":"video","muted":false,"hidden":false,"solo":false}
			],
			"clips": [
				{
					"id":"c1","trackId":"v1","assetId":"a1","name":"c1","start":0,"duration":5,"sourceIn":0,"speed":1,
					"effects":{
						"grain":{"enabled":true,"preset":"kodak-35mm","engine":"analog","movement":"dynamic","intensity":40,"grainSize":"medium"},
						"blur":{"enabled":true,"type":"motion","radius":12,"angle":45},
						"stylize":{"enabled":true,"vignette":35,"chromaticAberration":8,"scanlines":0,"bloom":20,"sharpen":30}
					}
				},
				{
					"id":"adj1","trackId":"v2","name":"Adjustment Layer","start":1,"duration":3,"sourceIn":0,"speed":1,
					"isAdjustmentLayer":true,
					"adjustments":{"brightness":0.1,"contrast":1.2,"saturation":1.1,"blur":4}
				}
			]
		}`
		optsJSON := `{"path":"` + outputFile + `","codec":"hevc","encoder":"cpu","bitrate":"12M"}`

		_, _, args, err := app.BuildExportArgs(projJSON, optsJSON)
		if err != nil {
			t.Fatalf("BuildExportArgs error: %v", err)
		}

		joined := strings.Join(args, " ")
		for _, expected := range []string{"noise=alls=", "dblur=angle=45", "rgbashift=", "vignette=", "split=2[adj_raw_", "libx265"} {
			if !strings.Contains(joined, expected) {
				t.Errorf("Expected %q in export args, got: %s", expected, joined)
			}
		}
	})

	t.Run("BlendModeCompositingFilterComplex", func(t *testing.T) {
		tempDir := t.TempDir()
		outputFile := filepath.ToSlash(filepath.Join(tempDir, "blend_mode.mp4"))
		projJSON := `{
			"width": 1920,
			"height": 1080,
			"fps": 30,
			"assets": [
				{"id":"a1","name":"v.png","path":"` + filepath.ToSlash(dummyPng) + `","kind":"image","duration":5,"width":1920,"height":1080,"fps":30,"hasAudio":false}
			],
			"tracks": [
				{"id":"v2","name":"V2 Overlay","kind":"video","muted":false,"hidden":false,"solo":false},
				{"id":"v1","name":"V1 Base","kind":"video","muted":false,"hidden":false,"solo":false}
			],
			"clips": [
				{"id":"c1","trackId":"v1","assetId":"a1","name":"c1","start":0,"duration":5,"sourceIn":0,"speed":1},
				{"id":"c2","trackId":"v2","assetId":"a1","name":"c2","start":1,"duration":3,"sourceIn":0,"speed":1,"blendMode":"screen"}
			]
		}`
		optsJSON := `{"path":"` + outputFile + `","encoder":"cpu"}`

		_, _, args, err := app.BuildExportArgs(projJSON, optsJSON)
		if err != nil {
			t.Fatalf("BuildExportArgs error: %v", err)
		}
		joined := strings.Join(args, " ")
		if !strings.Contains(joined, "blend=all_mode=screen") {
			t.Errorf("Expected blend=all_mode=screen in export args when clip.blendMode is screen, got: %s", joined)
		}
	})

	t.Run("AudioOnlyMp3Export", func(t *testing.T) {
		tempDir := t.TempDir()
		outputFile := filepath.ToSlash(filepath.Join(tempDir, "audio_only.mp3"))
		projJSON := `{"width":1920,"height":1080,"fps":30,"clips":[],"tracks":[]}`
		optsJSON := `{"path":"` + outputFile + `","format":"mp3","duration":3}`

		_, _, args, err := app.BuildExportArgs(projJSON, optsJSON)
		if err != nil {
			t.Fatalf("BuildExportArgs error: %v", err)
		}
		joined := strings.Join(args, " ")
		if !strings.Contains(joined, "-vn") || !strings.Contains(joined, "libmp3lame") {
			t.Errorf("Expected -vn and libmp3lame in MP3 export args, got: %s", joined)
		}
	})

	t.Run("SaveMediaCachePathTraversalGuard", func(t *testing.T) {
		savedPath, err := app.SaveMediaCache("../../evil_escape.png", "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
		if err != nil {
			t.Fatalf("SaveMediaCache returned unexpected error: %v", err)
		}
		defer os.Remove(savedPath)
		cacheRoot := filepath.Join(storage.GetCacheDir(), "media")
		if filepath.Dir(savedPath) != cacheRoot {
			t.Errorf("Path traversal escaped cacheDir! got dir=%s, expected=%s", filepath.Dir(savedPath), cacheRoot)
		}
		if filepath.Base(savedPath) != "evil_escape.png" {
			t.Errorf("Expected basename evil_escape.png, got %s", filepath.Base(savedPath))
		}
	})
}
