package ffmpeg

import (
	"bufio"
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"reacut/pkg/cmdutil"
)

type Runner struct {
	customFfmpeg  string
	customFfprobe string
	cacheDir      string
	tempDir       string
	jobs          sync.Map // jobId -> context.CancelFunc
}

func NewRunner() *Runner {
	return &Runner{}
}

func (r *Runner) SetDirs(cacheDir, tempDir string) {
	r.cacheDir = cacheDir
	r.tempDir = tempDir
}

func (r *Runner) GetProxyDir() string {
	if r.cacheDir != "" {
		dir := filepath.Join(r.cacheDir, "proxies")
		_ = os.MkdirAll(dir, 0755)
		return dir
	}
	dir := filepath.Join(os.TempDir(), "gocut", "proxies")
	_ = os.MkdirAll(dir, 0755)
	return dir
}

func (r *Runner) GetLogDir() string {
	if r.tempDir != "" {
		dir := filepath.Join(r.tempDir, "logs")
		_ = os.MkdirAll(dir, 0755)
		return dir
	}
	if r.cacheDir != "" {
		dir := filepath.Join(r.cacheDir, "logs")
		_ = os.MkdirAll(dir, 0755)
		return dir
	}
	dir := filepath.Join(os.TempDir(), "gocut", "logs")
	_ = os.MkdirAll(dir, 0755)
	return dir
}

func (r *Runner) SetCustomPaths(ffmpeg, ffprobe string) {
	r.customFfmpeg = ffmpeg
	r.customFfprobe = ffprobe
}

func (r *Runner) ResolveTool(name string) (string, error) {
	if name == "ffmpeg" && r.customFfmpeg != "" {
		if _, err := os.Stat(r.customFfmpeg); err == nil {
			return r.customFfmpeg, nil
		}
	}
	if name == "ffprobe" && r.customFfprobe != "" {
		if _, err := os.Stat(r.customFfprobe); err == nil {
			return r.customFfprobe, nil
		}
	}

	execDir, _ := os.Executable()
	baseDir := filepath.Dir(execDir)

	candidates := []string{
		filepath.Join(baseDir, "media-tools", name+".exe"),
		filepath.Join(baseDir, name+".exe"),
		filepath.Join(`C:\ffmpeg`, name+".exe"),
		filepath.Join(`C:\ffmpeg\bin`, name+".exe"),
		name + ".exe",
		name, // System PATH
	}

	for _, c := range candidates {
		if path, err := exec.LookPath(c); err == nil {
			return path, nil
		}
		if info, err := os.Stat(c); err == nil && !info.IsDir() {
			return c, nil
		}
	}

	return "", fmt.Errorf("tool %s not found on system or bundled directory", name)
}

type StreamInfo struct {
	CodecType    string                   `json:"codec_type"`
	CodecName    string                   `json:"codec_name"`
	Width        int                      `json:"width"`
	Height       int                      `json:"height"`
	AvgRFrame    string                   `json:"avg_frame_rate"`
	RFrameRate   string                   `json:"r_frame_rate"`
	Duration     string                   `json:"duration"`
	Tags         map[string]string        `json:"tags"`
	SideDataList []map[string]interface{} `json:"side_data_list"`
}

type FormatInfo struct {
	Duration string `json:"duration"`
	Size     string `json:"size"`
}

type ProbeData struct {
	Streams []StreamInfo `json:"streams"`
	Format  FormatInfo   `json:"format"`
}

type MediaProbeResult struct {
	Duration float64 `json:"duration"`
	Width    int     `json:"width"`
	Height   int     `json:"height"`
	Fps      float64 `json:"fps"`
	HasAudio bool    `json:"hasAudio"`
	Kind     string  `json:"kind"`
	Codec    string  `json:"codec,omitempty"`
	Rotation int     `json:"rotation,omitempty"`
}

