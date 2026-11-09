package updater

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestCompareSemVer(t *testing.T) {
	tests := []struct {
		v1       string
		v2       string
		expected int
	}{
		{"0.8.0", "0.8.1", -1},
		{"0.8.1", "0.8.0", 1},
		{"0.8.0", "0.8.0", 0},
		{"v0.8.0", "0.8.0", 0},
		{"v1.0.0", "v0.9.9", 1},
		{"0.8.0-beta", "0.8.0", -1},
		{"0.8.0", "0.8.0-beta", 1},
		{"0.8.0-beta (GoCut/Wails/Go)", "0.8.1", -1},
		{"0.8.0-beta", "0.8.0-beta", 0},
		{"0.8.0-alpha", "0.8.0-beta", -1},
		{"0.9.0-beta.2", "0.9.0-beta.10", -1},
		{"0.9.0-beta.10", "0.9.0-beta.2", 1},
		{"0.9.0-beta", "0.9.0-beta.1", -1},
	}

	for _, tt := range tests {
		res := CompareSemVer(tt.v1, tt.v2)
		if res != tt.expected {
			t.Errorf("CompareSemVer(%q, %q) = %d; want %d", tt.v1, tt.v2, res, tt.expected)
		}
	}
}

func TestSettingsLoadAndSave(t *testing.T) {
	tmpDir := t.TempDir()
	mgr := NewManager(tmpDir)

	s1 := mgr.GetSettings()
	if !s1.AutoCheck {
		t.Errorf("expected default AutoCheck to be true, got false")
	}

	if err := mgr.SetAutoCheck(false); err != nil {
		t.Fatalf("failed to set AutoCheck: %v", err)
	}

	// Verify persistence in new instance
	mgr2 := NewManager(tmpDir)
	s2 := mgr2.GetSettings()
	if s2.AutoCheck {
		t.Errorf("expected persisted AutoCheck to be false, got true")
	}

	mgr2.TouchLastChecked()
	s3 := mgr2.GetSettings()
	if s3.LastChecked == 0 {
		t.Errorf("expected LastChecked to be updated, got 0")
	}
}

func TestCheckForUpdate(t *testing.T) {
	mockRelease := githubRelease{
		TagName:     "v0.8.5",
		Name:        "GoCut 0.8.5 Beta",
		Body:        "- Added auto-updater\n- Improved timeline snapping",
		HtmlURL:     "https://github.com/komporkode/gocut/releases/tag/v0.8.5",
		PublishedAt: "2026-11-04T10:00:00Z",
		Assets: []githubAsset{
			{
				Name:               "GoCut-Setup-x64.exe",
				Size:               52428800,
				BrowserDownloadURL: "https://example.com/GoCut-Setup-x64.exe",
			},
			{
				Name:               "GoCut-WebSetup.exe",
				Size:               2097152,
				BrowserDownloadURL: "https://example.com/GoCut-WebSetup.exe",
			},
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(mockRelease)
	}))
	defer server.Close()

	tmpDir := t.TempDir()
	mgr := NewManager(tmpDir)
	mgr.SetAPIBase(server.URL)

	// Case 1: Newer version available
	info, err := mgr.CheckForUpdate("0.8.0", true)
	if err != nil {
		t.Fatalf("CheckForUpdate failed: %v", err)
	}
	if !info.Available {
		t.Errorf("expected Available to be true, got false")
	}
	if info.LatestVersion != "0.8.5" {
		t.Errorf("expected LatestVersion to be 0.8.5, got %q", info.LatestVersion)
	}
	if info.AssetName != "GoCut-Setup-x64.exe" {
		t.Errorf("expected AssetName to be GoCut-Setup-x64.exe, got %q", info.AssetName)
	}

	// Case 2: Current is newer or equal
	infoSame, err := mgr.CheckForUpdate("0.8.5", true)
	if err != nil {
		t.Fatalf("CheckForUpdate failed: %v", err)
	}
	if infoSame.Available {
		t.Errorf("expected Available to be false for same version, got true")
	}
}

func TestDownloadUpdate(t *testing.T) {
	fileContent := "dummy executable installer payload content"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "42")
		_, _ = w.Write([]byte(fileContent))
	}))
	defer server.Close()

	tmpDir := t.TempDir()
	mgr := NewManager(tmpDir)

	var reports []UpdateProgress
	path, err := mgr.DownloadUpdate(context.Background(), server.URL+"/test-setup.exe", func(p UpdateProgress) {
		reports = append(reports, p)
	})

	if err != nil {
		t.Fatalf("DownloadUpdate failed: %v", err)
	}
	defer os.Remove(path)

	if _, err := os.Stat(path); err != nil {
		t.Fatalf("downloaded file does not exist: %v", err)
	}

	data, _ := os.ReadFile(path)
	if string(data) != fileContent {
		t.Errorf("downloaded content mismatch: got %q, want %q", string(data), fileContent)
	}

	if len(reports) == 0 {
		t.Errorf("expected progress reports, got none")
	}
	last := reports[len(reports)-1]
	if last.Status != "completed" {
		t.Errorf("expected final status to be completed, got %q", last.Status)
	}
}

