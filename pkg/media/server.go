package media

import (
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

var mimeTypes = map[string]string{
	".mp4":  "video/mp4",
	".mov":  "video/quicktime",
	".m4v":  "video/x-m4v",
	".webm": "video/webm",
	".mkv":  "video/x-matroska",
	".avi":  "video/x-msvideo",
	".mp3":  "audio/mpeg",
	".wav":  "audio/wav",
	".m4a":  "audio/mp4",
	".aac":  "audio/aac",
	".ogg":  "audio/ogg",
	".flac": "audio/flac",
	".png":  "image/png",
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".gif":  "image/gif",
	".bmp":  "image/bmp",
	".svg":  "image/svg+xml",
}

// MediaHandler serves local media files supporting HTTP 206 Partial Content byte ranges.
type MediaHandler struct{}

func NewMediaHandler() *MediaHandler {
	return &MediaHandler{}
}

func (h *MediaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Enable CORS for webview access
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Range, Content-Type, Accept, Origin")
	w.Header().Set("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges")
	w.Header().Set("Accept-Ranges", "bytes")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Extract file path from query ?path= or URL path
	filePath := r.URL.Query().Get("path")
	if filePath == "" {
		trimmed := strings.TrimPrefix(r.URL.Path, "/media-stream")
		trimmed = strings.TrimPrefix(trimmed, "/")
		var err error
		filePath, err = url.PathUnescape(trimmed)
		if err != nil {
			http.Error(w, "Invalid path encoding", http.StatusBadRequest)
			return
		}
	}

	if filePath == "" {
		http.Error(w, "Missing path parameter", http.StatusBadRequest)
		return
	}

	// Robustly resolve path using the shared resolver
	resolvedPath, err := ResolvePath(filePath)
	if err != nil {
		http.Error(w, "Media not found: "+filePath, http.StatusNotFound)
		return
	}

	info, err := os.Stat(resolvedPath)
	if err != nil {
		if os.IsNotExist(err) {
			http.Error(w, "Media not found: "+resolvedPath, http.StatusNotFound)
			return
		}
		http.Error(w, "Cannot access file: "+err.Error(), http.StatusForbidden)
		return
	}

	if info.IsDir() {
		http.Error(w, "Path is a directory", http.StatusBadRequest)
		return
	}

	file, err := os.Open(resolvedPath)
	if err != nil {
		http.Error(w, "Failed to open file: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer file.Close()

	// Guarantee explicit media Content-Type so Chromium / WebView2 decodes the video/audio
	ext := strings.ToLower(filepath.Ext(resolvedPath))
	if ct, ok := mimeTypes[ext]; ok {
		w.Header().Set("Content-Type", ct)
	}

	// http.ServeContent handles RFC 7233 range requests (HTTP 206 Partial Content),
	// allowing instant seeking across large video files without memory buffering.
	http.ServeContent(w, r, filepath.Base(resolvedPath), info.ModTime(), file)
}
