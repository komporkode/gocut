/**
 * Captures a visual frame snapshot from a video URL to use as media thumbnail and timeline filmstrip.
 */
export function captureVideoFrame(url: string, atSecond = 0.1): Promise<string> {
  return new Promise<string>((resolve) => {
    // In headless or node test environments, resolve safely
    if (typeof document === "undefined") {
      resolve("");
      return;
    }
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    if (url.startsWith("http://") || url.startsWith("https://")) {
      video.crossOrigin = "anonymous";
    }

    const timeout = setTimeout(() => {
      cleanup();
      resolve("");
    }, 4000);

    const cleanup = () => {
      clearTimeout(timeout);
      video.onloadeddata = null;
      video.onseeked = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
    };

    video.onloadeddata = () => {
      const targetTime = Math.min(Math.max(0.05, atSecond), video.duration > 0 ? video.duration / 2 : 0.05);
      video.currentTime = targetTime;
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        const w = video.videoWidth || 160;
        const h = video.videoHeight || 90;
        const scale = Math.min(1, 240 / Math.max(w, 1));
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const data = canvas.toDataURL("image/jpeg", 0.8);
          cleanup();
          resolve(data);
          return;
        }
      } catch {
        // Fallback on canvas error
      }
      cleanup();
      resolve("");
    };

    video.onerror = () => {
      cleanup();
      resolve("");
    };

    video.src = url;
  });
}
