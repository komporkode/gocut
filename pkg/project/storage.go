package project

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type RecentEntry struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	UpdatedAt string `json:"updatedAt"`
}

type ProjectEntry struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Path      string  `json:"path"`
	Cover     string  `json:"cover,omitempty"`
	SizeBytes int64   `json:"sizeBytes"`
	Duration  float64 `json:"duration"`
	UpdatedAt string  `json:"updatedAt"`
}

type StorageInfo struct {
	DataDir     string `json:"dataDir"`
	ActiveDrive string `json:"activeDrive"`
	IsPortable  bool   `json:"isPortable"`
	ProjectsDir string `json:"projectsDir"`
	CacheDir    string `json:"cacheDir"`
	TempDir     string `json:"tempDir"`
	ModelsDir   string `json:"modelsDir"`
}

type StorageManager struct {
	configDir  string
	isPortable bool
}

func migrateLegacyDataIfEmpty(targetDir string) {
	// If targetDir already has autosave or recent, no migration needed
	if _, err := os.Stat(filepath.Join(targetDir, "autosave.gct")); err == nil {
		return
	}

	base, err := os.UserConfigDir()
	if err != nil {
		return
	}
	legacyLocations := []string{
		filepath.Join(base, "ReaCut"),
		filepath.Join(base, "GoCut"),
	}

	for _, loc := range legacyLocations {
		// Copy autosave if present
		for _, name := range []string{"autosave.gct", "autosave.reacut"} {
			src := filepath.Join(loc, name)
			if content, err := os.ReadFile(src); err == nil && len(content) > 0 {
				dst := filepath.Join(targetDir, "autosave.gct")
				_ = os.WriteFile(dst, content, 0644)
				break
			}
		}
		// Copy recent.json if present
		srcRecent := filepath.Join(loc, "recent.json")
		dstRecent := filepath.Join(targetDir, "recent.json")
		if _, err := os.Stat(dstRecent); os.IsNotExist(err) {
			if content, err := os.ReadFile(srcRecent); err == nil && len(content) > 0 {
				_ = os.WriteFile(dstRecent, content, 0644)
			}
		}
	}
}

func resolveDataDir() (string, bool) {
	// 1. Explicit environment variable override
	if custom := os.Getenv("GOCUT_DATA_DIR"); custom != "" {
		clean := filepath.Clean(custom)
		if err := os.MkdirAll(clean, 0755); err == nil {
			return clean, true
		}
	}

	execPath, err := os.Executable()
	var execDir string
	if err == nil {
		execDir = filepath.Dir(execPath)
		cfgFile := filepath.Join(execDir, "config.json")
		if data, err := os.ReadFile(cfgFile); err == nil {
			var cfg struct {
				DataDir string `json:"dataDir"`
			}
			if err := json.Unmarshal(data, &cfg); err == nil && cfg.DataDir != "" {
				if stat, err := os.Stat(cfg.DataDir); err == nil && stat.IsDir() {
					return cfg.DataDir, false
				}
			}
		}
	}

	// 2. Detect GoCut application base directory
	// In dev mode (e.g. running under build/bin or wails dev), detect project repository root
	appRoot := execDir
	if execDir != "" {
		if stat, err := os.Stat(filepath.Join(execDir, "..", "..", "package.json")); err == nil && !stat.IsDir() {
			appRoot = filepath.Clean(filepath.Join(execDir, "..", ".."))
		} else if stat, err := os.Stat(filepath.Join(execDir, "..", "package.json")); err == nil && !stat.IsDir() {
			appRoot = filepath.Clean(filepath.Join(execDir, ".."))
		}
	}
	if appRoot == "" {
		if wd, err := os.Getwd(); err == nil {
			appRoot = wd
		}
	}

	// 3. Primary: Self-contained data folder inside GoCut directory (<appRoot>/data)
	if appRoot != "" {
		candidate := filepath.Join(appRoot, "data")
		if err := os.MkdirAll(candidate, 0755); err == nil {
			// Probe write access to guarantee the folder is usable
			probe := filepath.Join(candidate, ".probe_writable")
			if err := os.WriteFile(probe, []byte("ok"), 0644); err == nil {
				_ = os.Remove(probe)
				migrateLegacyDataIfEmpty(candidate)
				return candidate, true
			}
		}
	}

	// 4. Fallback if app directory is strictly read-only (e.g. restricted Program Files)
	base, err := os.UserConfigDir()
	if err != nil {
		base = os.TempDir()
	}
	fallback := filepath.Join(base, "GoCut", "data")
	_ = os.MkdirAll(fallback, 0755)
	migrateLegacyDataIfEmpty(fallback)
	return fallback, false
}

