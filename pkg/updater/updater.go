package updater

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

// DefaultRepo is the official GitHub repository for GoCut.
const (
	DefaultRepo   = "komporkode/gocut"
	GitHubAPIHost = "https://api.github.com"
)

type UpdateInfo struct {
	Available      bool   `json:"available"`
	CurrentVersion string `json:"currentVersion"`
	LatestVersion  string `json:"latestVersion"`
	ReleaseName    string `json:"releaseName"`
	ReleaseNotes   string `json:"releaseNotes"`
	DownloadUrl    string `json:"downloadUrl"`
	AssetName      string `json:"assetName"`
	AssetSize      int64  `json:"assetSize"`
	PublishedAt    string `json:"publishedAt"`
}

type UpdateProgress struct {
	DownloadedBytes int64   `json:"downloadedBytes"`
	TotalBytes      int64   `json:"totalBytes"`
	Percentage      float64 `json:"percentage"`
	Status          string  `json:"status"` // "idle", "downloading", "completed", "error"
	Error           string  `json:"error,omitempty"`
	InstallerPath   string  `json:"installerPath,omitempty"`
}

type UpdateSettings struct {
	AutoCheck   bool  `json:"autoCheck"`
	LastChecked int64 `json:"lastChecked"`
}

type githubAsset struct {
	Name               string `json:"name"`
	Size               int64  `json:"size"`
	BrowserDownloadURL string `json:"browser_download_url"`
	ContentType        string `json:"content_type"`
}

type githubRelease struct {
	TagName     string        `json:"tag_name"`
	Name        string        `json:"name"`
	Body        string        `json:"body"`
	HtmlURL     string        `json:"html_url"`
	PublishedAt string        `json:"published_at"`
	Draft       bool          `json:"draft"`
	Prerelease  bool          `json:"prerelease"`
	Assets      []githubAsset `json:"assets"`
}

type Manager struct {
	repo       string
	apiBase    string
	configDir  string
	httpClient *http.Client
	mu         sync.RWMutex
	settings   UpdateSettings
}

func NewManager(configDir string) *Manager {
	m := &Manager{
		repo:      DefaultRepo,
		apiBase:   GitHubAPIHost,
		configDir: configDir,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
		settings: UpdateSettings{
			AutoCheck:   true,
			LastChecked: 0,
		},
	}
	m.loadSettings()
	return m
}

func (m *Manager) SetAPIBase(apiBase string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.apiBase = apiBase
}

func (m *Manager) settingsPath() string {
	return filepath.Join(m.configDir, "update_settings.json")
}

func (m *Manager) loadSettings() {
	m.mu.Lock()
	defer m.mu.Unlock()

	data, err := os.ReadFile(m.settingsPath())
	if err == nil {
		var s UpdateSettings
		if err := json.Unmarshal(data, &s); err == nil {
			m.settings = s
			return
		}
	}
	// Default to true
	m.settings.AutoCheck = true
}

func (m *Manager) saveSettings() error {
	data, err := json.MarshalIndent(m.settings, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(m.configDir, 0755); err != nil {
		return err
	}
	return os.WriteFile(m.settingsPath(), data, 0644)
}

func (m *Manager) GetSettings() UpdateSettings {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.settings
}

func (m *Manager) SetAutoCheck(enabled bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.settings.AutoCheck = enabled
	return m.saveSettings()
}

func (m *Manager) TouchLastChecked() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.settings.LastChecked = time.Now().Unix()
	_ = m.saveSettings()
}

// CleanVersion strips prefixes, build metadata, and trailing details.
func CleanVersion(v string) string {
	v = strings.TrimSpace(v)
	v = strings.TrimPrefix(v, "v")
	v = strings.TrimPrefix(v, "V")
	// If version contains spaces (e.g. "0.8.0-beta (GoCut/Wails/Go)"), take first word
	parts := strings.Fields(v)
	if len(parts) > 0 {
		v = parts[0]
	}
	return v
}

