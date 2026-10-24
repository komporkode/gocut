package media

import (
	"errors"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

var (
	resolvedCache sync.Map // map[string]string: raw/base -> resolved absolute path
	searchDirsMu  sync.RWMutex
	searchDirs    []string
)

// RegisterSearchDir adds a directory to prioritize when resolving missing/relative assets.
func RegisterSearchDir(dir string) {
	if dir == "" {
		return
	}
	clean := filepath.Clean(dir)
	searchDirsMu.Lock()
	defer searchDirsMu.Unlock()
	for _, d := range searchDirs {
		if d == clean {
			return
		}
	}
	searchDirs = append(searchDirs, clean)
}

// NormalizePath cleans incoming URI schemes, URL encodings, and OS slashes.
func NormalizePath(filePath string) string {
	if filePath == "" {
		return ""
	}

	// Strip URI schemes
	if strings.HasPrefix(filePath, "reacut-media://") {
		if u, err := url.Parse(filePath); err == nil && u.Query().Get("path") != "" {
			filePath = u.Query().Get("path")
		} else {
			filePath = strings.TrimPrefix(filePath, "reacut-media://asset?path=")
			filePath, _ = url.QueryUnescape(filePath)
		}
	} else if strings.HasPrefix(filePath, "file:///") {
		filePath = strings.TrimPrefix(filePath, "file:///")
	} else if strings.HasPrefix(filePath, "file://") {
		filePath = strings.TrimPrefix(filePath, "file://")
	}

	// Windows leading slash before drive letter: /C:/path -> C:/path
	if len(filePath) > 2 && filePath[0] == '/' && filePath[2] == ':' {
		filePath = filePath[1:]
	}

	return filepath.Clean(filePath)
}

// ResolvePath locates a media file on the filesystem, checking direct candidates
// and scanning common media directories if only a relative path or bare filename was given.
func ResolvePath(rawPath string) (string, error) {
	if rawPath == "" {
		return "", errors.New("empty media path")
	}

	if strings.HasPrefix(rawPath, "solid:") {
		color := strings.TrimPrefix(rawPath, "solid:")
		if color == "" {
			color = "#000000"
		}
		cacheDir := filepath.Join(os.TempDir(), "reacut", "solids")
		_ = os.MkdirAll(cacheDir, 0755)
		safeName := strings.ReplaceAll(color, "#", "") + ".svg"
		solidFile := filepath.Join(cacheDir, safeName)
		if _, err := os.Stat(solidFile); err != nil {
			svg := fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="100%%" height="100%%" fill="%s"/></svg>`, color)
			_ = os.WriteFile(solidFile, []byte(svg), 0644)
		}
		return solidFile, nil
	}

	norm := NormalizePath(rawPath)

	// 1. Direct hit
	if info, err := os.Stat(norm); err == nil && !info.IsDir() {
		resolvedCache.Store(rawPath, norm)
		resolvedCache.Store(filepath.Base(norm), norm)
		return norm, nil
	}

	baseName := filepath.Base(norm)

	// 2. Check cache
	if val, ok := resolvedCache.Load(baseName); ok {
		cachedPath := val.(string)
		if info, err := os.Stat(cachedPath); err == nil && !info.IsDir() {
			return cachedPath, nil
		}
		resolvedCache.Delete(baseName)
	}

	// 3. Fast direct check in candidate directories
	home, _ := os.UserHomeDir()
	appData := os.Getenv("APPDATA")

	var directCandidates []string

	// Registered search dirs
	searchDirsMu.RLock()
	for _, sd := range searchDirs {
		directCandidates = append(directCandidates, filepath.Join(sd, baseName))
	}
	searchDirsMu.RUnlock()

	// Standard user folders
	if home != "" {
		directCandidates = append(directCandidates,
			filepath.Join(home, "Downloads", baseName),
			filepath.Join(home, "Videos", baseName),
			filepath.Join(home, "Pictures", baseName),
			filepath.Join(home, "Desktop", baseName),
			filepath.Join(home, "Documents", baseName),
			filepath.Join(home, ".reacut", "cache", "media", baseName),
		)
	}

	if appData != "" {
		directCandidates = append(directCandidates,
			filepath.Join(appData, "reacut", "cache", "media", baseName),
		)
	}

	// Project & CapCut materials directories
	directCandidates = append(directCandidates,
		filepath.Join("D:\\PROJECT\\GAWEAN\\CAPCUT\\Bahan", baseName),
		filepath.Join("D:\\PROJECT\\GAWEAN", baseName),
		filepath.Join("D:\\", baseName),
	)

	for _, cand := range directCandidates {
		if info, err := os.Stat(cand); err == nil && !info.IsDir() {
			resolvedCache.Store(rawPath, cand)
			resolvedCache.Store(baseName, cand)
			return cand, nil
		}
	}

	// 4. Bounded recursive search in primary media locations
	searchRoots := []struct {
		path     string
		maxDepth int
	}{
		{"D:\\PROJECT\\GAWEAN\\CAPCUT", 6},
		{"D:\\PROJECT\\GAWEAN", 4},
	}

	if home != "" {
		searchRoots = append(searchRoots,
			struct {
				path     string
				maxDepth int
			}{filepath.Join(home, "Downloads"), 3},
			struct {
				path     string
				maxDepth int
			}{filepath.Join(home, "Videos"), 3},
			struct {
				path     string
				maxDepth int
			}{filepath.Join(home, "Desktop"), 3},
		)
	}

	for _, root := range searchRoots {
		if _, err := os.Stat(root.path); err != nil {
			continue
		}

		rootDepth := strings.Count(filepath.Clean(root.path), string(filepath.Separator))
		var foundPath string

		_ = filepath.WalkDir(root.path, func(p string, d fs.DirEntry, err error) error {
			if err != nil {
				return fs.SkipDir
			}
			currDepth := strings.Count(filepath.Clean(p), string(filepath.Separator)) - rootDepth
			if currDepth > root.maxDepth {
				if d.IsDir() {
					return fs.SkipDir
				}
				return nil
			}

			// Skip hidden / system / git folders
			if d.IsDir() {
				name := d.Name()
				if strings.HasPrefix(name, ".") || name == "node_modules" || name == "$RECYCLE.BIN" {
					return fs.SkipDir
				}
				return nil
			}

			if strings.EqualFold(d.Name(), baseName) {
				foundPath = p
				return errors.New("found") // abort search immediately
			}
			return nil
		})

		if foundPath != "" {
			resolvedCache.Store(rawPath, foundPath)
			resolvedCache.Store(baseName, foundPath)
			return foundPath, nil
		}
	}

	return norm, os.ErrNotExist
}
