package media

import (
	"os"
	"testing"
)

func TestResolveMediaPath(t *testing.T) {
	files := []string{
		"@ps_exp_s01_render_03s_360p_20261023153706.mp4",
		"@ps_exp_s02_render_03s_360p_20261023153706.mp4",
		"sumu-2.mp3",
		"Anin (2).png",
	}

	for _, targetName := range files {
		resolved, err := ResolvePath(targetName)
		if err != nil {
			t.Logf("Notice: Failed to resolve %s: %v", targetName, err)
			continue
		}
		if info, err := os.Stat(resolved); err != nil || info.IsDir() {
			t.Fatalf("Resolved path does not exist or is dir: %s", resolved)
		}
		t.Logf("Successfully resolved %s -> %s", targetName, resolved)
	}
}

func TestResolveSolidColor(t *testing.T) {
	solidPath := "solid:#00ff00"
	resolved, err := ResolvePath(solidPath)
	if err != nil {
		t.Fatalf("Failed to resolve solid color path: %v", err)
	}
	info, err := os.Stat(resolved)
	if err != nil || info.IsDir() {
		t.Fatalf("Resolved solid path does not exist or is dir: %s", resolved)
	}
	content, err := os.ReadFile(resolved)
	if err != nil {
		t.Fatalf("Failed to read resolved solid file: %v", err)
	}
	if len(content) == 0 {
		t.Fatalf("Resolved solid SVG is empty")
	}
}