// CompareSemVer compares two semantic version strings.
// Returns 1 if v1 > v2, -1 if v1 < v2, and 0 if v1 == v2.
func CompareSemVer(v1, v2 string) int {
	clean1 := CleanVersion(v1)
	clean2 := CleanVersion(v2)

	re := regexp.MustCompile(`^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?`)
	m1 := re.FindStringSubmatch(clean1)
	m2 := re.FindStringSubmatch(clean2)

	if m1 == nil && m2 == nil {
		return 0
	}
	if m1 == nil {
		return -1
	}
	if m2 == nil {
		return 1
	}

	for i := 1; i <= 3; i++ {
		num1, num2 := 0, 0
		if i < len(m1) && m1[i] != "" {
			num1, _ = strconv.Atoi(m1[i])
		}
		if i < len(m2) && m2[i] != "" {
			num2, _ = strconv.Atoi(m2[i])
		}
		if num1 > num2 {
			return 1
		}
		if num1 < num2 {
			return -1
		}
	}

	pre1 := ""
	pre2 := ""
	if len(m1) > 4 {
		pre1 = m1[4]
	}
	if len(m2) > 4 {
		pre2 = m2[4]
	}

	// In semver: a version without prerelease has higher precedence than with prerelease
	// e.g. "0.8.0" > "0.8.0-beta"
	if pre1 == "" && pre2 != "" {
		return 1
	}
	if pre1 != "" && pre2 == "" {
		return -1
	}
	if pre1 == "" && pre2 == "" {
		return 0
	}

	parts1 := strings.Split(pre1, ".")
	parts2 := strings.Split(pre2, ".")
	maxLen := len(parts1)
	if len(parts2) > maxLen {
		maxLen = len(parts2)
	}
	for i := 0; i < maxLen; i++ {
		if i >= len(parts1) {
			return -1
		}
		if i >= len(parts2) {
			return 1
		}
		p1, p2 := parts1[i], parts2[i]
		n1, err1 := strconv.Atoi(p1)
		n2, err2 := strconv.Atoi(p2)
		if err1 == nil && err2 == nil {
			if n1 > n2 {
				return 1
			}
			if n1 < n2 {
				return -1
			}
			continue
		}
		// Numeric identifiers have lower precedence than non-numeric identifiers in SemVer 2.0.0
		if err1 == nil && err2 != nil {
			return -1
		}
		if err1 != nil && err2 == nil {
			return 1
		}
		if p1 > p2 {
			return 1
		}
		if p1 < p2 {
			return -1
		}
	}
	return 0
}

// CheckForUpdate queries the GitHub Releases API for the latest release.
func (m *Manager) CheckForUpdate(currentVersion string, force bool) (*UpdateInfo, error) {
	cleanCurrent := CleanVersion(currentVersion)
	latestURL := fmt.Sprintf("%s/repos/%s/releases/latest", m.apiBase, m.repo)

	req, err := http.NewRequest("GET", latestURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create update request: %w", err)
	}
	req.Header.Set("User-Agent", fmt.Sprintf("GoCut-App/%s", cleanCurrent))
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("gagal terhubung ke GitHub Release: %w", err)
	}
	defer resp.Body.Close()

	var rel githubRelease
	if resp.StatusCode == http.StatusNotFound {
		// GitHub /releases/latest returns 404 when all releases are prereleases (e.g. v0.9.0-beta).
		// Fallback to /releases?per_page=10 to find the newest non-draft release.
		listURL := fmt.Sprintf("%s/repos/%s/releases?per_page=10", m.apiBase, m.repo)
		listReq, listErr := http.NewRequest("GET", listURL, nil)
		if listErr == nil {
			listReq.Header.Set("User-Agent", fmt.Sprintf("GoCut-App/%s", cleanCurrent))
			listReq.Header.Set("Accept", "application/vnd.github.v3+json")
			if listResp, doErr := m.httpClient.Do(listReq); doErr == nil {
				defer listResp.Body.Close()
				if listResp.StatusCode == http.StatusOK {
					var releases []githubRelease
					if decErr := json.NewDecoder(listResp.Body).Decode(&releases); decErr == nil {
						for _, candidate := range releases {
							if !candidate.Draft {
								rel = candidate
								break
							}
						}
					}
				}
			}
		}
		m.TouchLastChecked()
		if rel.TagName == "" {
			return &UpdateInfo{
				Available:      false,
				CurrentVersion: cleanCurrent,
			}, nil
		}
	} else if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API mengembalikan status %d", resp.StatusCode)
	} else {
		if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
			return nil, fmt.Errorf("gagal membaca data rilis GitHub: %w", err)
		}
		m.TouchLastChecked()
	}

	latestClean := CleanVersion(rel.TagName)
	isNewer := CompareSemVer(latestClean, cleanCurrent) > 0

	// Select best installer asset (.exe) for Windows / target OS
	var bestAsset *githubAsset
	for i := range rel.Assets {
		asset := &rel.Assets[i]
		lower := strings.ToLower(asset.Name)
		if strings.HasSuffix(lower, ".exe") {
			if strings.Contains(lower, "setup-x64") {
				bestAsset = asset
				break
			}
			if bestAsset == nil || strings.Contains(lower, "setup") {
				bestAsset = asset
			}
		}
	}

	info := &UpdateInfo{
		Available:      isNewer && bestAsset != nil,
		CurrentVersion: cleanCurrent,
		LatestVersion:  latestClean,
		ReleaseName:    rel.Name,
		ReleaseNotes:   rel.Body,
		PublishedAt:    rel.PublishedAt,
	}

	if bestAsset != nil {
		info.AssetName = bestAsset.Name
		info.AssetSize = bestAsset.Size
		info.DownloadUrl = bestAsset.BrowserDownloadURL
	}

	return info, nil
}