func NewStorageManager() (*StorageManager, error) {
	dir, portable := resolveDataDir()
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create app data directory: %w", err)
	}
	mgr := &StorageManager{configDir: dir, isPortable: portable}
	_ = os.MkdirAll(mgr.GetProjectsDir(), 0755)
	_ = os.MkdirAll(mgr.GetCacheDir(), 0755)
	_ = os.MkdirAll(mgr.GetTempDir(), 0755)
	_ = os.MkdirAll(filepath.Join(mgr.GetCacheDir(), "thumbnails"), 0755)
	_ = os.MkdirAll(filepath.Join(mgr.GetCacheDir(), "proxies"), 0755)
	_ = os.MkdirAll(filepath.Join(mgr.GetCacheDir(), "media"), 0755)
	_ = os.MkdirAll(filepath.Join(mgr.GetCacheDir(), "solids"), 0755)
	_ = os.MkdirAll(filepath.Join(mgr.GetTempDir(), "subtitles"), 0755)
	_ = os.MkdirAll(filepath.Join(mgr.GetTempDir(), "logs"), 0755)
	_ = os.MkdirAll(filepath.Join(mgr.GetTempDir(), "updates"), 0755)
	_ = os.MkdirAll(mgr.GetModelsDir("whisper"), 0755)
	return mgr, nil
}

func (s *StorageManager) GetDataDir() string {
	return s.configDir
}

func (s *StorageManager) GetProjectsDir() string {
	dir := filepath.Join(s.configDir, "projects")
	if stat, err := os.Stat(filepath.Join(s.configDir, "Projects")); err == nil && stat.IsDir() {
		dir = filepath.Join(s.configDir, "Projects")
	}
	_ = os.MkdirAll(dir, 0755)
	return dir
}

func (s *StorageManager) GetCacheDir() string {
	dir := filepath.Join(s.configDir, "cache")
	if stat, err := os.Stat(filepath.Join(s.configDir, "Cache")); err == nil && stat.IsDir() {
		dir = filepath.Join(s.configDir, "Cache")
	}
	_ = os.MkdirAll(dir, 0755)
	return dir
}

func (s *StorageManager) GetTempDir() string {
	dir := filepath.Join(s.configDir, "tmp")
	if stat, err := os.Stat(filepath.Join(s.configDir, "Tmp")); err == nil && stat.IsDir() {
		dir = filepath.Join(s.configDir, "Tmp")
	}
	_ = os.MkdirAll(dir, 0755)
	return dir
}

func (s *StorageManager) GetModelsDir(sub string) string {
	base := filepath.Join(s.configDir, "models")
	if stat, err := os.Stat(filepath.Join(s.configDir, "Models")); err == nil && stat.IsDir() {
		base = filepath.Join(s.configDir, "Models")
	}
	dir := filepath.Join(base, sub)
	_ = os.MkdirAll(dir, 0755)
	return dir
}

func (s *StorageManager) CleanupTemp(maxAge time.Duration) {
	tempDir := s.GetTempDir()
	cutoff := time.Now().Add(-maxAge)
	_ = filepath.Walk(tempDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || path == tempDir {
			return nil
		}
		if !info.IsDir() && info.ModTime().Before(cutoff) {
			_ = os.Remove(path)
		}
		return nil
	})
}

