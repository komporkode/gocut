package main

import (
	"context"
	"math"
	"sync"
	"time"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"reacut/pkg/capcut"
	"reacut/pkg/cmdutil"
	"reacut/pkg/ffmpeg"
	"reacut/pkg/media"
	"reacut/pkg/project"
	"reacut/pkg/updater"
	"reacut/pkg/whisper"

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const AppVersion = "0.9.0-beta"

type SystemInfo struct {
	Ffmpeg        bool   `json:"ffmpeg"`
	Ffprobe       bool   `json:"ffprobe"`
	Version       string `json:"version"`
	FfmpegVersion string `json:"ffmpegVersion"`
	FfmpegPath    string `json:"ffmpegPath"`
	FfprobePath   string `json:"ffprobePath"`
}

type ProjectOpenResult struct {
	Path string `json:"path"`
	Json string `json:"json"`
}

type MediaAsset struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	Path       string    `json:"path"`
	Url        string    `json:"url"`
	PreviewUrl string    `json:"previewUrl,omitempty"`
	Thumbnail  string    `json:"thumbnail,omitempty"`
	Waveform   []float32 `json:"waveform,omitempty"`
	Color      string    `json:"color,omitempty"`
	Kind       string    `json:"kind"`
	Width      int       `json:"width"`
	Height     int       `json:"height"`
	Fps        float64   `json:"fps"`
	Duration   float64   `json:"duration"`
	HasAudio   bool      `json:"hasAudio"`
	Missing    bool      `json:"missing"`
	Folder     string    `json:"folder,omitempty"`
}

type TextFileResult struct {
	Path string `json:"path"`
	Text string `json:"text"`
}

type CapcutDraftResult struct {
	Name     string   `json:"name"`
	Text     string   `json:"text"`
	Warnings []string `json:"warnings"`
}

type ExportProgressEvent struct {
	JobID    string  `json:"jobId"`
	Progress float64 `json:"progress"`
	Status   string  `json:"status"`
	Message  string  `json:"message,omitempty"`
	Path     string  `json:"path,omitempty"`
	Error    string  `json:"error,omitempty"`
}

type App struct {
	ctx          context.Context
	mediaHandler *media.MediaHandler
	storage      *project.StorageManager
	runner       *ffmpeg.Runner
	capcut       *capcut.DraftReader
	whisperMgr   *whisper.Manager
	updater      *updater.Manager
	dirty        bool
}

func NewApp() *App {
	sm, _ := project.NewStorageManager()
	runner := ffmpeg.NewRunner()
	if sm != nil {
		runner.SetDirs(sm.GetCacheDir(), sm.GetTempDir())
		media.SetSolidCacheDir(filepath.Join(sm.GetCacheDir(), "solids"))
		go sm.CleanupTemp(24 * time.Hour)
	}
	var dataDir string
	if sm != nil {
		dataDir = sm.GetDataDir()
	}
	var whisperDir string
	if sm != nil {
		whisperDir = sm.GetModelsDir("whisper")
	}
	return &App{
		mediaHandler: media.NewMediaHandler(),
		storage:      sm,
		runner:       runner,
		capcut:       capcut.NewDraftReader(),
		whisperMgr:   whisper.NewManager(whisperDir),
		updater:      updater.NewManager(dataDir),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Pemeriksaan pembaruan berkala di latar belakang (maks. 1x per 24 jam bila aktif)
	go func() {
		time.Sleep(3 * time.Second)
		if a.updater == nil {
			return
		}
		settings := a.updater.GetSettings()
		if !settings.AutoCheck {
			return
		}
		if time.Now().Unix()-settings.LastChecked < 24*3600 {
			return
		}
		info, err := a.updater.CheckForUpdate(AppVersion, false)
		if err == nil && info != nil && info.Available {
			runtime.EventsEmit(a.ctx, "update_available", info)
		}
	}()
}

func (a *App) GetSystemInfo() SystemInfo {
	ffmpegPath, ffmpegErr := a.runner.ResolveTool("ffmpeg")
	ffprobePath, ffprobeErr := a.runner.ResolveTool("ffprobe")

	version := AppVersion + " (GoCut/Wails/Go)"
	var ffmpegVer string
	if ffmpegErr == nil {
		cmd := exec.Command(ffmpegPath, "-version")
		cmdutil.HideWindow(cmd)
		out, err := cmd.Output()
		if err == nil {
			firstLine := strings.Split(string(out), "\n")[0]
			ffmpegVer = strings.TrimSpace(firstLine)
		}
	}

	return SystemInfo{
		Ffmpeg:        ffmpegErr == nil,
		Ffprobe:       ffprobeErr == nil,
		Version:       version,
		FfmpegVersion: ffmpegVer,
		FfmpegPath:    ffmpegPath,
		FfprobePath:   ffprobePath,
	}
}

func (a *App) ChooseMediaTool(toolName string) (string, error) {
	chosen, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: fmt.Sprintf("Select %s Executable", toolName),
		Filters: []runtime.FileFilter{
			{DisplayName: "Executable", Pattern: "*.exe;*"},
		},
	})
	if err != nil || chosen == "" {
		return "", err
	}
	switch toolName {
	case "ffmpeg":
		a.runner.SetCustomPaths(chosen, "")
	case "ffprobe":
		a.runner.SetCustomPaths("", chosen)
	}
	return chosen, nil
}

func (a *App) OpenProject(path string) (*ProjectOpenResult, error) {
	target := path
	if target == "" {
		var err error
		target, err = runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
			Title: "Open GoCut Project",
			Filters: []runtime.FileFilter{
				{DisplayName: "GoCut Project (*.gct;*.gocut;*.reacut;*.json)", Pattern: "*.gct;*.gocut;*.reacut;*.json"},
			},
		})
		if err != nil || target == "" {
			return nil, err
		}
	}

	content, err := os.ReadFile(target)
	if err != nil {
		return nil, fmt.Errorf("failed to open project: %w", err)
	}

	_ = a.storage.AddRecent(filepath.Base(target), target)
	media.RegisterSearchDir(filepath.Dir(target))

	return &ProjectOpenResult{
		Path: target,
		Json: string(content),
	}, nil
}

func (a *App) SaveProject(projectJson string, path string) (string, error) {
	target := path
	if target == "" {
		var err error
		target, err = runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
			Title:           "Save GoCut Project",
			DefaultFilename: "project.gct",
			Filters: []runtime.FileFilter{
				{DisplayName: "GoCut Project (*.gct;*.gocut;*.reacut)", Pattern: "*.gct;*.gocut;*.reacut"},
			},
		})
		if err != nil || target == "" {
			return "", err
		}
	}

	if err := a.storage.SaveAtomic(target, []byte(projectJson)); err != nil {
		return "", fmt.Errorf("failed to save project: %w", err)
	}

	_ = a.storage.AddRecent(filepath.Base(target), target)
	a.dirty = false
	return target, nil
}

func (a *App) AutosaveProject(projectJson string) error {
	return a.storage.Autosave([]byte(projectJson))
}

func (a *App) GetAutosave() (string, error) {
	return a.storage.ReadAutosave()
}

func (a *App) GetRecentProjects() ([]project.RecentEntry, error) {
	return a.storage.GetRecent()
}

func (a *App) ListProjects() ([]project.ProjectEntry, error) {
	return a.storage.ListProjects()
}

func (a *App) CreateProject(name string) (project.ProjectEntry, error) {
	return a.storage.CreateProject(name)
}

func (a *App) DuplicateProject(projectPath string) (project.ProjectEntry, error) {
	return a.storage.DuplicateProject(projectPath)
}

func (a *App) RenameProject(projectPath string, newName string) (project.ProjectEntry, error) {
	return a.storage.RenameProject(projectPath, newName)
}

func (a *App) DeleteProject(projectPath string) error {
	return a.storage.DeleteProject(projectPath)
}

func (a *App) SaveProjectCover(projectPath string, base64Data string) error {
	return a.storage.SaveProjectCover(projectPath, base64Data)
}

func (a *App) GetStorageInfo() project.StorageInfo {
	return a.storage.GetStorageInfo()
}