func isAllowedDownloadURL(parsed *url.URL) bool {
	if parsed == nil {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	scheme := strings.ToLower(parsed.Scheme)
	// Allow local test servers on loopback
	if (host == "127.0.0.1" || host == "localhost" || host == "::1") && (scheme == "http" || scheme == "https") {
		return true
	}
	if scheme != "https" {
		return false
	}
	return host == "github.com" ||
		host == "api.github.com" ||
		host == "objects.githubusercontent.com" ||
		strings.HasSuffix(host, ".githubusercontent.com") ||
		strings.HasSuffix(host, ".github.com")
}

// DownloadUpdate downloads the update file and notifies progress.
func (m *Manager) DownloadUpdate(ctx context.Context, downloadUrl string, onProgress func(UpdateProgress)) (string, error) {
	if strings.TrimSpace(downloadUrl) == "" {
		return "", fmt.Errorf("URL unduhan tidak valid")
	}

	parsedURL, err := url.Parse(downloadUrl)
	if err != nil || !isAllowedDownloadURL(parsedURL) {
		return "", fmt.Errorf("URL unduhan tidak diizinkan atau tidak valid")
	}

	req, err := http.NewRequestWithContext(ctx, "GET", downloadUrl, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "GoCut-App-Downloader")

	client := &http.Client{
		Timeout: 30 * time.Minute, // Large installer downloads
	}

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("gagal mengunduh berkas installer: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("server download mengembalikan status %d", resp.StatusCode)
	}

	contentType := strings.ToLower(resp.Header.Get("Content-Type"))
	if strings.Contains(contentType, "text/html") {
		return "", fmt.Errorf("URL unduhan mengembalikan halaman HTML, bukan berkas installer")
	}

	totalBytes := resp.ContentLength
	tempDir := m.GetUpdatesDir()
	if err := os.MkdirAll(tempDir, 0755); err != nil {
		return "", fmt.Errorf("gagal menyiapkan direktori unduhan: %w", err)
	}

	fileName := filepath.Base(parsedURL.Path)
	fileName = regexp.MustCompile(`[<>:"/\\|?*\x00-\x1f]`).ReplaceAllString(fileName, "_")
	if !strings.HasSuffix(strings.ToLower(fileName), ".exe") || fileName == ".exe" {
		fileName = "GoCut-Setup-Update.exe"
	}
	targetPath := filepath.Join(tempDir, fileName)
	partPath := targetPath + ".part"

	outFile, err := os.Create(partPath)
	if err != nil {
		return "", fmt.Errorf("gagal membuat berkas sementara: %w", err)
	}

	buf := make([]byte, 64*1024)
	var downloaded int64
	lastReport := time.Now()

	for {
		select {
		case <-ctx.Done():
			_ = outFile.Close()
			_ = os.Remove(partPath)
			return "", ctx.Err()
		default:
		}

		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, writeErr := outFile.Write(buf[:n]); writeErr != nil {
				_ = outFile.Close()
				_ = os.Remove(partPath)
				return "", writeErr
			}
			downloaded += int64(n)

			if time.Since(lastReport) > 150*time.Millisecond || downloaded == totalBytes {
				lastReport = time.Now()
				percentage := 0.0
				if totalBytes > 0 {
					percentage = mathMin(100.0, float64(downloaded)/float64(totalBytes)*100.0)
				}
				if onProgress != nil {
					onProgress(UpdateProgress{
						DownloadedBytes: downloaded,
						TotalBytes:      totalBytes,
						Percentage:      percentage,
						Status:          "downloading",
						InstallerPath:   targetPath,
					})
				}
			}
		}

		if readErr != nil {
			if readErr == io.EOF {
				break
			}
			_ = outFile.Close()
			_ = os.Remove(partPath)
			return "", readErr
		}
	}

	if err := outFile.Close(); err != nil {
		_ = os.Remove(partPath)
		return "", err
	}

	if totalBytes > 0 && downloaded != totalBytes {
		_ = os.Remove(partPath)
		return "", fmt.Errorf("unduhan tidak lengkap (%d dari %d byte)", downloaded, totalBytes)
	}

	_ = os.Remove(targetPath)
	if err := os.Rename(partPath, targetPath); err != nil {
		_ = os.Remove(partPath)
		return "", fmt.Errorf("gagal memfinalisasi berkas installer: %w", err)
	}

	if onProgress != nil {
		onProgress(UpdateProgress{
			DownloadedBytes: downloaded,
			TotalBytes:      totalBytes,
			Percentage:      100.0,
			Status:          "completed",
			InstallerPath:   targetPath,
		})
	}

	return targetPath, nil
}

