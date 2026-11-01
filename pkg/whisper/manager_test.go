package whisper

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWhisperManager(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "whisper_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	mgr := NewManager(tempDir)
	models := mgr.ListModels()
	if len(models) != 3 {
		t.Fatalf("expected 3 models, got %d", len(models))
	}
	if models[0].Installed {
		t.Fatal("expected model to be not installed initially")
	}

	fakeModel := filepath.Join(tempDir, "source.bin")
	_ = os.WriteFile(fakeModel, []byte("fake model data"), 0644)

	if err := mgr.ImportModel(fakeModel); err != nil {
		t.Fatalf("failed to import model: %v", err)
	}

	importedPath := filepath.Join(tempDir, "source.bin")
	if _, err := os.Stat(importedPath); err != nil {
		t.Fatal("imported file does not exist")
	}
}