func (a *App) RelocateStorage(newDrive string) (project.StorageInfo, error) {
	if err := a.storage.RelocateDataDir(newDrive); err != nil {
		return a.storage.GetStorageInfo(), err
	}
	a.whisperMgr.SetModelsDir(a.storage.GetModelsDir("whisper"))
	return a.storage.GetStorageInfo(), nil
}

func (a *App) ListWhisperModels() []whisper.WhisperModel {
	return a.whisperMgr.ListModels()
}

func (a *App) ImportWhisperModel() (string, error) {
	target, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Pilih File Model Whisper (.bin)",
		Filters: []runtime.FileFilter{
			{DisplayName: "GGML Whisper Model (*.bin)", Pattern: "*.bin"},
		},
	})
	if err != nil || target == "" {
		return "", err
	}
	if err := a.whisperMgr.ImportModel(target); err != nil {
		return "", err
	}
	return filepath.Base(target), nil
}

var supportedMediaExts = map[string]bool{
	".mp4": true, ".mov": true, ".m4v": true, ".webm": true,
	".png": true, ".jpg": true, ".jpeg": true, ".webp": true,
	".mp3": true, ".wav": true, ".m4a": true, ".aac": true,
}

func (a *App) ChooseMediaFiles() ([]string, error) {
	paths, err := runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Import Media",
		Filters: []runtime.FileFilter{
			{DisplayName: "Media Files", Pattern: "*.mp4;*.mov;*.m4v;*.webm;*.mp3;*.wav;*.m4a;*.aac;*.png;*.jpg;*.jpeg;*.webp"},
		},
	})
	return paths, err
}

func (a *App) ChooseMediaFolder() (string, error) {
	folder, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Import Media Folder",
	})
	return folder, err
}

func (a *App) createAssetFromPath(clean string, folder string) MediaAsset {
	name := filepath.Base(clean)
	ext := strings.ToLower(filepath.Ext(clean))
	isImage := ext == ".png" || ext == ".jpg" || ext == ".jpeg" || ext == ".webp"
	streamUrl := fmt.Sprintf("/media-stream?path=%s", url.QueryEscape(clean))

	if isImage {
		return MediaAsset{
			ID:        uuid.NewString(),
			Name:      name,
			Path:      clean,
			Url:       streamUrl,
			Thumbnail: streamUrl,
			Kind:      "image",
			Width:     1920,
			Height:    1080,
			Fps:       0,
			Duration:  5,
			HasAudio:  false,
			Folder:    folder,
		}
	}

	probe, err := a.runner.Probe(clean)
	if err != nil {
		return MediaAsset{
			ID:        uuid.NewString(),
			Name:      name,
			Path:      clean,
			Url:       streamUrl,
			Thumbnail: streamUrl,
			Kind:      "video",
			Width:     1920,
			Height:    1080,
			Fps:       30,
			Duration:  10,
			HasAudio:  true,
			Folder:    folder,
		}
	}

	previewUrl := streamUrl
	var thumbUrl string

	if probe.Kind == "video" {
		if proxyPath, err := a.runner.EnsureProxy(clean, probe.Codec); err == nil && proxyPath != "" {
			previewUrl = fmt.Sprintf("/media-stream?path=%s", url.QueryEscape(proxyPath))
		}
		// Extract lightweight JPEG thumbnail file (O(1) RAM, served via HTTP Range / media-stream)
		thumbDir := filepath.Join(a.storage.GetCacheDir(), "thumbnails")
		_ = os.MkdirAll(thumbDir, 0755)
		safeBase := strings.TrimSuffix(name, filepath.Ext(name))
		thumbPath := filepath.Join(thumbDir, fmt.Sprintf("%s_%x.jpg", safeBase, len(clean)+int(clean[0])))
		if info, err := os.Stat(thumbPath); err == nil && info.Size() > 100 {
			thumbUrl = fmt.Sprintf("/media-stream?path=%s", url.QueryEscape(thumbPath))
		} else if err := a.runner.GenerateThumbnail(clean, thumbPath, 0.1); err == nil {
			thumbUrl = fmt.Sprintf("/media-stream?path=%s", url.QueryEscape(thumbPath))
		}
	}

	var waveform []float32
	if probe.HasAudio {
		if wf, err := a.runner.ComputeWaveform(clean, 100); err == nil {
			waveform = wf
		}
	}

	return MediaAsset{
		ID:         uuid.NewString(),
		Name:       name,
		Path:       clean,
		Url:        streamUrl,
		PreviewUrl: previewUrl,
		Thumbnail:  thumbUrl,
		Waveform:   waveform,
		Kind:       probe.Kind,
		Width:      probe.Width,
		Height:     probe.Height,
		Fps:        probe.Fps,
		Duration:   probe.Duration,
		HasAudio:   probe.HasAudio,
		Folder:     folder,
	}
}

func (a *App) GetWaveform(filePath string, buckets int) ([]float32, error) {
	clean := media.NormalizePath(filePath)
	if resolved, err := media.ResolvePath(clean); err == nil && resolved != "" {
		clean = resolved
	}
	if buckets <= 0 {
		buckets = 500
	}
	return a.runner.ComputeWaveform(clean, buckets)
}

func (a *App) ScanMediaFolder(folderPath string) ([]MediaAsset, error) {
	cleanRoot := media.NormalizePath(folderPath)
	info, err := os.Stat(cleanRoot)
	if err != nil || !info.IsDir() {
		return nil, fmt.Errorf("invalid directory: %s", folderPath)
	}

	rootName := filepath.Base(cleanRoot)
	var assets []MediaAsset

	err = filepath.WalkDir(cleanRoot, func(p string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		ext := strings.ToLower(filepath.Ext(d.Name()))
		if !supportedMediaExts[ext] {
			return nil
		}

		rel, relErr := filepath.Rel(cleanRoot, filepath.Dir(p))
		folderGroup := rootName
		if relErr == nil && rel != "." && rel != "" {
			folderGroup = filepath.ToSlash(filepath.Join(rootName, rel))
		}

		asset := a.createAssetFromPath(p, folderGroup)
		assets = append(assets, asset)
		return nil
	})

	return assets, err
}

func (a *App) ImportMedia(paths []string) ([]MediaAsset, error) {
	var assets []MediaAsset
	for _, p := range paths {
		clean := media.NormalizePath(p)
		if resolved, err := media.ResolvePath(clean); err == nil && resolved != "" {
			clean = resolved
		}
		info, err := os.Stat(clean)
		if err != nil {
			continue
		}
		if info.IsDir() {
			folderAssets, err := a.ScanMediaFolder(clean)
			if err == nil {
				assets = append(assets, folderAssets...)
			}
			continue
		}

		ext := strings.ToLower(filepath.Ext(clean))
		if !supportedMediaExts[ext] {
			continue
		}
		asset := a.createAssetFromPath(clean, "")
		assets = append(assets, asset)
	}
	return assets, nil
}

func (a *App) ReadTextFile(filters []string) (*TextFileResult, error) {
	pattern := "*.*"
	if len(filters) > 0 {
		var parts []string
		for _, f := range filters {
			parts = append(parts, "*."+f)
		}
		pattern = strings.Join(parts, ";")
	}

	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Open Text File",
		Filters: []runtime.FileFilter{
			{DisplayName: "Text Files", Pattern: pattern},
		},
	})
	if err != nil || path == "" {
		return nil, err
	}

	content, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	return &TextFileResult{
		Path: path,
		Text: string(content),
	}, nil
}

func (a *App) WriteTextFile(content string, defaultName string) (string, error) {
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Save Text File",
		DefaultFilename: defaultName,
	})
	if err != nil || path == "" {
		return "", err
	}

	if err := a.storage.SaveAtomic(path, []byte(content)); err != nil {
		return "", err
	}
	return path, nil
}

func (a *App) RevealPath(filePath string) error {
	clean := filepath.Clean(filePath)
	cmd := exec.Command("explorer.exe", "/select,", clean)
	cmdutil.HideWindow(cmd)
	return cmd.Start()
}