func parseRotation(tags map[string]string, sideData []map[string]interface{}) int {
	if tags != nil {
		if r, ok := tags["rotate"]; ok {
			if val, err := strconv.Atoi(strings.TrimSpace(r)); err == nil {
				return ((val % 360) + 360) % 360
			}
		}
	}
	for _, sd := range sideData {
		if rot, ok := sd["rotation"]; ok {
			switch v := rot.(type) {
			case float64:
				val := int(v)
				return ((val % 360) + 360) % 360
			case int:
				return ((v % 360) + 360) % 360
			case string:
				if val, err := strconv.Atoi(strings.TrimSpace(v)); err == nil {
					return ((val % 360) + 360) % 360
				}
			}
		}
	}
	return 0
}

func applyRotationDimensions(width, height, rotation int) (int, int) {
	if rotation == 90 || rotation == 270 {
		return height, width
	}
	return width, height
}

func (r *Runner) Probe(filePath string) (*MediaProbeResult, error) {
	ffprobePath, err := r.ResolveTool("ffprobe")
	if err != nil {
		return nil, err
	}

	cmd := exec.Command(ffprobePath,
		"-v", "quiet",
		"-print_format", "json",
		"-show_format",
		"-show_streams",
		filePath,
	)
	cmdutil.HideWindow(cmd)

	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("ffprobe failed: %w", err)
	}

	var data ProbeData
	if err := json.Unmarshal(output, &data); err != nil {
		return nil, fmt.Errorf("failed to parse ffprobe json: %w", err)
	}

	result := &MediaProbeResult{
		Kind: "video",
	}

	hasVideo := false
	for _, s := range data.Streams {
		if s.CodecType == "video" && !hasVideo {
			hasVideo = true
			rot := parseRotation(s.Tags, s.SideDataList)
			w, h := applyRotationDimensions(s.Width, s.Height, rot)
			result.Width = w
			result.Height = h
			result.Rotation = rot
			result.Codec = s.CodecName
			result.Fps = parseFrameRate(s.AvgRFrame)
			if result.Fps <= 0 {
				result.Fps = parseFrameRate(s.RFrameRate)
			}
			if d, err := strconv.ParseFloat(s.Duration, 64); err == nil && d > 0 {
				result.Duration = d
			}
		}
		if s.CodecType == "audio" {
			result.HasAudio = true
		}
	}

	if !hasVideo && result.HasAudio {
		result.Kind = "audio"
	}

	if result.Duration <= 0 {
		if d, err := strconv.ParseFloat(data.Format.Duration, 64); err == nil {
			result.Duration = d
		}
	}

	if result.Fps <= 0 {
		result.Fps = 30
	}

	return result, nil
}

func (r *Runner) EnsureProxy(filePath string, codec string) (string, error) {
	if filePath == "" {
		return "", nil
	}
	ext := strings.ToLower(filepath.Ext(filePath))
	isAppleMov := ext == ".mov"
	isHevc := strings.Contains(strings.ToLower(codec), "hevc") || strings.Contains(strings.ToLower(codec), "hvc1") || strings.Contains(strings.ToLower(codec), "hev1")
	isProRes := strings.HasPrefix(strings.ToLower(codec), "prores")

	if !isAppleMov && !isHevc && !isProRes {
		return "", nil
	}

	ffmpegPath, err := r.ResolveTool("ffmpeg")
	if err != nil {
		return "", err
	}

	cacheDir := r.GetProxyDir()
	_ = os.MkdirAll(cacheDir, 0755)

	safeBase := strings.TrimSuffix(filepath.Base(filePath), filepath.Ext(filePath))
	proxyPath := filepath.Join(cacheDir, fmt.Sprintf("%s_%x_proxy.mp4", safeBase, len(filePath)+int(filePath[0])))

	if info, err := os.Stat(proxyPath); err == nil && info.Size() > 1024 {
		return proxyPath, nil
	}

	tmpPath := proxyPath + fmt.Sprintf(".tmp-%d.mp4", time.Now().UnixNano())
	defer os.Remove(tmpPath)

	// Short GOP (-g 25 -keyint_min 25 -sc_threshold 0) enables instant sub-100ms seeking
	cmd := exec.Command(ffmpegPath,
		"-y",
		"-i", filePath,
		"-vf", "scale='min(1280,iw)':-2",
		"-c:v", "libx264",
		"-preset", "veryfast",
		"-crf", "26",
		"-g", "25", "-keyint_min", "25", "-sc_threshold", "0",
		"-c:a", "aac",
		"-b:a", "128k",
		"-movflags", "+faststart",
		tmpPath,
	)
	cmdutil.HideWindow(cmd)
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("proxy generation failed: %w", err)
	}

	_ = os.Remove(proxyPath)
	if err := os.Rename(tmpPath, proxyPath); err != nil {
		return "", err
	}

	return proxyPath, nil
}

