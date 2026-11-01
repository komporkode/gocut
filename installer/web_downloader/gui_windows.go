//go:build windows
// +build windows

package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"syscall"
	"time"
	"unsafe"
)

var (
	user32   = syscall.NewLazyDLL("user32.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")
	gdi32    = syscall.NewLazyDLL("gdi32.dll")
	comctl32 = syscall.NewLazyDLL("comctl32.dll")

	procRegisterClassExW     = user32.NewProc("RegisterClassExW")
	procCreateWindowExW      = user32.NewProc("CreateWindowExW")
	procDefWindowProcW       = user32.NewProc("DefWindowProcW")
	procShowWindow           = user32.NewProc("ShowWindow")
	procUpdateWindow         = user32.NewProc("UpdateWindow")
	procGetMessageW          = user32.NewProc("GetMessageW")
	procTranslateMessage     = user32.NewProc("TranslateMessage")
	procDispatchMessageW     = user32.NewProc("DispatchMessageW")
	procPostQuitMessage      = user32.NewProc("PostQuitMessage")
	procSendMessageW         = user32.NewProc("SendMessageW")
	procSetWindowTextW       = user32.NewProc("SetWindowTextW")
	procEnableWindow         = user32.NewProc("EnableWindow")
	procDestroyWindow        = user32.NewProc("DestroyWindow")
	procGetSystemMetrics     = user32.NewProc("GetSystemMetrics")
	procMessageBoxW          = user32.NewProc("MessageBoxW")
	procCreateFontW          = gdi32.NewProc("CreateFontW")
	procInitCommonControlsEx = comctl32.NewProc("InitCommonControlsEx")
)

const (
	WS_OVERLAPPED  = 0x00000000
	WS_CAPTION     = 0x00C00000
	WS_SYSMENU     = 0x00080000
	WS_MINIMIZEBOX = 0x00020000
	WS_VISIBLE     = 0x10000000
	WS_CHILD       = 0x40000000
	WS_TABSTOP     = 0x00010000

	BS_AUTORADIOBUTTON = 0x00000009
	BS_AUTOCHECKBOX    = 0x00000003
	BS_DEFPUSHBUTTON   = 0x00000001
	BS_PUSHBUTTON      = 0x00000000
	SS_LEFT            = 0x00000000

	WM_DESTROY = 0x0002
	WM_COMMAND = 0x0111
	WM_SETFONT = 0x0030

	BM_GETCHECK = 0x00F0
	BM_SETCHECK = 0x00F1
	BST_CHECKED = 1

	PBM_SETRANGE32 = 0x0406
	PBM_SETPOS     = 0x0402
	PBS_SMOOTH     = 0x01

	ID_RADIO_BASE = 100
	ID_CHK_WHISPER = 200
	ID_BTN_CANCEL = 201
	ID_BTN_ACTION = 202
)

type WNDCLASSEXW struct {
	CbSize        uint32
	Style         uint32
	LpfnWndProc   uintptr
	CbClsExtra    int32
	CbWndExtra    int32
	HInstance     uintptr
	HIcon         uintptr
	HCursor       uintptr
	HbrBackground uintptr
	LpszMenuName  *uint16
	LpszClassName *uint16
	HIconSm       uintptr
}

type MSG struct {
	Hwnd    uintptr
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Pt      struct{ X, Y int32 }
}

type INITCOMMONCONTROLSEX struct {
	DwSize uint32
	DwICC  uint32
}

type guiState struct {
	hwndMain       uintptr
	hwndStatus     uintptr
	hwndDetail     uintptr
	hwndProgress   uintptr
	hwndBtnAction  uintptr
	hwndBtnCancel  uintptr
	hwndChkWhisper uintptr
	radioHwnds     []uintptr
	drives         []string
	selectedDrive  string
	isInstalling   bool
	isFinished     bool
	targetExe      string
}

var gState guiState

func setControlText(hwnd uintptr, text string) {
	ptr, _ := syscall.UTF16PtrFromString(text)
	procSetWindowTextW.Call(hwnd, uintptr(unsafe.Pointer(ptr)))
}

func showMsgBox(title, msg string, uType uint32) {
	tPtr, _ := syscall.UTF16PtrFromString(title)
	mPtr, _ := syscall.UTF16PtrFromString(msg)
	procMessageBoxW.Call(gState.hwndMain, uintptr(unsafe.Pointer(mPtr)), uintptr(unsafe.Pointer(tPtr)), uintptr(uType))
}