func mathMin(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

// GetUpdatesDir returns the folder where downloaded installer updates are staged.
func (m *Manager) GetUpdatesDir() string {
	if m.configDir != "" {
		dir := filepath.Join(m.configDir, "tmp", "updates")
		if stat, err := os.Stat(filepath.Join(m.configDir, "Tmp", "updates")); err == nil && stat.IsDir() {
			dir = filepath.Join(m.configDir, "Tmp", "updates")
		}
		_ = os.MkdirAll(dir, 0755)
		return dir
	}
	dir := filepath.Join(os.TempDir(), "gocut_updates")
	_ = os.MkdirAll(dir, 0755)
	return dir
}

// ValidateInstallerPath ensures installerPath is a valid .exe inside an authorized update directory.
func ValidateInstallerPath(installerPath string) (string, error) {
	m := &Manager{}
	return m.ValidateInstaller(installerPath)
}

// ValidateInstaller ensures installerPath is a valid .exe inside an authorized update directory.
func (m *Manager) ValidateInstaller(installerPath string) (string, error) {
	if strings.TrimSpace(installerPath) == "" {
		return "", fmt.Errorf("jalur berkas installer kosong")
	}
	absPath, err := filepath.Abs(filepath.Clean(installerPath))
	if err != nil {
		return "", err
	}
	allowedDirs := []string{m.GetUpdatesDir(), filepath.Join(os.TempDir(), "gocut_updates")}
	allowed := false
	lowerTarget := strings.ToLower(absPath)
	for _, dir := range allowedDirs {
		if absDir, err := filepath.Abs(dir); err == nil {
			lowerTemp := strings.ToLower(absDir) + string(filepath.Separator)
			if strings.HasPrefix(lowerTarget, lowerTemp) {
				allowed = true
				break
			}
		}
	}
	if !allowed || !strings.HasSuffix(lowerTarget, ".exe") {
		return "", fmt.Errorf("jalur berkas installer berada di luar direktori pembaruan resmi: %s", absPath)
	}
	stat, err := os.Stat(absPath)
	if err != nil || stat.IsDir() {
		return "", fmt.Errorf("berkas installer tidak ditemukan: %s", absPath)
	}
	return absPath, nil
}

// InstallUpdate launches the downloaded installer and gracefully exits GoCut.
func (m *Manager) InstallUpdate(installerPath string) error {
	cleanPath, err := m.ValidateInstaller(installerPath)
	if err != nil {
		return err
	}

	if runtime.GOOS == "windows" {
		// Launch installer with close & restart flags
		cmd := exec.Command(cleanPath, "/CLOSEAPPLICATIONS", "/RESTARTAPPLICATIONS")
		if err := cmd.Start(); err != nil {
			return fmt.Errorf("gagal menjalankan installer: %w", err)
		}

		// Exit current application to allow clean upgrade
		go func() {
			time.Sleep(500 * time.Millisecond)
			os.Exit(0)
		}()
		return nil
	}

	return fmt.Errorf("instalasi otomatis saat ini hanya didukung di Windows")
}