func (a *App) ChooseCapcutProject(mode string) (*capcut.DraftSelection, error) {
	if mode == "directory" {
		dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
			Title: "Select CapCut Project Folder",
		})
		if err != nil || dir == "" {
			return nil, err
		}
		media.RegisterSearchDir(dir)
		media.RegisterSearchDir(filepath.Dir(dir))
		return a.capcut.InspectDraft(dir)
	}

	file, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select CapCut draft_content.json",
		Filters: []runtime.FileFilter{
			{DisplayName: "CapCut Draft JSON", Pattern: "draft_content.json;*.json"},
		},
	})
	if err != nil || file == "" {
		return nil, err
	}
	media.RegisterSearchDir(filepath.Dir(file))
	media.RegisterSearchDir(filepath.Dir(filepath.Dir(file)))
	return a.capcut.InspectDraft(file)
}

func (a *App) InspectCapcutPath(path string) (*capcut.DraftSelection, error) {
	clean := media.NormalizePath(path)
	info, err := os.Stat(clean)
	if err != nil {
		return nil, err
	}
	if info.IsDir() {
		media.RegisterSearchDir(clean)
		media.RegisterSearchDir(filepath.Dir(clean))
		return a.capcut.InspectDraft(clean)
	}
	media.RegisterSearchDir(filepath.Dir(clean))
	media.RegisterSearchDir(filepath.Dir(filepath.Dir(clean)))
	return a.capcut.InspectDraft(clean)
}

func (a *App) ReadCapcutDraft(token string, timelineId string) (*CapcutDraftResult, error) {
	text, err := a.capcut.ReadContent(token)
	if err != nil {
		return nil, err
	}
	media.RegisterSearchDir(filepath.Dir(token))
	media.RegisterSearchDir(filepath.Dir(filepath.Dir(token)))
	name := filepath.Base(filepath.Dir(token))
	return &CapcutDraftResult{
		Name:     name,
		Text:     text,
		Warnings: []string{},
	}, nil
}

func (a *App) DiscardCapcutProject(token string) error {
	return nil
}

func (a *App) ChooseExportPath(name string, format string) (string, error) {
	if format == "" {
		format = "mp4"
	}
	defaultName := name + "." + format
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Export Video",
		DefaultFilename: defaultName,
		Filters: []runtime.FileFilter{
			{DisplayName: fmt.Sprintf("%s Video (*.%s)", strings.ToUpper(format), format), Pattern: "*." + format},
		},
	})
	if err != nil || path == "" {
		return "", err
	}
	return path, nil
}


var (
	testedEncodersLock sync.Mutex
	testedEncodersMap  = make(map[string]bool)
)

func (a *App) testEncoder(encoderName string) bool {
	testedEncodersLock.Lock()
	if val, ok := testedEncodersMap[encoderName]; ok {
		testedEncodersLock.Unlock()
		return val
	}
	testedEncodersLock.Unlock()

	ffmpegPath, err := a.runner.ResolveTool("ffmpeg")
	if err != nil {
		return false
	}

	cmd := exec.Command(ffmpegPath, "-f", "lavfi", "-i", "color=c=black:s=64x64:r=30:d=0.04", "-c:v", encoderName, "-f", "null", "-")
	cmdutil.HideWindow(cmd)
	success := cmd.Run() == nil

	testedEncodersLock.Lock()
	testedEncodersMap[encoderName] = success
	testedEncodersLock.Unlock()
	return success
}

func hexToAssColor(hexStr string) string {
	hexStr = strings.TrimPrefix(hexStr, "#")
	if len(hexStr) == 3 {
		hexStr = string([]byte{hexStr[0], hexStr[0], hexStr[1], hexStr[1], hexStr[2], hexStr[2]})
	}
	if len(hexStr) != 6 {
		return "&H00FFFFFF&"
	}
	r := strings.ToUpper(hexStr[0:2])
	g := strings.ToUpper(hexStr[2:4])
	b := strings.ToUpper(hexStr[4:6])
	return fmt.Sprintf("&H00%s%s%s&", b, g, r)
}

func formatAssTime(seconds float64) string {
	if seconds < 0 {
		seconds = 0
	}
	h := int(seconds / 3600)
	m := int(math.Mod(seconds, 3600) / 60)
	s := math.Mod(seconds, 60)
	return fmt.Sprintf("%d:%02d:%05.2f", h, m, s)
}

type ExportTextClip struct {
	Text        string
	Start       float64
	Duration    float64
	FontSize    float64
	FontFamily  string
	Color       string
	X           float64
	Y           float64
	Stroke      string
	StrokeWidth float64
}

func createAssSubtitleFile(clips []ExportTextClip, outWidth, outHeight, projWidth, projHeight int, tempDir string) (string, error) {
	if len(clips) == 0 {
		return "", nil
	}

	if tempDir == "" {
		tempDir = os.TempDir()
	}
	_ = os.MkdirAll(tempDir, 0755)
	tempFile := filepath.Join(tempDir, fmt.Sprintf("gocut_sub_%d.ass", time.Now().UnixNano()))
	var b strings.Builder

	b.WriteString("[Script Info]\n")
	b.WriteString("Title: GoCut Subtitles\n")
	b.WriteString("ScriptType: v4.00+\n")
	b.WriteString(fmt.Sprintf("PlayResX: %d\n", outWidth))
	b.WriteString(fmt.Sprintf("PlayResY: %d\n\n", outHeight))

	b.WriteString("[V4+ Styles]\n")
	b.WriteString("Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n")
	b.WriteString("Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,2,0,2,20,20,40,1\n\n")

	b.WriteString("[Events]\n")
	b.WriteString("Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")

	ratioX := float64(outWidth) / float64(projWidth)
	ratioY := float64(outHeight) / float64(projHeight)

	for _, c := range clips {
		startTs := formatAssTime(c.Start)
		endTs := formatAssTime(c.Start + c.Duration)

		fs := int(c.FontSize * ratioY)
		if fs <= 0 {
			fs = 42
		}

		posX := outWidth/2 + int(c.X*ratioX)
		posY := outHeight/2 + int(c.Y*ratioY)

		assColor := hexToAssColor(c.Color)
		borderWidth := int(c.StrokeWidth * ratioY)
		if borderWidth <= 0 {
			borderWidth = 2
		}
		borderColor := hexToAssColor(c.Stroke)
		if c.Stroke == "" {
			borderColor = "&H00000000&"
		}

		cleanText := strings.ReplaceAll(c.Text, "\r\n", "\\N")
		cleanText = strings.ReplaceAll(cleanText, "\n", "\\N")

		styleTag := fmt.Sprintf("{\\an5\\pos(%d,%d)\\fs%d\\c%s\\bord%d\\3c%s}", posX, posY, fs, assColor, borderWidth, borderColor)
		b.WriteString(fmt.Sprintf("Dialogue: 0,%s,%s,Default,,0,0,0,,%s%s\n", startTs, endTs, styleTag, cleanText))
	}

	if err := os.WriteFile(tempFile, []byte(b.String()), 0644); err != nil {
		return "", err
	}
	return tempFile, nil
}

type ExportClipEffects struct {
	Grain *struct {
		Enabled             bool    `json:"enabled"`
		Preset              string  `json:"preset"`
		Engine              string  `json:"engine"`
		Movement            string  `json:"movement"`
		Intensity           float64 `json:"intensity"`
		GrainSize           string  `json:"grainSize"`
		HighlightProtection bool    `json:"highlightProtection"`
		ChromaticDispersion bool    `json:"chromaticDispersion"`
	} `json:"grain"`
	Blur *struct {
		Enabled bool    `json:"enabled"`
		Type    string  `json:"type"`
		Radius  float64 `json:"radius"`
		Angle   float64 `json:"angle"`
	} `json:"blur"`
	Stylize *struct {
		Enabled             bool    `json:"enabled"`
		Vignette            float64 `json:"vignette"`
		ChromaticAberration float64 `json:"chromaticAberration"`
		Scanlines           float64 `json:"scanlines"`
		Bloom               float64 `json:"bloom"`
		Sharpen             float64 `json:"sharpen"`
	} `json:"stylize"`
}

