import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

const mimeTypes: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
};

function mediaStreamPlugin(): Plugin {
  return {
    name: "reacut-media-stream",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (
          req.url &&
          (req.url.startsWith("/media-stream?") ||
            req.url === "/media-stream" ||
            req.url.startsWith("/media-stream/"))
        ) {
          try {
            const urlObj = new URL(req.url, "http://127.0.0.1:5173");
            let filePath = urlObj.searchParams.get("path") || "";
            if (!filePath && req.url.startsWith("/media-stream/")) {
              filePath = decodeURIComponent(req.url.slice("/media-stream/".length));
            }
            if (!filePath) {
              res.statusCode = 400;
              res.end("Missing path parameter");
              return;
            }
            filePath = filePath.replace(/^file:\/\/\/?/, "");
            if (filePath.startsWith("/") && /^[a-zA-Z]:/.test(filePath.slice(1))) {
              filePath = filePath.slice(1);
            }
            filePath = path.normalize(filePath);

            if (!fs.existsSync(filePath)) {
              res.statusCode = 404;
              res.end("Media not found: " + filePath);
              return;
            }
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
              res.statusCode = 400;
              res.end("Path is a directory");
              return;
            }

            const ext = path.extname(filePath).toLowerCase();
            const contentType = mimeTypes[ext] || "application/octet-stream";

            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type, Accept, Origin");
            res.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
            res.setHeader("Accept-Ranges", "bytes");
            res.setHeader("Content-Type", contentType);

            if (req.method === "OPTIONS") {
              res.statusCode = 200;
              res.end();
              return;
            }

            const range = req.headers.range;
            if (range) {
              const parts = range.replace(/bytes=/, "").split("-");
              const start = parseInt(parts[0], 10);
              const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
              if (isNaN(start) || start >= stat.size || end >= stat.size || start > end) {
                res.statusCode = 416;
                res.setHeader("Content-Range", `bytes */${stat.size}`);
                res.end();
                return;
              }
              const chunksize = end - start + 1;
              res.statusCode = 206;
              res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
              res.setHeader("Content-Length", chunksize);
              const fileStream = fs.createReadStream(filePath, { start, end });
              fileStream.pipe(res);
            } else {
              res.statusCode = 200;
              res.setHeader("Content-Length", stat.size);
              const fileStream = fs.createReadStream(filePath);
              fileStream.pipe(res);
            }
            return;
          } catch (err: any) {
            res.statusCode = 500;
            res.end("Error streaming media: " + (err?.message || "unknown"));
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [
    mediaStreamPlugin(),
    {
      name: "reacut-csp",
      transformIndexHtml: (html: string) =>
        command === "build"
          ? html.replace(
              "<head>",
              "<head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http: reacut-media:; media-src 'self' blob: http: reacut-media:; connect-src 'self' http: reacut-media:; object-src 'none'; base-uri 'self'; form-action 'none'\">",
            )
          : html,
    },
    react(),
  ],
  base: "./",
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
}));