func TestInstallUpdateValidation(t *testing.T) {
	mgr := NewManager(t.TempDir())
	nonExistent := filepath.Join(t.TempDir(), "nonexistent.exe")
	err := mgr.InstallUpdate(nonExistent)
	if err == nil {
		t.Errorf("expected error for non-existent installer, got nil")
	}

	// Security test: reject existing .exe outside gocut_updates temp directory
	outsideExe := filepath.Join(t.TempDir(), "outside.exe")
	_ = os.WriteFile(outsideExe, []byte("MZ"), 0644)
	if _, err := ValidateInstallerPath(outsideExe); err == nil {
		t.Errorf("expected ValidateInstallerPath to reject .exe outside gocut_updates, got nil")
	}

	// Security test: reject non-.exe file inside gocut_updates
	updatesDir := filepath.Join(os.TempDir(), "gocut_updates")
	_ = os.MkdirAll(updatesDir, 0755)
	batFile := filepath.Join(updatesDir, "payload.bat")
	_ = os.WriteFile(batFile, []byte("echo hi"), 0644)
	defer os.Remove(batFile)
	if _, err := ValidateInstallerPath(batFile); err == nil {
		t.Errorf("expected ValidateInstallerPath to reject non-.exe file, got nil")
	}
}

func TestCheckForUpdatePrereleaseFallbackAndMissingAsset(t *testing.T) {
	prereleaseList := []githubRelease{
		{
			TagName:     "v0.9.5-beta",
			Name:        "GoCut 0.9.5 Beta",
			Draft:       false,
			Prerelease:  true,
			PublishedAt: "2026-11-05T12:00:00Z",
			Assets: []githubAsset{
				{
					Name:               "GoCut-Setup-x64.exe",
					Size:               1024,
					BrowserDownloadURL: "https://github.com/komporkode/gocut/releases/download/v0.9.5-beta/GoCut-Setup-x64.exe",
				},
			},
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/repos/komporkode/gocut/releases/latest" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(prereleaseList)
	}))
	defer server.Close()

	mgr := NewManager(t.TempDir())
	mgr.SetAPIBase(server.URL)

	info, err := mgr.CheckForUpdate("0.9.0-beta", true)
	if err != nil {
		t.Fatalf("CheckForUpdate fallback failed: %v", err)
	}
	if !info.Available {
		t.Errorf("expected Available to be true via prerelease fallback, got false")
	}
	if info.LatestVersion != "0.9.5-beta" {
		t.Errorf("expected LatestVersion 0.9.5-beta, got %q", info.LatestVersion)
	}

	// Now test when release has no .exe assets (only source/HTML): Available must be false
	prereleaseList[0].Assets = nil
	infoNoExe, err := mgr.CheckForUpdate("0.9.0-beta", true)
	if err != nil {
		t.Fatalf("CheckForUpdate failed: %v", err)
	}
	if infoNoExe.Available {
		t.Errorf("expected Available to be false when release has no .exe installer asset")
	}
	if infoNoExe.DownloadUrl != "" {
		t.Errorf("expected empty DownloadUrl when no .exe asset exists, got %q", infoNoExe.DownloadUrl)
	}
}

func TestDownloadUpdateQueryStringsAndSecurity(t *testing.T) {
	fileContent := "MZ-valid-installer-binary-content"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/html-page" {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte("<html>not an installer</html>"))
			return
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		_, _ = w.Write([]byte(fileContent))
	}))
	defer server.Close()

	mgr := NewManager(t.TempDir())

	// 1. Query string in URL must not break Windows file creation
	path, err := mgr.DownloadUpdate(context.Background(), server.URL+"/GoCut-Setup-x64.exe?X-Amz-SignedHeaders=host&token=123", nil)
	if err != nil {
		t.Fatalf("DownloadUpdate with query params failed: %v", err)
	}
	defer os.Remove(path)
	if filepath.Base(path) != "GoCut-Setup-x64.exe" {
		t.Errorf("expected clean filename GoCut-Setup-x64.exe, got %q", filepath.Base(path))
	}

	// 2. Untrusted external domain must be rejected
	if _, err := mgr.DownloadUpdate(context.Background(), "https://evil-attacker.example.com/GoCut-Setup.exe", nil); err == nil {
		t.Errorf("expected untrusted domain to be rejected, got nil")
	}

	// 3. HTML response must be rejected
	if _, err := mgr.DownloadUpdate(context.Background(), server.URL+"/html-page", nil); err == nil {
		t.Errorf("expected text/html response to be rejected, got nil")
	}
}


