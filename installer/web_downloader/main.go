package main

import (
	"archive/zip"
	"bufio"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const (
	defaultReleaseUrl = "https://github.com/komporkode/gocut/releases/latest/download/gocut-windows-x64.zip"
	whisperModelUrl   = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin"
)

func getAvailableDrives() []string {
	drives := []string{}
	// Check D to Z first
	for r := 'D'; r <= 'Z'; r++ {
		drive := fmt.Sprintf("%c:\\", r)
		if _, err := os.Stat(drive); err == nil {
			drives = append(drives, fmt.Sprintf("%c:", r))
		}
	}
	// Add C:
	drives = append(drives, "C:")
	return drives
}

type progressWriter struct {
	total      int64
	downloaded int64
	lastPrint  time.Time
	taskName   string
}

func (pw *progressWriter) Write(p []byte) (int, error) {
	n := len(p)
	pw.downloaded += int64(n)
	if time.Since(pw.lastPrint) > 200*time.Millisecond || pw.downloaded == pw.total {
		pw.lastPrint = time.Now()
		pct := float64(0)
		if pw.total > 0 {
			pct = float64(pw.downloaded) / float64(pw.total) * 100
		}
		mbDone := float64(pw.downloaded) / (1024 * 1024)
		mbTotal := float64(pw.total) / (1024 * 1024)
		fmt.Printf("\r  [%s] %.1f%% (%.1f MB / %.1f MB)    ", pw.taskName, pct, mbDone, mbTotal)
	}
	return n, nil
}

func downloadFile(url string, destPath string, taskName string) error {
	_ = os.MkdirAll(filepath.Dir(destPath), 0755)
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("server error: %s", resp.Status)
	}

	out, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer out.Close()

	pw := &progressWriter{
		total:    resp.ContentLength,
		taskName: taskName,
	}

	_, err = io.Copy(out, io.TeeReader(resp.Body, pw))
	fmt.Println()
	return err
}

