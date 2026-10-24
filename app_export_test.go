package main

import (
	"os"
	"path/filepath"
	"syscall"
	"testing"

	"reacut/pkg/capcut"
	"reacut/pkg/ffmpeg"
	"reacut/pkg/media"
	"reacut/pkg/project"
)

func TestUserProjectExport(t *testing.T) {
	appData := os.Getenv("APPDATA")
	autosavePath := filepath.Join(appData, "reacut", "autosave.reacut")
	content, err := os.ReadFile(autosavePath)
	if err != nil {
		t.Skipf("Autosave file not found: %v", err)
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
}