func ffmpegBlendMode(mode string) string {
	switch mode {
	case "screen":
		return "screen"
	case "multiply":
		return "multiply"
	case "overlay":
		return "overlay"
	case "soft-light":
		return "softlight"
	case "hard-light":
		return "hardlight"
	case "color-dodge":
		return "dodge"
	default:
		return ""
	}
}

func buildClipEffectFilters(blurAdj float64, eff *ExportClipEffects) []string {
	var filters []string
	if blurAdj > 0 {
		filters = append(filters, fmt.Sprintf("gblur=sigma=%.2f", blurAdj))
	}
	if eff == nil {
		return filters
	}
	if eff.Blur != nil && eff.Blur.Enabled && eff.Blur.Radius > 0 {
		r := eff.Blur.Radius
		if r > 50 {
			r = 50
		}
		if eff.Blur.Type == "motion" {
			angle := int(math.Mod(eff.Blur.Angle, 360))
			if angle < 0 {
				angle += 360
			}
			filters = append(filters, fmt.Sprintf("dblur=angle=%d:radius=%.1f", angle, r))
		} else {
			filters = append(filters, fmt.Sprintf("gblur=sigma=%.2f", r*0.75))
		}
	}
	if eff.Stylize != nil && eff.Stylize.Enabled {
		if eff.Stylize.ChromaticAberration > 0 {
			shift := int(math.Round(eff.Stylize.ChromaticAberration))
			if shift < 1 {
				shift = 1
			} else if shift > 32 {
				shift = 32
			}
			filters = append(filters, fmt.Sprintf("rgbashift=rh=-%d:bh=%d", shift, shift))
		}
		if eff.Stylize.Sharpen > 0 {
			amt := (eff.Stylize.Sharpen / 100.0) * 1.8
			if amt < 0.1 {
				amt = 0.1
			} else if amt > 2.5 {
				amt = 2.5
			}
			filters = append(filters, fmt.Sprintf("unsharp=5:5:%.2f:5:5:0.0", amt))
		}
		if eff.Stylize.Bloom > 0 {
			b := (eff.Stylize.Bloom / 100.0) * 0.12
			filters = append(filters, fmt.Sprintf("eq=brightness=%.3f:saturation=1.06", b))
		}
		if eff.Stylize.Vignette > 0 {
			angle := (eff.Stylize.Vignette / 100.0) * (math.Pi / 3.5)
			if angle < 0.08 {
				angle = 0.08
			} else if angle > 1.2 {
				angle = 1.2
			}
			filters = append(filters, fmt.Sprintf("vignette=angle=%.3f", angle))
		}
	}
	if eff.Grain != nil && eff.Grain.Enabled && eff.Grain.Intensity > 0 {
		alls := int(math.Round(eff.Grain.Intensity * 0.42))
		if alls < 1 {
			alls = 1
		} else if alls > 65 {
			alls = 65
		}
		flags := "u"
		if eff.Grain.Movement == "dynamic" {
			flags = "t+u"
		}
		filters = append(filters, fmt.Sprintf("noise=alls=%d:allf=%s", alls, flags))
	}
	return filters
}

