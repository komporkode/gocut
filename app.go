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

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

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
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Path       string  `json:"path"`
	Url        string  `json:"url"`
	PreviewUrl string  `json:"previewUrl,omitempty"`
	Color      string  `json:"color,omitempty"`
	Kind       string  `json:"kind"`
	Width      int     `json:"width"`
	Height     int     `json:"height"`
	Fps        float64 `json:"fps"`
	Duration   float64 `json:"duration"`
	HasAudio   bool    `json:"hasAudio"`
	Missing    bool    `json:"missing"`
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
	dirty        bool
}

func NewApp() *App {
	sm, _ := project.NewStorageManager()
	return &App{
		mediaHandler: media.NewMediaHandler(),
		storage:      sm,
		runner:       ffmpeg.NewRunner(),
		capcut:       capcut.NewDraftReader(),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) GetSystemInfo() SystemInfo {
	ffmpegPath, ffmpegErr := a.runner.ResolveTool("ffmpeg")
	ffprobePath, ffprobeErr := a.runner.ResolveTool("ffprobe")

	version := "0.7.0-beta (GoCut/Wails/Go)"
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
	if toolName == "ffmpeg" {
		a.runner.SetCustomPaths(chosen, "")
	} else if toolName == "ffprobe" {
		a.runner.SetCustomPaths("", chosen)
	}
	return chosen, nil
}

func (a *App) OpenProject(path string) (*ProjectOpenResult, error) {
	target := path
	if target == "" {
		var err error
		target, err = runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
			Title: "Open ReaCut Project",
			Filters: []runtime.FileFilter{
				{DisplayName: "ReaCut Project (*.reacut)", Pattern: "*.reacut;*.json"},
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
			Title:           "Save ReaCut Project",
			DefaultFilename: "project.reacut",
			Filters: []runtime.FileFilter{
				{DisplayName: "ReaCut Project (*.reacut)", Pattern: "*.reacut"},
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

func (a *App) ChooseMediaFiles() ([]string, error) {
	paths, err := runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Import Media",
		Filters: []runtime.FileFilter{
			{DisplayName: "Media Files", Pattern: "*.mp4;*.mov;*.m4v;*.webm;*.mp3;*.wav;*.m4a;*.aac;*.png;*.jpg;*.jpeg;*.webp"},
		},
	})
	return paths, err
}

func (a *App) ImportMedia(paths []string) ([]MediaAsset, error) {
	var assets []MediaAsset
	for _, p := range paths {
		clean := media.NormalizePath(p)
		if resolved, err := media.ResolvePath(clean); err == nil && resolved != "" {
			clean = resolved
		}
		name := filepath.Base(clean)
		ext := strings.ToLower(filepath.Ext(clean))

		// Check if image
		isImage := ext == ".png" || ext == ".jpg" || ext == ".jpeg" || ext == ".webp"

		streamUrl := fmt.Sprintf("/media-stream?path=%s", url.QueryEscape(clean))

		if isImage {
			assets = append(assets, MediaAsset{
				ID:       uuid.NewString(),
				Name:     name,
				Path:     clean,
				Url:      streamUrl,
				Kind:     "image",
				Width:    1920,
				Height:   1080,
				Fps:      0,
				Duration: 5,
				HasAudio: false,
			})
			continue
		}

		probe, err := a.runner.Probe(clean)
		if err != nil {
			// Fallback placeholder
			assets = append(assets, MediaAsset{
				ID:       uuid.NewString(),
				Name:     name,
				Path:     clean,
				Url:      streamUrl,
				Kind:     "video",
				Width:    1920,
				Height:   1080,
				Fps:      30,
				Duration: 10,
				HasAudio: true,
			})
			continue
		}

		previewUrl := streamUrl
		if probe.Kind == "video" {
			if proxyPath, err := a.runner.EnsureProxy(clean, probe.Codec); err == nil && proxyPath != "" {
				previewUrl = fmt.Sprintf("/media-stream?path=%s", url.QueryEscape(proxyPath))
			}
		}

		assets = append(assets, MediaAsset{
			ID:         uuid.NewString(),
			Name:       name,
			Path:       clean,
			Url:        streamUrl,
			PreviewUrl: previewUrl,
			Kind:       probe.Kind,
			Width:      probe.Width,
			Height:     probe.Height,
			Fps:        probe.Fps,
			Duration:   probe.Duration,
			HasAudio:   probe.HasAudio,
		})
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

func createAssSubtitleFile(clips []ExportTextClip, outWidth, outHeight, projWidth, projHeight int) (string, error) {
	if len(clips) == 0 {
		return "", nil
	}

	tempFile := filepath.Join(os.TempDir(), fmt.Sprintf("gocut_sub_%d.ass", time.Now().UnixNano()))
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

func (a *App) BuildExportArgs(projectJson string, optionsJson string) (string, float64, []string, error) {
	var proj struct {
		Name       string       `json:"name"`
		Width      int          `json:"width"`
		Height     int          `json:"height"`
		Fps        float64      `json:"fps"`
		Background string       `json:"background"`
		Assets     []MediaAsset `json:"assets"`
		Clips      []struct {
			ID          string  `json:"id"`
			TrackID     string  `json:"trackId"`
			AssetID     string  `json:"assetId"`
			Name        string  `json:"name"`
			Start       float64 `json:"start"`
			Duration    float64 `json:"duration"`
			SourceIn    float64 `json:"sourceIn"`
			Speed       float64 `json:"speed"`
			Volume      float64 `json:"volume"`
			Muted       bool    `json:"muted"`
			FadeIn      float64 `json:"fadeIn"`
			FadeOut     float64 `json:"fadeOut"`
			Transform   *struct {
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
			Text *struct {
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
		} `json:"tracks"`
	}
	if err := json.Unmarshal([]byte(projectJson), &proj); err != nil {
		return "", 0, nil, fmt.Errorf("invalid project json: %w", err)
	}

	var opts struct {
		Path       string  `json:"path"`
		OutputPath string  `json:"outputPath"`
		Format     string  `json:"format"`
		Duration   float64 `json:"duration"`
		Width      int     `json:"width"`
		Height     int     `json:"height"`
		Fps        float64 `json:"fps"`
		Encoder    string  `json:"encoder"`
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
	}
	trackMeta := make(map[string]TrackMeta)
	for _, tr := range proj.Tracks {
		trackMeta[tr.ID] = TrackMeta{
			Kind:   tr.Kind,
			Name:   tr.Name,
			Muted:  tr.Muted,
			Hidden: tr.Hidden,
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
		Path        string
		Start       float64
		Duration    float64
		SourceIn    float64
		Speed       float64
		Kind        string
		TrackOrder  int
		X           float64
		Y           float64
		Scale       float64
		Rotation    float64
		Brightness  float64
		Contrast    float64
		Saturation  float64
		FadeIn      float64
		FadeOut     float64
	}

	type AudioClip struct {
		Path     string
		Start    float64
		Duration float64
		SourceIn float64
		Speed    float64
		Volume   float64
	}

	var visualClips []VisualClip
	var audioClips []AudioClip
	var textClips []ExportTextClip

	for _, c := range proj.Clips {
		tm, hasTrack := trackMeta[c.TrackID]

		// Handle Text / Subtitle clips
		if c.Text != nil && c.Text.Text != "" && (!hasTrack || !tm.Hidden) {
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
		isVisual := (as.Kind == "video" || as.Kind == "image") && (!hasTrack || !tm.Hidden)
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
			if c.Adjustments != nil {
				b = c.Adjustments.Brightness
				if c.Adjustments.Contrast > 0 {
					contrast = c.Adjustments.Contrast
				}
				if c.Adjustments.Saturation >= 0 {
					sat = c.Adjustments.Saturation
				}
			}

			visualClips = append(visualClips, VisualClip{
				Path:       clipPath,
				Start:      c.Start,
				Duration:   c.Duration,
				SourceIn:   c.SourceIn,
				Speed:      speed,
				Kind:       as.Kind,
				TrackOrder: trackOrder[c.TrackID],
				X:          posX,
				Y:          posY,
				Scale:      scale,
				Rotation:   rot,
				Brightness: b,
				Contrast:   contrast,
				Saturation: sat,
				FadeIn:     c.FadeIn,
				FadeOut:    c.FadeOut,
			})
		}

		// Audio inclusion
		isAudioMuted := c.Muted || (hasTrack && tm.Muted)
		if !isAudioMuted {
			hasAudioStream := as.Kind == "audio" || (hasTrack && tm.Kind == "audio") || (as.Kind == "video" && as.HasAudio)
			if hasAudioStream {
				audioClips = append(audioClips, AudioClip{
					Path:     clipPath,
					Start:    c.Start,
					Duration: c.Duration,
					SourceIn: c.SourceIn,
					Speed:    speed,
					Volume:   vol,
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

	var args []string
	args = append(args, "-y")

	bg := "black"
	if proj.Background != "" && proj.Background != "transparent" {
		bg = proj.Background
		if strings.HasPrefix(bg, "#") {
			bg = "0x" + bg[1:]
		}
	}
	args = append(args, "-f", "lavfi", "-i", fmt.Sprintf("color=c=%s:s=%dx%d:r=%.2f:d=%.2f", bg, outWidth, outHeight, fps, dur))

	var filterComplex []string
	currentBase := "[0:v]"

	ratioX := float64(outWidth) / float64(proj.Width)
	ratioY := float64(outHeight) / float64(proj.Height)

	for i, vc := range visualClips {
		inIdx := i + 1
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

		nextBase := fmt.Sprintf("[base%d]", inIdx)
		filterComplex = append(filterComplex, fmt.Sprintf("%s[%s]overlay=x=%d:y=%d:enable='between(t,%.3f,%.3f)'%s", currentBase, clipTag, posX, posY, vc.Start, vc.Start+vc.Duration, nextBase))
		currentBase = nextBase
	}

	// Render Text & Subtitle Clips via ASS subtitles filter if any exist
	if len(textClips) > 0 {
		assPath, err := createAssSubtitleFile(textClips, outWidth, outHeight, proj.Width, proj.Height)
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

	audioStartIdx := len(visualClips) + 1
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
		filterComplex = append(filterComplex, fmt.Sprintf("[%d:a]volume=%.2f,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,adelay=delays=%d:all=1[%s]", inIdx, ac.Volume, delayMs, tag))
		audioTags = append(audioTags, fmt.Sprintf("[%s]", tag))
	}

	hasAudioOutput := false
	if len(audioTags) > 1 {
		filterComplex = append(filterComplex, fmt.Sprintf("%samix=inputs=%d:duration=longest:dropout_transition=0[aout]", strings.Join(audioTags, ""), len(audioTags)))
		hasAudioOutput = true
	} else if len(audioTags) == 1 {
		filterComplex = append(filterComplex, fmt.Sprintf("%sanull[aout]", audioTags[0]))
		hasAudioOutput = true
	}

	if len(filterComplex) > 0 {
		args = append(args, "-filter_complex", strings.Join(filterComplex, "; "))
	}
	args = append(args, "-map", currentBase)

	if hasAudioOutput {
		args = append(args, "-map", "[aout]", "-c:a", "aac", "-b:a", "192k")
	}

	// Hardware Acceleration Selection (h264_mf, h264_nvenc, h264_qsv vs libx264)
	encoderArgs := []string{"-c:v", "libx264", "-preset", "medium", "-crf", "20"}
	if opts.Encoder != "cpu" {
		if a.testEncoder("h264_mf") {
			encoderArgs = []string{"-c:v", "h264_mf"}
		} else if a.testEncoder("h264_nvenc") {
			encoderArgs = []string{"-c:v", "h264_nvenc", "-preset", "p4", "-cq", "23"}
		} else if a.testEncoder("h264_qsv") {
			encoderArgs = []string{"-c:v", "h264_qsv", "-global_quality", "23"}
		}
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
		if strings.HasSuffix(strings.ToLower(arg), ".reacut") || strings.HasSuffix(strings.ToLower(arg), ".json") {
			return a.OpenProject(arg)
		}
	}
	return nil, nil
}

func (a *App) SaveMediaCache(name string, base64Data string) (string, error) {
	if name == "" {
		name = "media_" + uuid.NewString()
	}
	raw := base64Data
	if idx := strings.Index(base64Data, ","); idx != -1 {
		raw = base64Data[idx+1:]
	}
	data, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return "", fmt.Errorf("failed to decode base64: %w", err)
	}

	appData := os.Getenv("APPDATA")
	var cacheDir string
	if appData != "" {
		cacheDir = filepath.Join(appData, "reacut", "cache", "media")
	} else {
		home, _ := os.UserHomeDir()
		cacheDir = filepath.Join(home, ".reacut", "cache", "media")
	}
	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		return "", err
	}
	targetPath := filepath.Join(cacheDir, name)
	if err := os.WriteFile(targetPath, data, 0644); err != nil {
		return "", err
	}
	media.RegisterSearchDir(cacheDir)
	return targetPath, nil
}

