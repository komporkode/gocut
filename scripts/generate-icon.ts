import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve("build");
const publicIcons = path.resolve("public/icons");

await mkdir(path.join(root, "icon.iconset"), { recursive: true });
await mkdir(path.join(root, "windows"), { recursive: true });
await mkdir(publicIcons, { recursive: true });

// Copy the user's official icons if available
const userIco = path.join(publicIcons, "gocut.ico");
const userPng = path.join(publicIcons, "gocut.png");
try {
  await copyFile(userIco, path.join(root, "windows", "icon.ico"));
  await copyFile(userIco, path.join(root, "icon.ico"));
  await copyFile(userPng, path.join(root, "appicon.png"));
  await copyFile(userPng, path.join(root, "icon.png"));
  await copyFile(userPng, path.join(publicIcons, "reacut.png"));
} catch (e) {
  // Ignore if not present yet
}

// Copy the source SVG icons into public/icons
const appIconSvgPath = path.join(root, "gocut_app_icon.svg");
const logoHSvgPath = path.join(root, "gocut_logo_h.svg");
try {
  await copyFile(appIconSvgPath, path.join(publicIcons, "gocut_app_icon.svg"));
  await copyFile(logoHSvgPath, path.join(publicIcons, "gocut_logo_h.svg"));
  await copyFile(appIconSvgPath, path.join(publicIcons, "reacut.svg"));
} catch (e) {}

const appIconSvgRaw = await readFile(appIconSvgPath, "utf-8");

// Prepare crisp vector renderer
const highResSvg = appIconSvgRaw
  .replace(/width="[^"]+"/, 'width="2048"')
  .replace(/height="[^"]+"/, 'height="2048"');

const vectorImage = await loadImage(Buffer.from(highResSvg));

function renderIcon(size: number): Buffer {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(vectorImage, 0, 0, size, size);
  return canvas.toBuffer("image/png");
}

// Generate iconset and standalone PNG files
for (const size of [16, 32, 48, 64, 128, 256, 512, 1024]) {
  const bytes = renderIcon(size);
  if (size === 1024) {
    await writeFile(path.join(root, "appicon.png"), bytes);
  }
  if (size === 512) {
    await writeFile(path.join(root, "icon.png"), bytes);
    await writeFile(path.join(publicIcons, "gocut.png"), bytes);
    await writeFile(path.join(publicIcons, "reacut.png"), bytes);
  }
  if (size <= 512) {
    await writeFile(
      path.join(root, "icon.iconset", `icon_${size}x${size}.png`),
      bytes,
    );
    await writeFile(
      path.join(root, "icon.iconset", `icon_${size}x${size}@2x.png`),
      renderIcon(size * 2),
    );
  }
}

// Generate Windows .ico with multi-resolution icon frames
const icoSizes = [16, 32, 48, 64, 128, 256];
const images = icoSizes.map((size) => ({
  size,
  bytes: renderIcon(size),
}));

const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(1, 2); // ICO type: 1
header.writeUInt16LE(images.length, 4); // Number of images

let offset = header.length;
images.forEach(({ size, bytes }, i) => {
  const at = 6 + i * 16;
  header[at] = size === 256 ? 0 : size; // Width (0 means 256)
  header[at + 1] = size === 256 ? 0 : size; // Height (0 means 256)
  header[at + 2] = 0; // Color palette
  header[at + 3] = 0; // Reserved
  header.writeUInt16LE(1, at + 4); // Color planes
  header.writeUInt16LE(32, at + 6); // Bits per pixel
  header.writeUInt32LE(bytes.length, at + 8); // Image data size in bytes
  header.writeUInt32LE(offset, at + 12); // Image data offset
  offset += bytes.length;
});

const icoBuffer = Buffer.concat([header, ...images.map((img) => img.bytes)]);
await writeFile(path.join(root, "icon.ico"), icoBuffer);
await writeFile(path.join(root, "windows", "icon.ico"), icoBuffer);

// For macOS if iconutil is available
if (process.platform === "darwin") {
  try {
    const result = spawnSync(
      "iconutil",
      [
        "-c",
        "icns",
        path.join(root, "icon.iconset"),
        "-o",
        path.join(root, "icon.icns"),
      ],
      { stdio: "inherit" },
    );
    if (result.status !== 0) {
      console.warn("iconutil exited with status:", result.status);
    }
  } catch (err) {
    console.warn("iconutil not run:", err);
  }
}

console.log("Successfully generated GoCut icons in build/, build/windows/, and public/icons/");