func (a *App) BuildExportArgs(projectJson string, optionsJson string) (string, float64, []string, error) {
	var proj struct {
		Name       string       `json:"name"`
		Width      int          `json:"width"`
		Height     int          `json:"height"`
		Fps        float64      `json:"fps"`
		Background string       `json:"background"`
		Assets     []MediaAsset `json:"assets"`
		Clips      []struct {
			ID                string  `json:"id"`
			TrackID           string  `json:"trackId"`
			AssetID           string  `json:"assetId"`
			Name              string  `json:"name"`
			Start             float64 `json:"start"`
			Duration          float64 `json:"duration"`
			SourceIn          float64 `json:"sourceIn"`
			Speed             float64 `json:"speed"`
			Volume            float64 `json:"volume"`
			Muted             bool    `json:"muted"`
			FadeIn            float64 `json:"fadeIn"`
			FadeOut           float64 `json:"fadeOut"`
			AudioFadeIn       float64 `json:"audioFadeIn"`
			AudioFadeOut      float64 `json:"audioFadeOut"`
			BlendMode         string  `json:"blendMode"`
			IsAdjustmentLayer bool    `json:"isAdjustmentLayer"`
			Transform         *struct {
				X        float64 `json:"x"`
				Y        float64 `json:"y"`
				Scale    float64 `json:"scale"`
				Rotation float64 `json:"rotation"`
				Opacity  float64 `json:"opacity"`
				FlipX    bool    `json:"flipX"`
				FlipY    bool    `json:"flipY"`
			} `json:"transform"`
			Adjustments *struct {
				Brightness  float64 `json:"brightness"`
				Contrast    float64 `json:"contrast"`
				Saturation  float64 `json:"saturation"`
				Temperature float64 `json:"temperature"`
				Blur        float64 `json:"blur"`
			} `json:"adjustments"`
			Effects *ExportClipEffects `json:"effects"`
			Text    *struct {
				Text        string  `json:"text"`
				FontSize    float64 `json:"fontSize"`
				FontFamily  string  `json:"fontFamily"`
				Color       string  `json:"color"`
				Background  string  `json:"background"`
				Align       string  `json:"align"`
				Bold        bool    `json:"bold"`
				Stroke      string  `json:"stroke"`
				StrokeWidth float64 `json:"strokeWidth"`
			} `json:"text"`
		} `json:"clips"`
		Tracks []struct {
			ID     string `json:"id"`
			Kind   string `json:"kind"`
			Name   string `json:"name"`
			Muted  bool   `json:"muted"`
			Hidden bool   `json:"hidden"`
			Solo   bool   `json:"solo"`
		} `json:"tracks"`
		Transitions []struct {
			ID         string  `json:"id"`
			TrackID    string  `json:"trackId"`
			FromClipID string  `json:"fromClipId"`
			ToClipID   string  `json:"toClipId"`
			Type       string  `json:"type"`
			Duration   float64 `json:"duration"`
		} `json:"transitions"`
	}
	if err := json.Unmarshal([]byte(projectJson), &proj); err != nil {
		return "", 0, nil, fmt.Errorf("invalid project json: %w", err)
	}

	var opts struct {
		Path       string  `json:"path"`
		OutputPath string  `json:"outputPath"`
		Format     string  `json:"format"`
		Codec      string  `json:"codec"`
		Duration   float64 `json:"duration"`
		Width      int     `json:"width"`
		Height     int     `json:"height"`
		Fps        float64 `json:"fps"`
		Encoder    string  `json:"encoder"`
		Quality    string  `json:"quality"`
		Bitrate    string  `json:"bitrate"`
	}
	_ = json.Unmarshal([]byte(optionsJson), &opts)

	targetFile := opts.Path
	if targetFile == "" {
		targetFile = opts.OutputPath
	}
	if targetFile == "" {
		var err error
		targetFile, err = runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
			Title:           "Export Video",
			DefaultFilename: "output.mp4",
			Filters: []runtime.FileFilter{
				{DisplayName: "Video (*.mp4)", Pattern: "*.mp4"},
			},
		})
		if err != nil || targetFile == "" {
			return "", 0, nil, err
		}
	}

	targetDir := filepath.Dir(targetFile)
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return "", 0, nil, fmt.Errorf("failed to create destination directory: %w", err)
	}

	if fi, err := os.Stat(targetFile); err == nil && !fi.IsDir() {
		f, err := os.OpenFile(targetFile, os.O_WRONLY, 0666)
		if err != nil {
			return "", 0, nil, fmt.Errorf("target file is locked by another program: %s. Please close it first", filepath.Base(targetFile))
		}
		_ = f.Close()
	}

	assetMap := make(map[string]MediaAsset)
	for _, as := range proj.Assets {
		assetMap[as.ID] = as
	}
	type TrackMeta struct {
		Kind   string
		Name   string
		Muted  bool
		Hidden bool
		Solo   bool
	}
	trackMeta := make(map[string]TrackMeta)
	hasSoloVisual := false
	hasSoloAudio := false
	for _, tr := range proj.Tracks {
		trackMeta[tr.ID] = TrackMeta{
			Kind:   tr.Kind,
			Name:   tr.Name,
			Muted:  tr.Muted,
			Hidden: tr.Hidden,
			Solo:   tr.Solo,
		}
		if tr.Solo {
			if tr.Kind != "audio" {
				hasSoloVisual = true
			}
			if tr.Kind == "audio" || tr.Kind == "video" {
				hasSoloAudio = true
			}
		}
	}

	outWidth := opts.Width
	if outWidth <= 0 {
		outWidth = proj.Width
	}
	if outWidth <= 0 {
		outWidth = 1920
	}
	if outWidth%2 != 0 {
		outWidth++
	}

	outHeight := opts.Height
	if outHeight <= 0 {
		outHeight = proj.Height
	}
	if outHeight <= 0 {
		outHeight = 1080
	}
	if outHeight%2 != 0 {
		outHeight++
	}

	fps := opts.Fps
	if fps <= 0 {
		fps = proj.Fps
	}
	if fps <= 0 {
		fps = 30
	}

	dur := opts.Duration
	if dur <= 0 {
		for _, c := range proj.Clips {
			if end := c.Start + c.Duration; end > dur {
				dur = end
			}
		}
	}
	if dur <= 0 {
		dur = 5.0
	}

	trackOrder := make(map[string]int)
	for idx, tr := range proj.Tracks {
		trackOrder[tr.ID] = len(proj.Tracks) - 1 - idx
	}

	type VisualClip struct {
		ID                string
		TrackID           string
		Path              string
		Start             float64
		Duration          float64
		SourceIn          float64
		Speed             float64
		Kind              string
		TrackOrder        int
		X                 float64
		Y                 float64
		Scale             float64
		Rotation          float64
		Brightness        float64
		Contrast          float64
		Saturation        float64
		FadeIn            float64
		FadeOut           float64
		BlendMode         string
		IsAdjustmentLayer bool
		EffectFilters     []string
	}

	type AudioClip struct {
		ID       string
		Path     string
		Start    float64
		Duration float64
		SourceIn float64
		Speed    float64
		Volume   float64
		FadeIn   float64
		FadeOut  float64
	}

	var visualClips []VisualClip
	var audioClips []AudioClip
	var textClips []ExportTextClip
	mediaInputCount := 0

	for _, c := range proj.Clips {
		tm, hasTrack := trackMeta[c.TrackID]
		isTrackVisualVisible := (!hasTrack || !tm.Hidden) && (!hasSoloVisual || (hasTrack && tm.Solo))

		// Handle Text / Subtitle clips
		if c.Text != nil && c.Text.Text != "" && isTrackVisualVisible {
			posX := 0.0
			posY := 0.0
			if c.Transform != nil {
				posX = c.Transform.X
				posY = c.Transform.Y
			}
			textClips = append(textClips, ExportTextClip{
				Text:        c.Text.Text,
				Start:       c.Start,
				Duration:    c.Duration,
				FontSize:    c.Text.FontSize,
				FontFamily:  c.Text.FontFamily,
				Color:       c.Text.Color,
				X:           posX,
				Y:           posY,
				Stroke:      c.Text.Stroke,
				StrokeWidth: c.Text.StrokeWidth,
			})
			continue
		}

		// Handle Adjustment Layer clips (no asset file required)
		if c.IsAdjustmentLayer {
			if isTrackVisualVisible {
				b := 0.0
				contrast := 1.0
				sat := 1.0
				blurAdj := 0.0
				if c.Adjustments != nil {
					b = c.Adjustments.Brightness
					if c.Adjustments.Contrast > 0 {
						contrast = c.Adjustments.Contrast
					}
					if c.Adjustments.Saturation >= 0 {
						sat = c.Adjustments.Saturation
					}
					blurAdj = c.Adjustments.Blur
				}
				effFilters := buildClipEffectFilters(blurAdj, c.Effects)
				visualClips = append(visualClips, VisualClip{
					ID:                c.ID,
					TrackID:           c.TrackID,
					Start:             c.Start,
					Duration:          c.Duration,
					Speed:             1.0,
					Kind:              "adjustment",
					TrackOrder:        trackOrder[c.TrackID],
					Scale:             1.0,
					Brightness:        b,
					Contrast:          contrast,
					Saturation:        sat,
					IsAdjustmentLayer: true,
					EffectFilters:     effFilters,
				})
			}
			continue
		}

		as, ok := assetMap[c.AssetID]
		if !ok || as.Path == "" {
			continue
		}
		clipPath := media.NormalizePath(as.Path)
		if resolved, err := media.ResolvePath(clipPath); err == nil && resolved != "" {
			clipPath = resolved
		}
		if _, err := os.Stat(clipPath); err != nil {
			return "", 0, nil, fmt.Errorf("Media file not found: %s (%s). Please verify the file has not been moved.", as.Name, as.Path)
		}
		speed := c.Speed
		if speed <= 0 {
			speed = 1.0
		}
		vol := c.Volume
		if vol <= 0 && !c.Muted {
			vol = 1.0
		}

		// Visual inclusion (video or image)
		isVisual := (as.Kind == "video" || as.Kind == "image") && isTrackVisualVisible
		if isVisual {
			posX := 0.0
			posY := 0.0
			scale := 1.0
			rot := 0.0
			if c.Transform != nil {
				posX = c.Transform.X
				posY = c.Transform.Y
				if c.Transform.Scale > 0 {
					scale = c.Transform.Scale
				}
				rot = c.Transform.Rotation
			}
			b := 0.0
			contrast := 1.0
			sat := 1.0
			blurAdj := 0.0
			if c.Adjustments != nil {
				b = c.Adjustments.Brightness
				if c.Adjustments.Contrast > 0 {
					contrast = c.Adjustments.Contrast
				}
				if c.Adjustments.Saturation >= 0 {
					sat = c.Adjustments.Saturation
				}
				blurAdj = c.Adjustments.Blur
			}
			effFilters := buildClipEffectFilters(blurAdj, c.Effects)

			visualClips = append(visualClips, VisualClip{
				ID:            c.ID,
				TrackID:       c.TrackID,
				Path:          clipPath,
				Start:         c.Start,
				Duration:      c.Duration,
				SourceIn:      c.SourceIn,
				Speed:         speed,
				Kind:          as.Kind,
				TrackOrder:    trackOrder[c.TrackID],
				X:             posX,
				Y:             posY,
				Scale:         scale,
				Rotation:      rot,
				Brightness:    b,
				Contrast:      contrast,
				Saturation:    sat,
				FadeIn:        c.FadeIn,
				FadeOut:       c.FadeOut,
				BlendMode:     c.BlendMode,
				EffectFilters: effFilters,
			})
			mediaInputCount++
		}

		// Audio inclusion
		isAudioMuted := c.Muted || (hasTrack && tm.Muted) || (hasSoloAudio && (!hasTrack || !tm.Solo))
		if !isAudioMuted {
			hasAudioStream := as.Kind == "audio" || (hasTrack && tm.Kind == "audio") || (as.Kind == "video" && as.HasAudio)
			if hasAudioStream {
				audioClips = append(audioClips, AudioClip{
					ID:       c.ID,
					Path:     clipPath,
					Start:    c.Start,
					Duration: c.Duration,
					SourceIn: c.SourceIn,
					Speed:    speed,
					Volume:   vol,
					FadeIn:   c.AudioFadeIn,
					FadeOut:  c.AudioFadeOut,
				})
			}
		}
	}

	sort.SliceStable(visualClips, func(i, j int) bool {
		if visualClips[i].TrackOrder != visualClips[j].TrackOrder {
			return visualClips[i].TrackOrder < visualClips[j].TrackOrder
		}
		return visualClips[i].Start < visualClips[j].Start
	})

	// Apply transitions to visual and audio clip fades
	for _, tr := range proj.Transitions {
		for i := range visualClips {
			if visualClips[i].ID == tr.FromClipID && visualClips[i].FadeOut == 0 {
				visualClips[i].FadeOut = tr.Duration
			}
			if visualClips[i].ID == tr.ToClipID && visualClips[i].FadeIn == 0 {
				visualClips[i].FadeIn = tr.Duration
			}
		}
		for i := range audioClips {
			if audioClips[i].ID == tr.FromClipID && audioClips[i].FadeOut == 0 {
				audioClips[i].FadeOut = tr.Duration
			}
			if audioClips[i].ID == tr.ToClipID && audioClips[i].FadeIn == 0 {
				audioClips[i].FadeIn = tr.Duration
			}
		}
	}

	isAudioOnly := opts.Format == "mp3" || opts.Format == "wav"

	var args []string
	args = append(args, "-y")

	var filterComplex []string
	var currentBase string
	var audioStartIdx int

	if isAudioOnly {
		audioStartIdx = 0
	} else {
		// Detect if project is a simple sequence of adjacent full-frame clips without complex visual transforms
		isSimpleSequential := len(visualClips) > 0 && len(proj.Transitions) == 0
		if isSimpleSequential {
			var expectedStart float64 = 0.0
			for _, vc := range visualClips {
				if vc.IsAdjustmentLayer || len(vc.EffectFilters) > 0 || (vc.BlendMode != "" && vc.BlendMode != "normal") ||
					math.Abs(vc.Scale-1.0) > 0.001 || vc.X != 0 || vc.Y != 0 || vc.Rotation != 0 ||
					vc.Brightness != 0 || vc.Contrast != 1 || vc.Saturation != 1 ||
					vc.FadeIn != 0 || vc.FadeOut != 0 || vc.Speed != 1.0 {
					isSimpleSequential = false
					break
				}
				if math.Abs(vc.Start-expectedStart) > 0.05 {
					isSimpleSequential = false
					break
				}
				expectedStart = vc.Start + vc.Duration
			}
			// Visual clips must cover the entire export duration
			if math.Abs(expectedStart-dur) > 0.1 {
				isSimpleSequential = false
			}
		}

		if isSimpleSequential {
			for i, vc := range visualClips {
				inIdx := i
				durSec := vc.Duration * vc.Speed
				if vc.Kind == "image" {
					args = append(args, "-loop", "1", "-t", fmt.Sprintf("%.3f", vc.Duration), "-i", vc.Path)
				} else {
					args = append(args, "-ss", fmt.Sprintf("%.3f", vc.SourceIn), "-t", fmt.Sprintf("%.3f", durSec), "-i", vc.Path)
				}

				clipTag := fmt.Sprintf("v%d", inIdx)
				filterComplex = append(filterComplex, fmt.Sprintf("[%d:v]scale=%d:%d:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=%d:%d:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=%.2f,format=yuv420p[%s]",
					inIdx, outWidth, outHeight, outWidth, outHeight, fps, clipTag))
			}

			if len(visualClips) > 1 {
				var concatInputs []string
				for i := range visualClips {
					concatInputs = append(concatInputs, fmt.Sprintf("[v%d]", i))
				}
				filterComplex = append(filterComplex, fmt.Sprintf("%sconcat=n=%d:v=1:a=0[vconcat]", strings.Join(concatInputs, ""), len(visualClips)))
				currentBase = "[vconcat]"
			} else {
				currentBase = "[v0]"
			}

			audioStartIdx = len(visualClips)
		} else {
			bg := "black"
			if proj.Background != "" && proj.Background != "transparent" {
				bg = proj.Background
				if strings.HasPrefix(bg, "#") {
					bg = "0x" + bg[1:]
				}
			}
			args = append(args, "-f", "lavfi", "-i", fmt.Sprintf("color=c=%s:s=%dx%d:r=%.2f:d=%.2f", bg, outWidth, outHeight, fps, dur))

			currentBase = "[0:v]"
			ratioX := float64(outWidth) / float64(proj.Width)
			ratioY := float64(outHeight) / float64(proj.Height)

			mediaInIdx := 0
			for i, vc := range visualClips {
				if vc.IsAdjustmentLayer {
					var adjFilters []string
					if vc.Brightness != 0 || vc.Contrast != 1 || vc.Saturation != 1 {
						adjFilters = append(adjFilters, fmt.Sprintf("eq=brightness=%.2f:contrast=%.2f:saturation=%.2f", vc.Brightness, vc.Contrast, vc.Saturation))
					}
					adjFilters = append(adjFilters, vc.EffectFilters...)
					if len(adjFilters) > 0 {
						rawTag := fmt.Sprintf("[adj_raw_%d]", i)
						modTag := fmt.Sprintf("[adj_mod_%d]", i)
						fltTag := fmt.Sprintf("[adj_flt_%d]", i)
						nextBase := fmt.Sprintf("[base_adj_%d]", i)
						filterComplex = append(filterComplex, fmt.Sprintf("%ssplit=2%s%s", currentBase, rawTag, modTag))
						filterComplex = append(filterComplex, fmt.Sprintf("%s%s%s", modTag, strings.Join(adjFilters, ","), fltTag))
						filterComplex = append(filterComplex, fmt.Sprintf("%s%soverlay=enable='between(t,%.3f,%.3f)'%s", rawTag, fltTag, vc.Start, vc.Start+vc.Duration, nextBase))
						currentBase = nextBase
					}
					continue
				}

				mediaInIdx++
				inIdx := mediaInIdx
				durSec := vc.Duration * vc.Speed
				if vc.Kind == "image" {
					args = append(args, "-loop", "1", "-t", fmt.Sprintf("%.3f", vc.Duration), "-i", vc.Path)
				} else {
					args = append(args, "-ss", fmt.Sprintf("%.3f", vc.SourceIn), "-t", fmt.Sprintf("%.3f", durSec), "-i", vc.Path)
				}

				clipTag := fmt.Sprintf("v%d", inIdx)

				// Calculate scaled clip width and height
				clipW := int(float64(outWidth) * vc.Scale)
				clipH := int(float64(outHeight) * vc.Scale)
				if clipW%2 != 0 {
					clipW++
				}
				if clipH%2 != 0 {
					clipH++
				}

				// Calculate position overlay offset
				posX := (outWidth-clipW)/2 + int(vc.X*ratioX)
				posY := (outHeight-clipH)/2 + int(vc.Y*ratioY)

				var clipFilters []string
				clipFilters = append(clipFilters, fmt.Sprintf("scale=%d:%d:force_original_aspect_ratio=decrease:force_divisible_by=2", clipW, clipH))
				clipFilters = append(clipFilters, fmt.Sprintf("pad=%d:%d:(ow-iw)/2:(oh-ih)/2", clipW, clipH))

				// Color adjustments
				if vc.Brightness != 0 || vc.Contrast != 1 || vc.Saturation != 1 {
					clipFilters = append(clipFilters, fmt.Sprintf("eq=brightness=%.2f:contrast=%.2f:saturation=%.2f", vc.Brightness, vc.Contrast, vc.Saturation))
				}

				// Pro Effects (Film Grain, Blur, Stylize)
				if len(vc.EffectFilters) > 0 {
					clipFilters = append(clipFilters, vc.EffectFilters...)
				}

				// Fade In / Out
				if vc.FadeIn > 0 {
					clipFilters = append(clipFilters, fmt.Sprintf("fade=t=in:st=0:d=%.3f:alpha=1", vc.FadeIn))
				}
				if vc.FadeOut > 0 {
					st := vc.Duration - vc.FadeOut
					if st < 0 {
						st = 0
					}
					clipFilters = append(clipFilters, fmt.Sprintf("fade=t=out:st=%.3f:d=%.3f:alpha=1", st, vc.FadeOut))
				}

				// Rotation
				if vc.Rotation != 0 {
					clipFilters = append(clipFilters, fmt.Sprintf("rotate=%.4f*PI/180:fillcolor=none:ow='hypot(iw,ih)':oh='hypot(iw,ih)'", vc.Rotation))
				}

				clipFilters = append(clipFilters, "setsar=1", "format=rgba")
				clipFilters = append(clipFilters, fmt.Sprintf("setpts=PTS-STARTPTS+%.3f/TB", vc.Start))

				filterComplex = append(filterComplex, fmt.Sprintf("[%d:v]%s[%s]", inIdx, strings.Join(clipFilters, ","), clipTag))

				xExpr := fmt.Sprintf("%d", posX)
				yExpr := fmt.Sprintf("%d", posY)

				for _, tr := range proj.Transitions {
					if tr.ToClipID == vc.ID && tr.Duration > 0 {
						tEnd := vc.Start + tr.Duration
						switch tr.Type {
						case "slide-left":
							xExpr = fmt.Sprintf("if(between(t,%.3f,%.3f),%d+(%d)*(%.3f-t)/%.3f,%d)", vc.Start, tEnd, posX, outWidth, tEnd, tr.Duration, posX)
						case "slide-right":
							xExpr = fmt.Sprintf("if(between(t,%.3f,%.3f),%d-(%d)*(%.3f-t)/%.3f,%d)", vc.Start, tEnd, posX, outWidth, tEnd, tr.Duration, posX)
						case "slide-up":
							yExpr = fmt.Sprintf("if(between(t,%.3f,%.3f),%d+(%d)*(%.3f-t)/%.3f,%d)", vc.Start, tEnd, posY, outHeight, tEnd, tr.Duration, posY)
						case "slide-down":
							yExpr = fmt.Sprintf("if(between(t,%.3f,%.3f),%d-(%d)*(%.3f-t)/%.3f,%d)", vc.Start, tEnd, posY, outHeight, tEnd, tr.Duration, posY)
						}
						break
					}
				}

				nextBase := fmt.Sprintf("[base%d]", inIdx)
				if bMode := ffmpegBlendMode(vc.BlendMode); bMode != "" {
					bRaw := fmt.Sprintf("[braw_%d]", inIdx)
					bUnder := fmt.Sprintf("[bunder_%d]", inIdx)
					bOver := fmt.Sprintf("[bover_%d]", inIdx)
					filterComplex = append(filterComplex, fmt.Sprintf("%ssplit=2%s%s", currentBase, bRaw, bUnder))
					filterComplex = append(filterComplex, fmt.Sprintf("%s[%s]overlay=x='%s':y='%s':enable='between(t,%.3f,%.3f)'%s", bUnder, clipTag, xExpr, yExpr, vc.Start, vc.Start+vc.Duration, bOver))
					filterComplex = append(filterComplex, fmt.Sprintf("%s%sblend=all_mode=%s:enable='between(t,%.3f,%.3f)'%s", bOver, bRaw, bMode, vc.Start, vc.Start+vc.Duration, nextBase))
				} else {
					filterComplex = append(filterComplex, fmt.Sprintf("%s[%s]overlay=x='%s':y='%s':enable='between(t,%.3f,%.3f)'%s", currentBase, clipTag, xExpr, yExpr, vc.Start, vc.Start+vc.Duration, nextBase))
				}
				currentBase = nextBase
			}

			audioStartIdx = mediaInputCount + 1
		}

		// Render Text & Subtitle Clips via ASS subtitles filter if any exist
		if len(textClips) > 0 {
			var subDir string
			if a.storage != nil {
				subDir = filepath.Join(a.storage.GetTempDir(), "subtitles")
			}
			assPath, err := createAssSubtitleFile(textClips, outWidth, outHeight, proj.Width, proj.Height, subDir)
			if err == nil && assPath != "" {
				// Schedule cleanup of temporary ASS file after 15 minutes
				time.AfterFunc(15*time.Minute, func() {
					_ = os.Remove(assPath)
				})
				escapedAss := strings.ReplaceAll(filepath.ToSlash(assPath), ":", "\\:")
				nextBase := "[with_subtitles]"
				filterComplex = append(filterComplex, fmt.Sprintf("%ssubtitles=filename='%s'%s", currentBase, escapedAss, nextBase))
				currentBase = nextBase
			}
		}
	}

	var audioTags []string

	for j, ac := range audioClips {
		inIdx := audioStartIdx + j
		durSec := ac.Duration * ac.Speed
		args = append(args, "-ss", fmt.Sprintf("%.3f", ac.SourceIn), "-t", fmt.Sprintf("%.3f", durSec), "-i", ac.Path)

		tag := fmt.Sprintf("a%d", j+1)
		delayMs := int64(ac.Start * 1000)
		if delayMs < 0 {
			delayMs = 0
		}
		var aFilters []string
		aFilters = append(aFilters, fmt.Sprintf("volume=%.2f", ac.Volume))
		if ac.FadeIn > 0 {
			aFilters = append(aFilters, fmt.Sprintf("afade=t=in:ss=0:d=%.3f:curve=qsin", ac.FadeIn))
		}
		if ac.FadeOut > 0 {
			st := ac.Duration - ac.FadeOut
			if st < 0 {
				st = 0
			}
			aFilters = append(aFilters, fmt.Sprintf("afade=t=out:st=%.3f:d=%.3f:curve=qsin", st, ac.FadeOut))
		}
		aFilters = append(aFilters, "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo", fmt.Sprintf("adelay=delays=%d:all=1", delayMs))
		filterComplex = append(filterComplex, fmt.Sprintf("[%d:a]%s[%s]", inIdx, strings.Join(aFilters, ","), tag))
		audioTags = append(audioTags, fmt.Sprintf("[%s]", tag))
	}

	hasAudioOutput := false
	if len(audioTags) > 1 {
		filterComplex = append(filterComplex, fmt.Sprintf("%samix=inputs=%d:duration=longest:dropout_transition=0[aout]", strings.Join(audioTags, ""), len(audioTags)))
		hasAudioOutput = true
	} else if len(audioTags) == 1 {
		filterComplex = append(filterComplex, fmt.Sprintf("%sanull[aout]", audioTags[0]))
		hasAudioOutput = true
	} else if isAudioOnly {
		args = append(args, "-f", "lavfi", "-i", fmt.Sprintf("anullsrc=channel_layout=stereo:sample_rate=48000:d=%.2f", dur))
		filterComplex = append(filterComplex, fmt.Sprintf("[%d:a]anull[aout]", audioStartIdx))
		hasAudioOutput = true
	}

	if len(filterComplex) > 0 {
		args = append(args, "-filter_complex", strings.Join(filterComplex, "; "))
	}

	if isAudioOnly {
		args = append(args, "-vn", "-map", "[aout]")
		if opts.Format == "wav" {
			args = append(args, "-c:a", "pcm_s16le")
		} else {
			args = append(args, "-c:a", "libmp3lame", "-b:a", "192k")
		}
		args = append(args, "-progress", "pipe:1", "-t", fmt.Sprintf("%.3f", dur), targetFile)
		return targetFile, dur, args, nil
	}

	args = append(args, "-map", currentBase)

	if hasAudioOutput {
		args = append(args, "-map", "[aout]", "-c:a", "aac", "-b:a", "192k")
	}

	useHevc := opts.Codec == "hevc"
	cpuCodec := "libx264"
	nvencCodec := "h264_nvenc"
	qsvCodec := "h264_qsv"
	amfCodec := "h264_amf"
	mfCodec := "h264_mf"
	if useHevc {
		cpuCodec = "libx265"
		nvencCodec = "hevc_nvenc"
		qsvCodec = "hevc_qsv"
		amfCodec = "hevc_amf"
		mfCodec = "hevc_mf"
	}

	// Default CPU software encoder fallback
	encoderArgs := []string{"-c:v", cpuCodec, "-preset", "veryfast", "-crf", "21", "-threads", "0"}
	switch opts.Quality {
	case "draft":
		encoderArgs = []string{"-c:v", cpuCodec, "-preset", "ultrafast", "-crf", "26", "-threads", "0"}
	case "high":
		encoderArgs = []string{"-c:v", cpuCodec, "-preset", "faster", "-crf", "18", "-threads", "0"}
	}

	buildNvencArgs := func() []string {
		switch opts.Quality {
		case "draft":
			return []string{"-c:v", nvencCodec, "-preset", "p1", "-cq", "28"}
		case "high":
			return []string{"-c:v", nvencCodec, "-preset", "p6", "-cq", "19"}
		default:
			return []string{"-c:v", nvencCodec, "-preset", "p4", "-cq", "23"}
		}
	}
	buildQsvArgs := func() []string {
		switch opts.Quality {
		case "draft":
			return []string{"-c:v", qsvCodec, "-global_quality", "28"}
		case "high":
			return []string{"-c:v", qsvCodec, "-global_quality", "19"}
		default:
			return []string{"-c:v", qsvCodec, "-global_quality", "23"}
		}
	}
	buildAmfArgs := func() []string {
		switch opts.Quality {
		case "draft":
			return []string{"-c:v", amfCodec, "-quality", "speed", "-rc", "cqp", "-qp_p", "28", "-qp_i", "28"}
		case "high":
			return []string{"-c:v", amfCodec, "-quality", "quality", "-rc", "cqp", "-qp_p", "19", "-qp_i", "19"}
		default:
			return []string{"-c:v", amfCodec, "-quality", "speed", "-rc", "cqp", "-qp_p", "23", "-qp_i", "23"}
		}
	}

	switch opts.Encoder {
	case "cpu":
		// Keep CPU software encoderArgs
	case "nvenc":
		if a.testEncoder(nvencCodec) {
			encoderArgs = buildNvencArgs()
		}
	case "qsv":
		if a.testEncoder(qsvCodec) {
			encoderArgs = buildQsvArgs()
		}
	case "amf":
		if a.testEncoder(amfCodec) {
			encoderArgs = buildAmfArgs()
		}
	default: // "auto", "gpu", or ""
		if a.testEncoder(nvencCodec) {
			encoderArgs = buildNvencArgs()
		} else if a.testEncoder(qsvCodec) {
			encoderArgs = buildQsvArgs()
		} else if a.testEncoder(amfCodec) {
			encoderArgs = buildAmfArgs()
		} else if a.testEncoder(mfCodec) {
			encoderArgs = []string{"-c:v", mfCodec}
		}
	}

	// Apply custom or preset bitrate if specified (e.g. "2M", "4M", "8M", "12M", "20M", "35M", "50M")
	if opts.Bitrate != "" && opts.Bitrate != "auto" {
		br := strings.TrimSpace(opts.Bitrate)
		if !strings.HasSuffix(br, "M") && !strings.HasSuffix(br, "m") && !strings.HasSuffix(br, "k") && !strings.HasSuffix(br, "K") {
			br = br + "M"
		}
		encoderArgs = append(encoderArgs, "-b:v", br, "-maxrate", br)
	}

	args = append(args, "-progress", "pipe:1")
	args = append(args, encoderArgs...)
	args = append(args, "-pix_fmt", "yuv420p", "-t", fmt.Sprintf("%.3f", dur), targetFile)

	return targetFile, dur, args, nil
}

