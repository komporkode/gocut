import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { installPluginBridge } from "./editor/pluginBridge";
import { createWailsBridge, isWailsEnvironment } from "./wails/wailsBridge";

if (!window.editorAPI && isWailsEnvironment()) {
  window.editorAPI = createWailsBridge();
}

installPluginBridge();
void document.fonts
  .load('16px \"Noto Sans SC\"')
  .catch(() => [])
  .finally(() => {
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <ErrorBoundary fallbackTitle="Terjadi kendala pada aplikasi">
        <App />
      </ErrorBoundary>
    );
  });