func runGUI() {
	runtime.LockOSThread()

	// Init common controls for progress bar
	icc := INITCOMMONCONTROLSEX{
		DwSize: uint32(unsafe.Sizeof(INITCOMMONCONTROLSEX{})),
		DwICC:  0x00000020, // ICC_PROGRESS_CLASS
	}
	procInitCommonControlsEx.Call(uintptr(unsafe.Pointer(&icc)))

	className, _ := syscall.UTF16PtrFromString("GoCutWebInstallerClass")
	hInstance, _, _ := kernel32.NewProc("GetModuleHandleW").Call(0)

	gState.drives = getAvailableDrives()
	gState.selectedDrive = gState.drives[0]

	wndproc := syscall.NewCallback(func(hwnd uintptr, msg uint32, wparam, lparam uintptr) uintptr {
		switch msg {
		case WM_COMMAND:
			ctrlID := int(wparam & 0xFFFF)
			if ctrlID >= ID_RADIO_BASE && ctrlID < ID_RADIO_BASE+len(gState.drives) {
				idx := ctrlID - ID_RADIO_BASE
				gState.selectedDrive = gState.drives[idx]
				return 0
			}
			if ctrlID == ID_BTN_CANCEL {
				if !gState.isInstalling {
					procDestroyWindow.Call(hwnd)
				}
				return 0
			}
			if ctrlID == ID_BTN_ACTION {
				if gState.isFinished {
					// Launch app and exit
					if gState.targetExe != "" {
						_ = exec.Command(gState.targetExe).Start()
					}
					procDestroyWindow.Call(hwnd)
					return 0
				}
				if !gState.isInstalling {
					startInstallationGUI()
				}
				return 0
			}
		case WM_DESTROY:
			procPostQuitMessage.Call(0)
			return 0
		}
		ret, _, _ := procDefWindowProcW.Call(hwnd, uintptr(msg), wparam, lparam)
		return ret
	})

	wc := WNDCLASSEXW{
		CbSize:        uint32(unsafe.Sizeof(WNDCLASSEXW{})),
		Style:         0x0002 | 0x0001,
		LpfnWndProc:   wndproc,
		HInstance:     hInstance,
		HbrBackground: 16, // COLOR_BTNFACE + 1
		LpszClassName: className,
	}
	procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))

	winW := int32(520)
	winH := int32(380)
	sW, _, _ := procGetSystemMetrics.Call(0)
	sH, _, _ := procGetSystemMetrics.Call(1)
	posX := (int32(sW) - winW) / 2
	posY := (int32(sH) - winH) / 2

	title, _ := syscall.UTF16PtrFromString("GoCut - Web Installer")
	hwndMain, _, _ := procCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(title)),
		WS_OVERLAPPED|WS_CAPTION|WS_SYSMENU|WS_MINIMIZEBOX|WS_VISIBLE,
		uintptr(posX), uintptr(posY), uintptr(winW), uintptr(winH),
		0, 0, hInstance, 0,
	)
	gState.hwndMain = hwndMain

	// Modern Segoe UI Fonts
	fontName, _ := syscall.UTF16PtrFromString("Segoe UI")
	hFont, _, _ := procCreateFontW.Call(
		15, 0, 0, 0, 400, 0, 0, 0, 1, 0, 0, 0, 0, uintptr(unsafe.Pointer(fontName)),
	)
	hBoldFont, _, _ := procCreateFontW.Call(
		20, 0, 0, 0, 700, 0, 0, 0, 1, 0, 0, 0, 0, uintptr(unsafe.Pointer(fontName)),
	)

	createChild := func(cls, txt string, style uint32, x, y, w, h int32, id int) uintptr {
		cPtr, _ := syscall.UTF16PtrFromString(cls)
		tPtr, _ := syscall.UTF16PtrFromString(txt)
		hChild, _, _ := procCreateWindowExW.Call(
			0, uintptr(unsafe.Pointer(cPtr)), uintptr(unsafe.Pointer(tPtr)),
			uintptr(WS_CHILD|WS_VISIBLE|style),
			uintptr(x), uintptr(y), uintptr(w), uintptr(h),
			hwndMain, uintptr(id), hInstance, 0,
		)
		procSendMessageW.Call(hChild, WM_SETFONT, hFont, 1)
		return hChild
	}

	// 1. Header Area
	hTitle := createChild("STATIC", "GoCut Web Installer", SS_LEFT, 24, 18, 460, 26, 0)
	procSendMessageW.Call(hTitle, WM_SETFONT, hBoldFont, 1)
	createChild("STATIC", "Editor video desktop offline yang cepat, ringan, dan hemat penyimpanan sistem.", SS_LEFT, 24, 46, 460, 20, 0)

	// 2. Drive Selection
	createChild("STATIC", "Pilih Lokasi Drive Instalasi:", SS_LEFT, 24, 78, 460, 18, 0)
	radioY := int32(100)
	gState.radioHwnds = make([]uintptr, len(gState.drives))
	for i, d := range gState.drives {
		label := fmt.Sprintf("%s\\GoCut", d)
		if d != "C:" && i == 0 {
			label += "  (Direkomendasikan)"
		} else if d == "C:" {
			label += "  (Drive Sistem)"
		}
		hRad := createChild("BUTTON", label, BS_AUTORADIOBUTTON|WS_TABSTOP, 32, radioY, 440, 22, ID_RADIO_BASE+i)
		if i == 0 {
			procSendMessageW.Call(hRad, BM_SETCHECK, BST_CHECKED, 0)
		}
		gState.radioHwnds[i] = hRad
		radioY += 26
	}

	// 3. Whisper Checkbox
	gState.hwndChkWhisper = createChild("BUTTON", "Unduh Model AI Whisper Base (~145 MB) untuk Subtitle Otomatis", BS_AUTOCHECKBOX|WS_TABSTOP, 24, radioY+8, 460, 22, ID_CHK_WHISPER)
	procSendMessageW.Call(gState.hwndChkWhisper, BM_SETCHECK, BST_CHECKED, 0)

	// 4. Progress Area
	gState.hwndStatus = createChild("STATIC", "Siap mengunduh dan memasang GoCut.", SS_LEFT, 24, 218, 460, 18, 0)
	progClass, _ := syscall.UTF16PtrFromString("msctls_progress32")
	hProg, _, _ := procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(progClass)), 0,
		WS_CHILD|WS_VISIBLE|PBS_SMOOTH,
		24, 240, 456, 20,
		hwndMain, 0, hInstance, 0,
	)
	gState.hwndProgress = hProg
	procSendMessageW.Call(hProg, PBM_SETRANGE32, 0, 100)
	procSendMessageW.Call(hProg, PBM_SETPOS, 0, 0)

	gState.hwndDetail = createChild("STATIC", "", SS_LEFT, 24, 265, 460, 18, 0)

	// 5. Action Buttons
	gState.hwndBtnCancel = createChild("BUTTON", "Batal", BS_PUSHBUTTON|WS_TABSTOP, 260, 295, 105, 32, ID_BTN_CANCEL)
	gState.hwndBtnAction = createChild("BUTTON", "Instal Sekarang", BS_DEFPUSHBUTTON|WS_TABSTOP, 375, 295, 105, 32, ID_BTN_ACTION)

	procShowWindow.Call(hwndMain, 1)
	procUpdateWindow.Call(hwndMain)

	var msg MSG
	for {
		ret, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
		if ret == 0 || int32(ret) == -1 {
			break
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&msg)))
		procDispatchMessageW.Call(uintptr(unsafe.Pointer(&msg)))
	}
}

