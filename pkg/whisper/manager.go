package whisper

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type WhisperModel struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Filename  string `json:"filename"`
	SizeMB    int    `json:"sizeMB"`
	Installed bool   `json:"installed"`
	Path      string `json:"path,omitempty"`
}

var standardModels = []WhisperModel{
	{ID: "tiny", Name: "Whisper Tiny (Super Cepat)", Filename: "ggml-tiny.bin", SizeMB: 75},
	{ID: "base", Name: "Whisper Base (Rekomendasi ID/EN)", Filename: "ggml-base.bin", SizeMB: 145},
	{ID: "small", Name: "Whisper Small (Akurasi Tinggi)", Filename: "ggml-small.bin", SizeMB: 480},
}

type Manager struct {
	modelsDir string
}

func NewManager(modelsDir string) *Manager {
	_ = os.MkdirAll(modelsDir, 0755)
	return &Manager{modelsDir: modelsDir}
}

func (m *Manager) SetModelsDir(dir string) {
	m.modelsDir = dir
	_ = os.MkdirAll(dir, 0755)
}

func (m *Manager) ListModels() []WhisperModel {
	results := make([]WhisperModel, len(standardModels))
	copy(results, standardModels)

	for i := range results {
		target := filepath.Join(m.modelsDir, results[i].Filename)
		if info, err := os.Stat(target); err == nil && !info.IsDir() {
			results[i].Installed = true
			results[i].Path = target
		}
	}
	return results
}

func (m *Manager) ImportModel(srcPath string) error {
	base := filepath.Base(srcPath)
	if !strings.HasSuffix(strings.ToLower(base), ".bin") {
		return fmt.Errorf("berkas model harus berekstensi .bin")
	}

	target := filepath.Join(m.modelsDir, base)
	in, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(target)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}

func (m *Manager) FindCliBinary() (string, error) {
	execPath, _ := os.Executable()
	baseDir := filepath.Dir(execPath)

	candidates := []string{
		filepath.Join(baseDir, "media-tools", "whisper-cli.exe"),
		filepath.Join(baseDir, "whisper-cli.exe"),
		filepath.Join(baseDir, "..", "app", "media-tools", "whisper-cli.exe"),
		"whisper-cli.exe",
		"whisper-cli",
	}

	for _, c := range candidates {
		if path, err := exec.LookPath(c); err == nil {
			return path, nil
		}
		if info, err := os.Stat(c); err == nil && !info.IsDir() {
			return c, nil
		}
	}
	return "", fmt.Errorf("whisper-cli tidak ditemukan")
}
