package main

import (
	"embed"
	"net/http"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

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
				if r.URL.Path == "/media-stream" || strings.HasPrefix(r.URL.Path, "/media-stream/") {
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