func startInstallationGUI() {
	gState.isInstalling = true

	// Disable controls
	procEnableWindow.Call(gState.hwndBtnAction, 0)
	procEnableWindow.Call(gState.hwndBtnCancel, 0)
	procEnableWindow.Call(gState.hwndChkWhisper, 0)
	for _, hRad := range gState.radioHwnds {
		procEnableWindow.Call(hRad, 0)
	}

	setControlText(gState.hwndStatus, "Menyiapkan direktori instalasi...")

	chkRes, _, _ := procSendMessageW.Call(gState.hwndChkWhisper, BM_GETCHECK, 0, 0)
	downloadWhisper := chkRes == BST_CHECKED

	go func() {
		installRoot := filepath.Join(gState.selectedDrive, "\\GoCut")
		appDir := filepath.Join(installRoot, "app")
		dataDir := filepath.Join(installRoot, "data")

		_ = os.MkdirAll(appDir, 0755)
		_ = os.MkdirAll(filepath.Join(dataDir, "projects"), 0755)
		_ = os.MkdirAll(filepath.Join(dataDir, "cache"), 0755)
		_ = os.MkdirAll(filepath.Join(dataDir, "models", "whisper"), 0755)

		// 1. Download main app zip
		tempZip := filepath.Join(os.TempDir(), "gocut-release.zip")
		setControlText(gState.hwndStatus, "Mengunduh paket aplikasi GoCut...")

		err := downloadFileWithGUIProgress(defaultReleaseUrl, tempZip, "GoCut", 0, 60)
		if err != nil {
			// Fallback to local biner if available
			localBin := filepath.Join(".", "build", "bin", "gocut.exe")
			if _, statErr := os.Stat(localBin); statErr == nil {
				setControlText(gState.hwndStatus, "Menggunakan biner lokal...")
				_ = copyFile(localBin, filepath.Join(appDir, "gocut.exe"))
			} else {
				showMsgBox("Gagal Mengunduh", fmt.Sprintf("Tidak dapat mengunduh paket GoCut:\n%v", err), 0x00000010)
				resetGUIOnError()
				return
			}
		} else {
			setControlText(gState.hwndStatus, "Mengekstrak paket aplikasi...")
			setControlText(gState.hwndDetail, "Harap tunggu sebentar...")
			procSendMessageW.Call(gState.hwndProgress, PBM_SETPOS, 65, 0)

			if err := extractZip(tempZip, appDir); err != nil {
				showMsgBox("Gagal Ekstrak", fmt.Sprintf("Gagal mengekstrak file:\n%v", err), 0x00000010)
				resetGUIOnError()
				return
			}
			_ = os.Remove(tempZip)
		}

		procSendMessageW.Call(gState.hwndProgress, PBM_SETPOS, 75, 0)

		// 2. Download Whisper AI if selected
		if downloadWhisper {
			setControlText(gState.hwndStatus, "Mengunduh model AI Whisper Base (~145 MB)...")
			whisperDest := filepath.Join(dataDir, "models", "whisper", "ggml-base.bin")
			_ = downloadFileWithGUIProgress(whisperModelUrl, whisperDest, "Whisper Model", 75, 95)
		}

		// 3. Shortcuts
		setControlText(gState.hwndStatus, "Membuat pintasan desktop...")
		procSendMessageW.Call(gState.hwndProgress, PBM_SETPOS, 96, 0)

		desktop, _ := os.UserHomeDir()
		desktop = filepath.Join(desktop, "Desktop")
		shortcutPath := filepath.Join(desktop, "GoCut.lnk")
		targetExe := filepath.Join(appDir, "gocut.exe")
		createShortcut(targetExe, shortcutPath)

		// Finish
		procSendMessageW.Call(gState.hwndProgress, PBM_SETPOS, 100, 0)
		setControlText(gState.hwndStatus, "Instalasi selesai! Aplikasi siap digunakan.")
		setControlText(gState.hwndDetail, fmt.Sprintf("Lokasi: %s", installRoot))

		gState.targetExe = targetExe
		gState.isFinished = true
		gState.isInstalling = false

		setControlText(gState.hwndBtnAction, "Buka GoCut")
		procEnableWindow.Call(gState.hwndBtnAction, 1)
		procShowWindow.Call(gState.hwndBtnCancel, 0) // Sembunyikan tombol batal
	}()
}