func (s *StorageManager) GetStorageInfo() StorageInfo {
	drive := filepath.VolumeName(s.configDir)
	if drive == "" && len(s.configDir) > 0 {
		drive = string(s.configDir[0]) + ":"
	}
	return StorageInfo{
		DataDir:     s.configDir,
		ActiveDrive: drive,
		IsPortable:  s.isPortable,
		ProjectsDir: s.GetProjectsDir(),
		CacheDir:    s.GetCacheDir(),
		TempDir:     s.GetTempDir(),
		ModelsDir:   s.GetModelsDir("whisper"),
	}
}

func (s *StorageManager) RelocateDataDir(newDriveRoot string) error {
	cleanDrive := strings.TrimRight(newDriveRoot, "\\/")
	targetData := filepath.Join(cleanDrive, "GoCut", "data")
	if err := os.MkdirAll(targetData, 0755); err != nil {
		return err
	}
	if execPath, err := os.Executable(); err == nil {
		execDir := filepath.Dir(execPath)
		cfgFile := filepath.Join(execDir, "config.json")
		cfgData := map[string]string{"dataDir": targetData}
		if bytes, err := json.MarshalIndent(cfgData, "", "  "); err == nil {
			_ = os.WriteFile(cfgFile, bytes, 0644)
		}
	}
	s.configDir = targetData
	s.isPortable = false
	_ = os.MkdirAll(s.GetProjectsDir(), 0755)
	_ = os.MkdirAll(s.GetCacheDir(), 0755)
	_ = os.MkdirAll(s.GetTempDir(), 0755)
	_ = os.MkdirAll(s.GetModelsDir("whisper"), 0755)
	return nil
}