func extractZip(zipPath string, targetDir string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	for _, f := range r.File {
		fPath := filepath.Join(targetDir, f.Name)
		if !strings.HasPrefix(fPath, filepath.Clean(targetDir)+string(os.PathSeparator)) {
			continue // prevent zip slip
		}
		if f.FileInfo().IsDir() {
			_ = os.MkdirAll(fPath, 0755)
			continue
		}
		_ = os.MkdirAll(filepath.Dir(fPath), 0755)
		outFile, err := os.OpenFile(fPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
		if err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			outFile.Close()
			return err
		}
		_, err = io.Copy(outFile, rc)
		outFile.Close()
		rc.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

func createShortcut(targetExe, shortcutPath string) {
	script := fmt.Sprintf(`
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("%s")
$Shortcut.TargetPath = "%s"
$Shortcut.WorkingDirectory = "%s"
$Shortcut.Save()
`, shortcutPath, targetExe, filepath.Dir(targetExe))

	cmd := exec.Command("powershell", "-NoProfile", "-Command", script)
	_ = cmd.Run()
}

func main() {
	isCLI := false
	for _, arg := range os.Args[1:] {
		if arg == "--cli" || arg == "-c" || arg == "--console" {
			isCLI = true
			break
		}
	}

	if isCLI {
		runCLI()
	} else {
		runGUI()
	}
}

func runCLI() {
	fmt.Println("==================================================")
	fmt.Println("       GoCut Web Downloader & Installer           ")
	fmt.Println("==================================================")

	drives := getAvailableDrives()
	fmt.Println("\nPilih Drive untuk menginstal GoCut:")
	for i, d := range drives {
		rec := ""
		if d != "C:" && i == 0 {
			rec = " [Direkomendasikan]"
		}
		fmt.Printf("  [%d] %s\\GoCut%s\n", i+1, d, rec)
	}

	reader := bufio.NewReader(os.Stdin)
	fmt.Print("\nMasukkan nomor pilihan [1]: ")
	choiceStr, _ := reader.ReadString('\n')
	choiceStr = strings.TrimSpace(choiceStr)

	choiceIdx := 0
	if choiceStr != "" {
		var num int
		if _, err := fmt.Sscanf(choiceStr, "%d", &num); err == nil && num >= 1 && num <= len(drives) {
			choiceIdx = num - 1
		}
	}

	selectedDrive := drives[choiceIdx]
	installRoot := filepath.Join(selectedDrive, "\\GoCut")
	appDir := filepath.Join(installRoot, "app")
	dataDir := filepath.Join(installRoot, "data")

	fmt.Printf("\nLokasi instalasi: %s\n", installRoot)
	fmt.Println("Inisialisasi direktori...")
	_ = os.MkdirAll(appDir, 0755)
	_ = os.MkdirAll(filepath.Join(dataDir, "projects"), 0755)
	_ = os.MkdirAll(filepath.Join(dataDir, "cache"), 0755)
	_ = os.MkdirAll(filepath.Join(dataDir, "models", "whisper"), 0755)

	// Step 1: Download & extract main zip
	tempZip := filepath.Join(os.TempDir(), "gocut-release.zip")
	fmt.Println("\n[1/3] Mengunduh paket aplikasi GoCut terbaru...")
	if err := downloadFile(defaultReleaseUrl, tempZip, "Aplikasi GoCut"); err != nil {
		fmt.Printf("Peringatan unduhan rilis: %v\n", err)
		fmt.Println("Memeriksa apakah biner lokal sudah tersedia di ./build/bin/gocut.exe...")
		// fallback to local build if running from source
		localBin := filepath.Join(".", "build", "bin", "gocut.exe")
		if _, statErr := os.Stat(localBin); statErr == nil {
			_ = copyFile(localBin, filepath.Join(appDir, "gocut.exe"))
			fmt.Println("Biner lokal berhasil disalin.")
		}
	} else {
		fmt.Println("Mengekstrak paket aplikasi...")
		if err := extractZip(tempZip, appDir); err != nil {
			fmt.Printf("Gagal ekstrak zip: %v\n", err)
		}
		_ = os.Remove(tempZip)
	}

	// Step 2: Download Whisper AI Model
	fmt.Print("\n[2/3] Unduh Model AI Whisper Base (~145 MB) sekarang? [Y/n]: ")
	ans, _ := reader.ReadString('\n')
	ans = strings.TrimSpace(strings.ToLower(ans))
	if ans == "" || ans == "y" || ans == "ya" {
		whisperDest := filepath.Join(dataDir, "models", "whisper", "ggml-base.bin")
		fmt.Println("Mengunduh model AI Whisper Base di latar belakang...")
		if err := downloadFile(whisperModelUrl, whisperDest, "Model Whisper"); err != nil {
			fmt.Printf("Catatan: Unduhan model dilewati (%v). Model bisa diunduh kapan saja di dalam aplikasi.\n", err)
		} else {
			fmt.Println("Model Whisper Base berhasil dipasang!")
		}
	} else {
		fmt.Println("Download model dilewati. Anda bisa mengunduhnya nanti di aplikasi.")
	}

	// Step 3: Create desktop shortcut
	fmt.Println("\n[3/3] Membuat Pintasan Desktop...")
	desktop, _ := os.UserHomeDir()
	desktop = filepath.Join(desktop, "Desktop")
	shortcutPath := filepath.Join(desktop, "GoCut.lnk")
	targetExe := filepath.Join(appDir, "gocut.exe")
	createShortcut(targetExe, shortcutPath)

	fmt.Println("\n==================================================")
	fmt.Println("       Instalasi GoCut Berhasil Selesai!          ")
	fmt.Println("==================================================")
	fmt.Printf("Aplikasi: %s\n", targetExe)
	fmt.Printf("Data:     %s\n", dataDir)
	fmt.Println("\nTekan ENTER untuk menutup installer dan membuka GoCut...")
	_, _ = reader.ReadString('\n')
	_ = exec.Command(targetExe).Start()
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}
