package main

import (
	"embed"
	"net/http"
	"os"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

func init() {
	// Wails v2.17.0+ devserver validates Host header against WAILS_DEV_ALLOWED_HOSTS.
	// On Windows with WebView2, requests send Host: wails.localhost:port.
	// Ensure wails.localhost is trusted so WebSocket IPC handshake succeeds in dev mode.
	current := os.Getenv("WAILS_DEV_ALLOWED_HOSTS")
	if current == "" {
		_ = os.Setenv("WAILS_DEV_ALLOWED_HOSTS", "wails.localhost")
	} else if !strings.Contains(current, "wails.localhost") {
		_ = os.Setenv("WAILS_DEV_ALLOWED_HOSTS", current+",wails.localhost")
	}
}

//go:embed all:dist
var assets embed.FS

func main() {
	app := NewApp()

	err := wails.Run(&options.App{
		Title:             "GoCut",
		Width:             1500,
		Height:            950,
		MinWidth:          1024,
		MinHeight:         640,
		BackgroundColour:  &options.RGBA{R: 16, G: 16, B: 21, A: 255},
		OnStartup:         app.startup,
		AssetServer: &assetserver.Options{
			Assets: assets,
			Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/media-stream" || strings.HasPrefix(r.URL.Path, "/media-stream/") || strings.HasPrefix(r.URL.Path, "/media/") || r.URL.Path == "/media" {
					app.mediaHandler.ServeHTTP(w, r)
					return
				}
			}),
		},
		Bind: []interface{}{
			app,
		},
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop:     true,
			DisableWebViewDrop: false,
		},
		Windows: &windows.Options{
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			BackdropType:         windows.None,
			Theme:                windows.Dark,
		},
	})

	if err != nil {
		println("Error starting GoCut:", err.Error())
	}
}