func resetGUIOnError() {
	gState.isInstalling = false
	setControlText(gState.hwndStatus, "Instalasi gagal. Silakan coba kembali.")
	setControlText(gState.hwndDetail, "")
	procSendMessageW.Call(gState.hwndProgress, PBM_SETPOS, 0, 0)
	procEnableWindow.Call(gState.hwndBtnAction, 1)
	procEnableWindow.Call(gState.hwndBtnCancel, 1)
	procEnableWindow.Call(gState.hwndChkWhisper, 1)
	for _, hRad := range gState.radioHwnds {
		procEnableWindow.Call(hRad, 1)
	}
}

func downloadFileWithGUIProgress(url string, destPath string, taskName string, minPct, maxPct int) error {
	_ = os.MkdirAll(filepath.Dir(destPath), 0755)
	resp, err := httpGet(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("server error: %s", resp.Status)
	}

	out, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer out.Close()

	total := resp.ContentLength
	var downloaded int64
	buf := make([]byte, 32*1024)
	lastUpdate := time.Now()

	for {
		nr, er := resp.Body.Read(buf)
		if nr > 0 {
			nw, ew := out.Write(buf[0:nr])
			if nw < 0 || nr != nw {
				return ew
			}
			downloaded += int64(nw)

			if time.Since(lastUpdate) > 100*time.Millisecond || (total > 0 && downloaded == total) {
				lastUpdate = time.Now()
				ratio := float64(0)
				if total > 0 {
					ratio = float64(downloaded) / float64(total)
				}
				curPct := minPct + int(ratio*float64(maxPct-minPct))
				procSendMessageW.Call(gState.hwndProgress, PBM_SETPOS, uintptr(curPct), 0)

				mbDone := float64(downloaded) / (1024 * 1024)
				mbTotal := float64(total) / (1024 * 1024)
				var detail string
				if total > 0 {
					detail = fmt.Sprintf("%.1f MB / %.1f MB (%.0f%%)", mbDone, mbTotal, ratio*100)
				} else {
					detail = fmt.Sprintf("%.1f MB terunduh", mbDone)
				}
				setControlText(gState.hwndDetail, detail)
			}
		}
		if er != nil {
			if er.Error() == "EOF" {
				break
			}
			return er
		}
	}
	return nil
}

func httpGet(url string) (*httpResponseWrapper, error) {
	client := &http.Client{
		Timeout: 0, // No timeout for large downloads
	}
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	return &httpResponseWrapper{
		StatusCode:    resp.StatusCode,
		Status:        resp.Status,
		ContentLength: resp.ContentLength,
		Body:          resp.Body,
	}, nil
}

type httpResponseWrapper struct {
	StatusCode    int
	Status        string
	ContentLength int64
	Body          io.ReadCloser
}
