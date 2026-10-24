package project

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"
)

type RecentEntry struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	UpdatedAt string `json:"updatedAt"`
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