// GenerateThumbnail extracts a lightweight JPEG thumbnail file via FFmpeg.
func (r *Runner) GenerateThumbnail(filePath string, targetPath string, atSecond float64) error {
	ffmpegPath, err := r.ResolveTool("ffmpeg")
	if err != nil {
		return err
	}
	_ = os.MkdirAll(filepath.Dir(targetPath), 0755)

	tmpPath := targetPath + fmt.Sprintf(".tmp-%d.jpg", time.Now().UnixNano())
	defer os.Remove(tmpPath)

	secStr := fmt.Sprintf("%.2f", atSecond)
	if atSecond <= 0 {
		secStr = "0.1"
	}

	cmd := exec.Command(ffmpegPath,
		"-y",
		"-ss", secStr,
		"-i", filePath,
		"-vf", "scale='min(320,iw)':-2",
		"-frames:v", "1",
		"-q:v", "5",
		tmpPath,
	)
	cmdutil.HideWindow(cmd)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("thumbnail generation failed: %w", err)
	}

	_ = os.Remove(targetPath)
	return os.Rename(tmpPath, targetPath)
}

// ComputeWaveform extracts mono 8kHz PCM raw audio and produces a normalized peak envelope array.
func (r *Runner) ComputeWaveform(filePath string, buckets int) ([]float32, error) {
	if buckets <= 0 {
		buckets = 100
	}
	ffmpegPath, err := r.ResolveTool("ffmpeg")
	if err != nil {
		return nil, err
	}

	cmd := exec.Command(ffmpegPath,
		"-i", filePath,
		"-vn",
		"-ac", "1",
		"-ar", "8000",
		"-f", "s16le",
		"-",
	)
	cmdutil.HideWindow(cmd)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}

	var samples []int16
	buf := make([]byte, 8192)
	for {
		n, readErr := stdout.Read(buf)
		if n > 0 {
			for i := 0; i+1 < n; i += 2 {
				val := int16(binary.LittleEndian.Uint16(buf[i : i+2]))
				samples = append(samples, val)
			}
		}
		if readErr != nil {
			break
		}
	}
	_ = cmd.Wait()

	if len(samples) == 0 {
		return make([]float32, buckets), nil
	}

	peaks := make([]float32, buckets)
	bucketSize := float64(len(samples)) / float64(buckets)
	var maxVal float32 = 1.0

	for b := 0; b < buckets; b++ {
		start := int(float64(b) * bucketSize)
		end := int(float64(b+1) * bucketSize)
		if end > len(samples) {
			end = len(samples)
		}
		var maxSample float32 = 0
		for i := start; i < end; i++ {
			v := float32(math.Abs(float64(samples[i])))
			if v > maxSample {
				maxSample = v
			}
		}
		peaks[b] = maxSample
		if maxSample > maxVal {
			maxVal = maxSample
		}
	}

	// Normalize peaks to 0.0 - 1.0
	for b := range peaks {
		peaks[b] = peaks[b] / maxVal
	}

	return peaks, nil
}


func parseFrameRate(rate string) float64 {
	parts := strings.Split(rate, "/")
	if len(parts) == 2 {
		num, err1 := strconv.ParseFloat(parts[0], 64)
		den, err2 := strconv.ParseFloat(parts[1], 64)
		if err1 == nil && err2 == nil && den > 0 {
			return num / den
		}
	}
	v, _ := strconv.ParseFloat(rate, 64)
	return v
}