func (a *App) StartExport(projectJson string, optionsJson string) (string, error) {
	jobId := uuid.NewString()

	targetFile, dur, args, err := a.BuildExportArgs(projectJson, optionsJson)
	if err != nil {
		return "", err
	}

	// Launch async export process
	go func() {
		err := a.runner.RunExport(jobId, args, dur, func(pct float64) {
			a.emitProgress(ExportProgressEvent{
				JobID:    jobId,
				Progress: pct / 100.0,
				Status:   "rendering",
				Message:  fmt.Sprintf("Rendering: %d%%", int(pct)),
			})
		})

		if err != nil {
			a.emitProgress(ExportProgressEvent{
				JobID:    jobId,
				Progress: 0,
				Status:   "error",
				Error:    err.Error(),
				Message:  err.Error(),
			})
		} else {
			a.emitProgress(ExportProgressEvent{
				JobID:    jobId,
				Progress: 1.0,
				Status:   "complete",
				Path:     targetFile,
				Message:  "Export complete",
			})
		}
	}()

	return jobId, nil
}

func (a *App) emitProgress(event ExportProgressEvent) {
	if a.ctx == nil {
		return
	}
	defer func() {
		_ = recover()
	}()
	runtime.EventsEmit(a.ctx, "export-progress", event)
}