// SaveAtomic writes data to a temporary file first and renames it atomically
// to prevent corruption during sudden power loss or process interruption.
func (s *StorageManager) SaveAtomic(filePath string, data []byte) error {
	dir := filepath.Dir(filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	tmpFile := filePath + fmt.Sprintf(".tmp-%d", time.Now().UnixNano())
	if err := os.WriteFile(tmpFile, data, 0644); err != nil {
		return err
	}
	if err := os.Rename(tmpFile, filePath); err != nil {
		// On Windows, if destination exists, rename might fail; remove first if needed
		_ = os.Remove(filePath)
		if retryErr := os.Rename(tmpFile, filePath); retryErr != nil {
			_ = os.Remove(tmpFile)
			return retryErr
		}
	}
	return nil
}

func (s *StorageManager) Autosave(data []byte) error {
	target := filepath.Join(s.configDir, "autosave.gct")
	return s.SaveAtomic(target, data)
}

func (s *StorageManager) ReadAutosave() (string, error) {
	target := filepath.Join(s.configDir, "autosave.gct")
	content, err := os.ReadFile(target)
	if err != nil {
		if os.IsNotExist(err) {
			// Fallback to legacy autosave.reacut if present
			legacy := filepath.Join(s.configDir, "autosave.reacut")
			if legContent, legErr := os.ReadFile(legacy); legErr == nil {
				return string(legContent), nil
			}
			return "", nil
		}
		return "", err
	}
	return string(content), nil
}

func (s *StorageManager) GetRecent() ([]RecentEntry, error) {
	recentFile := filepath.Join(s.configDir, "recent.json")
	content, err := os.ReadFile(recentFile)
	if err != nil {
		if os.IsNotExist(err) {
			return []RecentEntry{}, nil
		}
		return nil, err
	}
	var entries []RecentEntry
	if err := json.Unmarshal(content, &entries); err != nil {
		return []RecentEntry{}, nil
	}

	var valid []RecentEntry
	changed := false
	for _, e := range entries {
		if strings.HasPrefix(e.Path, "/projects/") {
			changed = true
			continue
		}
		if _, err := os.Stat(e.Path); err != nil {
			changed = true
			continue
		}
		valid = append(valid, e)
	}

	if changed {
		data, mErr := json.MarshalIndent(valid, "", "  ")
		if mErr == nil {
			_ = s.SaveAtomic(recentFile, data)
		}
	}

	return valid, nil
}

func (s *StorageManager) RemoveRecent(path string) error {
	recentFile := filepath.Join(s.configDir, "recent.json")
	content, err := os.ReadFile(recentFile)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	var entries []RecentEntry
	if err := json.Unmarshal(content, &entries); err != nil {
		return nil
	}
	var filtered []RecentEntry
	for _, e := range entries {
		if e.Path != path {
			filtered = append(filtered, e)
		}
	}
	data, err := json.MarshalIndent(filtered, "", "  ")
	if err != nil {
		return err
	}
	return s.SaveAtomic(recentFile, data)
}

func (s *StorageManager) AddRecent(name, path string) error {
	if strings.HasPrefix(path, "/projects/") {
		return nil
	}
	entries, _ := s.GetRecent()
	var filtered []RecentEntry
	for _, e := range entries {
		if e.Path != path {
			filtered = append(filtered, e)
		}
	}
	newEntry := RecentEntry{
		Name:      name,
		Path:      path,
		UpdatedAt: time.Now().Format(time.RFC3339),
	}
	filtered = append([]RecentEntry{newEntry}, filtered...)
	if len(filtered) > 20 {
		filtered = filtered[:20]
	}
	sort.Slice(filtered, func(i, j int) bool {
		return filtered[i].UpdatedAt > filtered[j].UpdatedAt
	})
	recentFile := filepath.Join(s.configDir, "recent.json")
	data, err := json.MarshalIndent(filtered, "", "  ")
	if err != nil {
		return err
	}
	return s.SaveAtomic(recentFile, data)
}

func (s *StorageManager) ListProjects() ([]ProjectEntry, error) {
	projectsDir := s.GetProjectsDir()
	entries, err := os.ReadDir(projectsDir)
	if err != nil {
		return []ProjectEntry{}, nil
	}
	var results []ProjectEntry
	for _, entry := range entries {
		var fullPath, coverUri, baseName string
		var info os.FileInfo
		var duration float64

		if entry.IsDir() {
			projectFile := filepath.Join(projectsDir, entry.Name(), "project.gct")
			fInfo, err := os.Stat(projectFile)
			if err != nil {
				continue
			}
			fullPath = projectFile
			info = fInfo
			baseName = entry.Name()
			coverFile := filepath.Join(projectsDir, entry.Name(), "cover.jpg")
			if _, err := os.Stat(coverFile); err == nil {
				coverUri = fmt.Sprintf("/media-stream?path=%s", url.QueryEscape(coverFile))
			}
		} else {
			ext := strings.ToLower(filepath.Ext(entry.Name()))
			if ext != ".gct" && ext != ".reacut" && ext != ".gocut" {
				continue
			}
			fInfo, err := entry.Info()
			if err != nil {
				continue
			}
			fullPath = filepath.Join(projectsDir, entry.Name())
			info = fInfo
			baseName = strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name()))
			coverFile := filepath.Join(projectsDir, baseName+".cover.jpg")
			if _, err := os.Stat(coverFile); err == nil {
				coverUri = fmt.Sprintf("/media-stream?path=%s", url.QueryEscape(coverFile))
			}
		}

		if content, err := os.ReadFile(fullPath); err == nil {
			var draft struct {
				Duration float64 `json:"duration"`
				Assets   []struct {
					Thumbnail string `json:"thumbnail"`
					Path      string `json:"path"`
					Kind      string `json:"kind"`
				} `json:"assets"`
				Clips []struct {
					Start    float64 `json:"start"`
					Duration float64 `json:"duration"`
				} `json:"clips"`
			}
			if err := json.Unmarshal(content, &draft); err == nil {
				duration = draft.Duration
				if duration <= 0 {
					for _, c := range draft.Clips {
						if end := c.Start + c.Duration; end > duration {
							duration = end
						}
					}
				}
				if coverUri == "" {
					for _, a := range draft.Assets {
						if a.Thumbnail != "" {
							coverUri = a.Thumbnail
							break
						} else if (a.Kind == "image" || a.Kind == "video") && a.Path != "" {
							coverUri = fmt.Sprintf("/media-stream?path=%s", url.QueryEscape(a.Path))
							break
						}
					}
				}
			}
		}

		results = append(results, ProjectEntry{
			ID:        baseName,
			Name:      baseName,
			Path:      fullPath,
			Cover:     coverUri,
			SizeBytes: info.Size(),
			Duration:  duration,
			UpdatedAt: info.ModTime().Format(time.RFC3339),
		})
	}
	sort.Slice(results, func(i, j int) bool {
		return results[i].UpdatedAt > results[j].UpdatedAt
	})
	return results, nil
}

