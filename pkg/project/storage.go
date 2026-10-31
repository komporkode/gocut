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

type StorageManager struct {
	configDir string
}

func NewStorageManager() (*StorageManager, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		base = os.TempDir()
	}
	dir := filepath.Join(base, "ReaCut")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create app data directory: %w", err)
	}
	return &StorageManager{configDir: dir}, nil
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
	target := filepath.Join(s.configDir, "autosave.reacut")
	return s.SaveAtomic(target, data)
}

func (s *StorageManager) ReadAutosave() (string, error) {
	target := filepath.Join(s.configDir, "autosave.reacut")
	content, err := os.ReadFile(target)
	if err != nil {
		if os.IsNotExist(err) {
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
	return entries, nil
}

func (s *StorageManager) AddRecent(name, path string) error {
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

func (s *StorageManager) GetProjectsDir() string {
	dir := filepath.Join(s.configDir, "Projects")
	_ = os.MkdirAll(dir, 0755)
	return dir
}

func (s *StorageManager) ListProjects() ([]ProjectEntry, error) {
	projectsDir := s.GetProjectsDir()
	entries, err := os.ReadDir(projectsDir)
	if err != nil {
		return []ProjectEntry{}, nil
	}
	var results []ProjectEntry
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(strings.ToLower(entry.Name()), ".reacut") {
			fullPath := filepath.Join(projectsDir, entry.Name())
			info, err := entry.Info()
			if err != nil {
				continue
			}
			baseName := strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name()))
			coverFile := filepath.Join(projectsDir, baseName+".cover.jpg")
			var coverUri string
			if _, err := os.Stat(coverFile); err == nil {
				coverUri = fmt.Sprintf("/media-stream?path=%s", url.QueryEscape(coverFile))
			}
			var duration float64
			if content, err := os.ReadFile(fullPath); err == nil {
				var draft struct {
					Duration float64 `json:"duration"`
					Clips    []struct {
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
	targetPath := filepath.Join(projectsDir, cleanName+".reacut")

	if _, err := os.Stat(targetPath); err == nil {
		cleanName = fmt.Sprintf("%s-%d", cleanName, time.Now().Unix())
		targetPath = filepath.Join(projectsDir, cleanName+".reacut")
	}

	initialProject := fmt.Sprintf(`{"id":"%s","name":%q,"width":1920,"height":1080,"fps":30,"background":"#000000","tracks":[{"id":"t-video-1","kind":"video","name":"Video 1"},{"id":"t-audio-1","kind":"audio","name":"Audio 1"}],"clips":[],"assets":[]}`, cleanName, name)
	if err := s.SaveAtomic(targetPath, []byte(initialProject)); err != nil {
		return ProjectEntry{}, err
	}
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
	base := filepath.Base(sourcePath)
	ext := filepath.Ext(base)
	baseName := strings.TrimSuffix(base, ext)
	newName := baseName + " Copy"
	projectsDir := filepath.Dir(sourcePath)
	targetPath := filepath.Join(projectsDir, newName+ext)
	if _, err := os.Stat(targetPath); err == nil {
		newName = fmt.Sprintf("%s-%d", newName, time.Now().Unix())
		targetPath = filepath.Join(projectsDir, newName+ext)
	}
	if err := s.SaveAtomic(targetPath, data); err != nil {
		return ProjectEntry{}, err
	}

	srcCover := filepath.Join(projectsDir, baseName+".cover.jpg")
	dstCover := filepath.Join(projectsDir, newName+".cover.jpg")
	if coverBytes, err := os.ReadFile(srcCover); err == nil {
		_ = os.WriteFile(dstCover, coverBytes, 0644)
	}

	_ = s.AddRecent(newName, targetPath)
	info, _ := os.Stat(targetPath)
	var size int64
	if info != nil {
		size = info.Size()
	}
	return ProjectEntry{
		ID:        newName,
		Name:      newName,
		Path:      targetPath,
		SizeBytes: size,
		UpdatedAt: time.Now().Format(time.RFC3339),
	}, nil
}

func (s *StorageManager) RenameProject(projectPath string, newName string) (ProjectEntry, error) {
	dir := filepath.Dir(projectPath)
	ext := filepath.Ext(projectPath)
	oldBase := strings.TrimSuffix(filepath.Base(projectPath), ext)
	cleanNew := strings.ReplaceAll(newName, "/", "-")
	cleanNew = strings.ReplaceAll(cleanNew, "\\", "-")
	newPath := filepath.Join(dir, cleanNew+ext)
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
	_ = os.Remove(projectPath)
	dir := filepath.Dir(projectPath)
	base := strings.TrimSuffix(filepath.Base(projectPath), filepath.Ext(projectPath))
	_ = os.Remove(filepath.Join(dir, base+".cover.jpg"))
	return nil
}

func (s *StorageManager) SaveProjectCover(projectPath string, base64Data string) error {
	dir := filepath.Dir(projectPath)
	base := strings.TrimSuffix(filepath.Base(projectPath), filepath.Ext(projectPath))
	target := filepath.Join(dir, base+".cover.jpg")
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