func (a *App) CancelExport(jobId string) error {
	return a.runner.Cancel(jobId)
}

func (a *App) GetFontFamilies() []string {
	return []string{
		"Microsoft YaHei",
		"SimHei",
		"PingFang SC",
		"Noto Sans SC",
		"Segoe UI",
		"Arial",
		"Helvetica",
		"Times New Roman",
		"Georgia",
		"sans-serif",
	}
}

func (a *App) RelinkAsset(assetJson string) (*MediaAsset, error) {
	paths, err := runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Relink Media Asset",
		Filters: []runtime.FileFilter{
			{DisplayName: "Media Files", Pattern: "*.mp4;*.mov;*.webm;*.mp3;*.wav;*.png;*.jpg;*.jpeg"},
		},
	})
	if err != nil || len(paths) == 0 {
		return nil, err
	}
	assets, err := a.ImportMedia([]string{paths[0]})
	if err != nil || len(assets) == 0 {
		return nil, err
	}
	return &assets[0], nil
}

func (a *App) SetDirty(dirty bool) error {
	a.dirty = dirty
	return nil
}

func (a *App) CloseWindow() error {
	runtime.Quit(a.ctx)
	return nil
}

func (a *App) GetStartupProject() (*ProjectOpenResult, error) {
	// If CLI args provided a file path
	if len(os.Args) > 1 {
		arg := os.Args[1]
		lowerArg := strings.ToLower(arg)
		if strings.HasSuffix(lowerArg, ".gct") || strings.HasSuffix(lowerArg, ".gocut") || strings.HasSuffix(lowerArg, ".reacut") || strings.HasSuffix(lowerArg, ".json") {
			return a.OpenProject(arg)
		}
	}
	return nil, nil
}

