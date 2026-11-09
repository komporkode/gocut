package project

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestStorageManager_FolderStructureAndPortability(t *testing.T) {
	tempAppDir := t.TempDir()

	// Set environment override to test specific target
	targetDataDir := filepath.Join(tempAppDir, "data")
	t.Setenv("GOCUT_DATA_DIR", targetDataDir)

	sm, err := NewStorageManager()
	if err != nil {
		t.Fatalf("NewStorageManager failed: %v", err)
	}

	info := sm.GetStorageInfo()
	if !info.IsPortable {
		t.Errorf("Expected IsPortable to be true for app-relative data directory")
	}

	// Verify primary folders
	if sm.GetDataDir() != targetDataDir {
		t.Errorf("Expected dataDir %s, got %s", targetDataDir, sm.GetDataDir())
	}
	if !strings.HasPrefix(sm.GetCacheDir(), targetDataDir) {
		t.Errorf("CacheDir %s must be inside dataDir %s", sm.GetCacheDir(), targetDataDir)
	}
	if !strings.HasPrefix(sm.GetTempDir(), targetDataDir) {
		t.Errorf("TempDir %s must be inside dataDir %s", sm.GetTempDir(), targetDataDir)
	}
	if !strings.HasPrefix(sm.GetProjectsDir(), targetDataDir) {
		t.Errorf("ProjectsDir %s must be inside dataDir %s", sm.GetProjectsDir(), targetDataDir)
	}
	if !strings.HasPrefix(sm.GetModelsDir("whisper"), targetDataDir) {
		t.Errorf("ModelsDir %s must be inside dataDir %s", sm.GetModelsDir("whisper"), targetDataDir)
	}

	// Verify subdirectories exist
	expectedDirs := []string{
		filepath.Join(sm.GetCacheDir(), "thumbnails"),
		filepath.Join(sm.GetCacheDir(), "proxies"),
		filepath.Join(sm.GetCacheDir(), "media"),
		filepath.Join(sm.GetCacheDir(), "solids"),
		filepath.Join(sm.GetTempDir(), "subtitles"),
		filepath.Join(sm.GetTempDir(), "logs"),
		filepath.Join(sm.GetTempDir(), "updates"),
		sm.GetModelsDir("whisper"),
		sm.GetProjectsDir(),
	}

	for _, d := range expectedDirs {
		stat, err := os.Stat(d)
		if err != nil || !stat.IsDir() {
			t.Errorf("Expected directory %s to exist, err: %v", d, err)
		}
	}
}

func TestStorageManager_CleanupTemp(t *testing.T) {
	tempAppDir := t.TempDir()
	targetDataDir := filepath.Join(tempAppDir, "data")
	t.Setenv("GOCUT_DATA_DIR", targetDataDir)

	sm, err := NewStorageManager()
	if err != nil {
		t.Fatalf("NewStorageManager failed: %v", err)
	}

	oldFile := filepath.Join(sm.GetTempDir(), "subtitles", "old_sub.ass")
	if err := os.WriteFile(oldFile, []byte("old content"), 0644); err != nil {
		t.Fatalf("Failed to write old temp file: %v", err)
	}
	// Artificially change file modification time to 2 days ago
	twoDaysAgo := time.Now().Add(-48 * time.Hour)
	_ = os.Chtimes(oldFile, twoDaysAgo, twoDaysAgo)

	newFile := filepath.Join(sm.GetTempDir(), "subtitles", "new_sub.ass")
	if err := os.WriteFile(newFile, []byte("new content"), 0644); err != nil {
		t.Fatalf("Failed to write new temp file: %v", err)
	}

	// Run cleanup for files older than 24h
	sm.CleanupTemp(24 * time.Hour)

	if _, err := os.Stat(oldFile); !os.IsNotExist(err) {
		t.Errorf("Expected oldFile to be cleaned up, but it still exists")
	}
	if _, err := os.Stat(newFile); err != nil {
		t.Errorf("Expected newFile to remain, but got error: %v", err)
	}
}

func TestStorageManager_AtomicSaveAndAutosave(t *testing.T) {
	tempAppDir := t.TempDir()
	targetDataDir := filepath.Join(tempAppDir, "data")
	t.Setenv("GOCUT_DATA_DIR", targetDataDir)

	sm, err := NewStorageManager()
	if err != nil {
		t.Fatalf("NewStorageManager failed: %v", err)
	}

	testData := []byte(`{"version": 1, "name": "Atomic Project"}`)
	if err := sm.Autosave(testData); err != nil {
		t.Fatalf("Autosave failed: %v", err)
	}

	readBack, err := sm.ReadAutosave()
	if err != nil {
		t.Fatalf("ReadAutosave failed: %v", err)
	}
	if readBack != string(testData) {
		t.Errorf("Expected autosave content %s, got %s", string(testData), readBack)
	}
}