func (s *StorageManager) CreateProject(name string) (ProjectEntry, error) {
	if strings.TrimSpace(name) == "" {
		name = "Untitled Project"
	}
	projectsDir := s.GetProjectsDir()
	cleanName := strings.ReplaceAll(name, "/", "-")
	cleanName = strings.ReplaceAll(cleanName, "\\", "-")

	projectFolder := filepath.Join(projectsDir, cleanName)
	if _, err := os.Stat(projectFolder); err == nil {
		cleanName = fmt.Sprintf("%s-%d", cleanName, time.Now().Unix())
		projectFolder = filepath.Join(projectsDir, cleanName)
	}

	_ = os.MkdirAll(filepath.Join(projectFolder, "backups"), 0755)
	targetPath := filepath.Join(projectFolder, "project.gct")

	now := time.Now().UTC().Format(time.RFC3339)
	projectID := fmt.Sprintf("%s-%d", cleanName, time.Now().UnixNano())
	initialProject := fmt.Sprintf(`{"version":1,"id":%q,"name":%q,"width":1920,"height":1080,"fps":30,"background":"#101015","createdAt":%q,"updatedAt":%q,"tracks":[{"id":"t-text-1","kind":"text","name":"Text","muted":false,"hidden":false,"locked":false},{"id":"t-video-1","kind":"video","name":"Video 1","muted":false,"hidden":false,"locked":false},{"id":"t-audio-1","kind":"audio","name":"Audio 1","muted":false,"hidden":false,"locked":false}],"clips":[],"assets":[]}`, projectID, name, now, now)
	if err := s.SaveAtomic(targetPath, []byte(initialProject)); err != nil {
		return ProjectEntry{}, err
	}
	_ = s.Autosave([]byte(initialProject))
	_ = s.AddRecent(name, targetPath)
	return ProjectEntry{
		ID:        cleanName,
		Name:      name,
		Path:      targetPath,
		SizeBytes: int64(len(initialProject)),
		Duration:  0,
		UpdatedAt: time.Now().Format(time.RFC3339),
	}, nil
}

func (s *StorageManager) DuplicateProject(sourcePath string) (ProjectEntry, error) {
	data, err := os.ReadFile(sourcePath)
	if err != nil {
		return ProjectEntry{}, err
	}
	isFolder := filepath.Base(sourcePath) == "project.gct"
	var newPath string
	var newName string

	if isFolder {
		sourceDir := filepath.Dir(sourcePath)
		parentDir := filepath.Dir(sourceDir)
		oldName := filepath.Base(sourceDir)
		newName = oldName + " Copy"
		targetDir := filepath.Join(parentDir, newName)
		if _, err := os.Stat(targetDir); err == nil {
			newName = fmt.Sprintf("%s-%d", newName, time.Now().Unix())
			targetDir = filepath.Join(parentDir, newName)
		}
		_ = os.MkdirAll(filepath.Join(targetDir, "backups"), 0755)
		newPath = filepath.Join(targetDir, "project.gct")
		if err := s.SaveAtomic(newPath, data); err != nil {
			return ProjectEntry{}, err
		}
		srcCover := filepath.Join(sourceDir, "cover.jpg")
		if coverBytes, err := os.ReadFile(srcCover); err == nil {
			_ = os.WriteFile(filepath.Join(targetDir, "cover.jpg"), coverBytes, 0644)
		}
	} else {
		base := filepath.Base(sourcePath)
		ext := filepath.Ext(base)
		baseName := strings.TrimSuffix(base, ext)
		newName = baseName + " Copy"
		projectsDir := filepath.Dir(sourcePath)
		newPath = filepath.Join(projectsDir, newName+ext)
		if _, err := os.Stat(newPath); err == nil {
			newName = fmt.Sprintf("%s-%d", newName, time.Now().Unix())
			newPath = filepath.Join(projectsDir, newName+ext)
		}
		if err := s.SaveAtomic(newPath, data); err != nil {
			return ProjectEntry{}, err
		}
		srcCover := filepath.Join(projectsDir, baseName+".cover.jpg")
		dstCover := filepath.Join(projectsDir, newName+".cover.jpg")
		if coverBytes, err := os.ReadFile(srcCover); err == nil {
			_ = os.WriteFile(dstCover, coverBytes, 0644)
		}
	}

	_ = s.AddRecent(newName, newPath)
	info, _ := os.Stat(newPath)
	var size int64
	if info != nil {
		size = info.Size()
	}
	return ProjectEntry{
		ID:        newName,
		Name:      newName,
		Path:      newPath,
		SizeBytes: size,
		UpdatedAt: time.Now().Format(time.RFC3339),
	}, nil
}