func (a *App) SaveMediaCache(name string, base64Data string) (string, error) {
	safeName := filepath.Base(strings.TrimSpace(name))
	if safeName == "" || safeName == "." || safeName == ".." || safeName == string(filepath.Separator) {
		safeName = "media_" + uuid.NewString()
	}
	raw := base64Data
	if idx := strings.Index(base64Data, ","); idx != -1 {
		raw = base64Data[idx+1:]
	}
	data, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return "", fmt.Errorf("failed to decode base64: %w", err)
	}

	cacheDir := filepath.Join(a.storage.GetCacheDir(), "media")
	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		return "", err
	}
	targetPath := filepath.Join(cacheDir, safeName)
	absCache, err1 := filepath.Abs(cacheDir)
	absTarget, err2 := filepath.Abs(targetPath)
	if err1 != nil || err2 != nil || (!strings.HasPrefix(strings.ToLower(absTarget), strings.ToLower(absCache)+string(filepath.Separator))) {
		return "", fmt.Errorf("invalid media cache file name")
	}
	if err := os.WriteFile(targetPath, data, 0644); err != nil {
		return "", err
	}
	media.RegisterSearchDir(cacheDir)
	return targetPath, nil
}

func (a *App) CheckForUpdate(force bool) (*updater.UpdateInfo, error) {
	if a.updater == nil {
		return nil, fmt.Errorf("updater belum diinisialisasi")
	}
	return a.updater.CheckForUpdate(AppVersion, force)
}

func (a *App) DownloadUpdate(downloadUrl string) (string, error) {
	if a.updater == nil {
		return "", fmt.Errorf("updater belum diinisialisasi")
	}
	return a.updater.DownloadUpdate(context.Background(), downloadUrl, func(progress updater.UpdateProgress) {
		runtime.EventsEmit(a.ctx, "update_progress", progress)
	})
}

func (a *App) InstallUpdate(installerPath string) error {
	if a.updater == nil {
		return fmt.Errorf("updater belum diinisialisasi")
	}
	return a.updater.InstallUpdate(installerPath)
}

func (a *App) GetUpdateSettings() updater.UpdateSettings {
	if a.updater == nil {
		return updater.UpdateSettings{AutoCheck: true}
	}
	return a.updater.GetSettings()
}

func (a *App) SetAutoCheckUpdate(enabled bool) error {
	if a.updater == nil {
		return fmt.Errorf("updater belum diinisialisasi")
	}
	return a.updater.SetAutoCheck(enabled)
}