func (r *Runner) RunExport(
	jobId string,
	args []string,
	totalDuration float64,
	onProgress func(percent float64),
) error {
	ffmpegPath, err := r.ResolveTool("ffmpeg")
	if err != nil {
		return err
	}

	ctx, cancel := context.WithCancel(context.Background())
	r.jobs.Store(jobId, cancel)
	defer func() {
		cancel()
		r.jobs.Delete(jobId)
	}()

	cmd := exec.CommandContext(ctx, ffmpegPath, args...)
	cmdutil.HideWindow(cmd)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	var stderrBuf bytes.Buffer
	cmd.Stderr = &stderrBuf

	if err := cmd.Start(); err != nil {
		return err
	}

	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		line := scanner.Text()
		var us int64
		var parsed bool
		if strings.HasPrefix(line, "out_time_us=") {
			usStr := strings.TrimSpace(strings.TrimPrefix(line, "out_time_us="))
			if val, err := strconv.ParseInt(usStr, 10, 64); err == nil {
				us = val
				parsed = true
			}
		} else if strings.HasPrefix(line, "out_time_ms=") {
			usStr := strings.TrimSpace(strings.TrimPrefix(line, "out_time_ms="))
			if val, err := strconv.ParseInt(usStr, 10, 64); err == nil {
				us = val
				parsed = true
			}
		} else if strings.HasPrefix(line, "progress=end") {
			onProgress(100.0)
		}

		if parsed && totalDuration > 0 {
			secs := float64(us) / 1_000_000.0
			pct := (secs / totalDuration) * 100.0
			if pct > 100.0 {
				pct = 100.0
			}
			onProgress(pct)
		}
	}

	if err := cmd.Wait(); err != nil {
		errOutput := strings.TrimSpace(stderrBuf.String())
		r.logDetailedFfmpegError(ffmpegPath, args, errOutput)
		if errOutput != "" {
			cleaned := extractFfmpegErrorMessage(errOutput)
			if cleaned != "" {
				return fmt.Errorf("FFmpeg export failed: %s", cleaned)
			}
			return fmt.Errorf("FFmpeg export failed: %s", errOutput)
		}
		return fmt.Errorf("FFmpeg export failed: %w", err)
	}
	return nil
}

func (r *Runner) logDetailedFfmpegError(toolPath string, args []string, stderr string) {
	logDir := r.GetLogDir()
	_ = os.MkdirAll(logDir, 0755)
	logFile := filepath.Join(logDir, "export_error.log")
	content := fmt.Sprintf("=== EXPORT ERROR LOG ===\nTool: %s\nCommand Args:\n%s\n\n=== STDERR OUTPUT ===\n%s\n",
		toolPath,
		strings.Join(args, " "),
		stderr,
	)
	_ = os.WriteFile(logFile, []byte(content), 0644)
}

func extractFfmpegErrorMessage(stderr string) string {
	lines := strings.Split(stderr, "\n")
	var relevant []string
	for _, l := range lines {
		trimmed := strings.TrimSpace(l)
		if trimmed == "" {
			continue
		}
		// Skip FFmpeg build banner lines
		if strings.HasPrefix(trimmed, "ffmpeg version") ||
			strings.HasPrefix(trimmed, "configuration:") ||
			strings.HasPrefix(trimmed, "libav") ||
			strings.HasPrefix(trimmed, "built with") {
			continue
		}
		relevant = append(relevant, trimmed)
	}
	if len(relevant) == 0 {
		return ""
	}
	if len(relevant) > 5 {
		relevant = relevant[len(relevant)-5:]
	}
	return strings.Join(relevant, "\n")
}

func (r *Runner) Cancel(jobId string) error {
	if val, ok := r.jobs.Load(jobId); ok {
		if cancel, isCancel := val.(context.CancelFunc); isCancel {
			cancel()
			r.jobs.Delete(jobId)
			return nil
		}
	}
	return errors.New("no active job found with id " + jobId)
}