func (s *StorageManager) RenameProject(projectPath string, newName string) (ProjectEntry, error) {
	cleanNew := strings.ReplaceAll(newName, "/", "-")
	cleanNew = strings.ReplaceAll(cleanNew, "\\", "-")

	isFolder := filepath.Base(projectPath) == "project.gct"
	var newPath string

	if isFolder {
		sourceDir := filepath.Dir(projectPath)
		parentDir := filepath.Dir(sourceDir)
		targetDir := filepath.Join(parentDir, cleanNew)
		if targetDir != sourceDir {
			if err := os.Rename(sourceDir, targetDir); err != nil {
				return ProjectEntry{}, err
			}
		}
		newPath = filepath.Join(targetDir, "project.gct")
	} else {
		dir := filepath.Dir(projectPath)
		ext := filepath.Ext(projectPath)
		oldBase := strings.TrimSuffix(filepath.Base(projectPath), ext)
		newPath = filepath.Join(dir, cleanNew+ext)
		if newPath != projectPath {
			if err := os.Rename(projectPath, newPath); err != nil {
				return ProjectEntry{}, err
			}
			oldCover := filepath.Join(dir, oldBase+".cover.jpg")
			newCover := filepath.Join(dir, cleanNew+".cover.jpg")
			if _, err := os.Stat(oldCover); err == nil {
				_ = os.Rename(oldCover, newCover)
			}
		}
	}

	_ = s.AddRecent(newName, newPath)
	info, _ := os.Stat(newPath)
	var size int64
	if info != nil {
		size = info.Size()
	}
	return ProjectEntry{
		ID:        cleanNew,
		Name:      newName,
		Path:      newPath,
		SizeBytes: size,
		UpdatedAt: time.Now().Format(time.RFC3339),
	}, nil
}

func (s *StorageManager) DeleteProject(projectPath string) error {
	_ = s.RemoveRecent(projectPath)
	if filepath.Base(projectPath) == "project.gct" {
		return os.RemoveAll(filepath.Dir(projectPath))
	}
	_ = os.Remove(projectPath)
	dir := filepath.Dir(projectPath)
	base := strings.TrimSuffix(filepath.Base(projectPath), filepath.Ext(projectPath))
	_ = os.Remove(filepath.Join(dir, base+".cover.jpg"))
	return nil
}

func (s *StorageManager) SaveProjectCover(projectPath string, base64Data string) error {
	var target string
	if filepath.Base(projectPath) == "project.gct" {
		target = filepath.Join(filepath.Dir(projectPath), "cover.jpg")
	} else {
		dir := filepath.Dir(projectPath)
		base := strings.TrimSuffix(filepath.Base(projectPath), filepath.Ext(projectPath))
		target = filepath.Join(dir, base+".cover.jpg")
	}
	idx := strings.Index(base64Data, ",")
	raw := base64Data
	if idx != -1 {
		raw = base64Data[idx+1:]
	}
	decoded, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return err
	}
	return os.WriteFile(target, decoded, 0644)
}
