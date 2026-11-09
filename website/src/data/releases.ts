export interface ReleaseAssetInfo {
  id: string;
  name: string;
  sizeBytes: number;
  downloadUrl: string;
  sha256: string;
  role: "setup" | "websetup" | "portable" | "other";
}

export interface ReleaseInfo {
  tag: string;
  name: string;
  publishedAt: string;
  htmlUrl: string;
  prerelease: boolean;
  assets: ReleaseAssetInfo[];
  source: "github-live" | "fallback";
}

export const GITHUB_REPO = "komporkode/gocut";
export const GITHUB_RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=8`;

function getReleasesApiUrl(bypassCache: boolean): string {
  return bypassCache ? `${GITHUB_RELEASES_API}&t=${Date.now()}` : GITHUB_RELEASES_API;
}

export const FALLBACK_RELEASE: ReleaseInfo = {
  tag: "v0.8.0",
  name: "v0.8.0: Penyimpanan Mandiri, Whisper AI & Dual Installer",
  publishedAt: "2026-11-01T13:02:05Z",
  htmlUrl: "https://github.com/komporkode/gocut/releases/tag/v0.8.0",
  prerelease: true,
  source: "fallback",
  assets: [
    {
      id: "setup-x64",
      name: "GoCut-Setup-x64.exe",
      sizeBytes: 67066208,
      downloadUrl: "https://github.com/komporkode/gocut/releases/download/v0.8.0/GoCut-Setup-x64.exe",
      sha256: "231ac6da3fdb31fe003947d17765e581659f08ffd533bf804860d64c6e1b1770",
      role: "setup",
    },
    {
      id: "websetup",
      name: "GoCut-WebSetup.exe",
      sizeBytes: 2489013,
      downloadUrl: "https://github.com/komporkode/gocut/releases/download/v0.8.0/GoCut-WebSetup.exe",
      sha256: "626d905db4c35d91d2c008164fa5791de7c288e3c9ae02390f8174ce7c9e0077",
      role: "websetup",
    },
    {
      id: "portable-zip",
      name: "gocut-windows-x64.zip",
      sizeBytes: 18298932,
      downloadUrl: "https://github.com/komporkode/gocut/releases/download/v0.8.0/gocut-windows-x64.zip",
      sha256: "bcbb23e5b71de2985e151e51ac122d0fae085cf635228bb8bc0ef9a24d351b48",
      role: "portable",
    },
  ],
};

function sanitizeTitle(raw: string): string {
  return raw.replace(/\s*\u2014\s*/g, ": ").replace(/\s--\s/g, ": ").trim();
}

function classifyRole(name: string): ReleaseAssetInfo["role"] {
  const lower = name.toLowerCase();
  if (lower.includes("websetup")) return "websetup";
  if (lower.includes("setup") && lower.endsWith(".exe")) return "setup";
  if (lower.endsWith(".zip") || lower.includes("portable")) return "portable";
  return "other";
}

function extractDigest(digest?: string | null): string {
  if (!digest) return "";
  return digest.replace(/^sha256:/i, "").trim().toLowerCase();
}

export async function fetchLatestRelease(
  signal?: AbortSignal,
  bypassCache = false,
): Promise<ReleaseInfo> {
  const response = await fetch(getReleasesApiUrl(bypassCache), {
    headers: { Accept: "application/vnd.github+json" },
    cache: bypassCache ? "no-store" : "default",
    signal,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const rawList = (await response.json()) as Array<{
    tag_name: string;
    name?: string;
    published_at?: string;
    html_url: string;
    draft?: boolean;
    prerelease?: boolean;
    assets?: Array<{
      id: number;
      name: string;
      size: number;
      browser_download_url: string;
      digest?: string | null;
    }>;
  }>;

  const valid = rawList.filter((item) => !item.draft && Array.isArray(item.assets) && item.assets.length > 0);
  if (valid.length === 0) {
    throw new Error("EMPTY_RELEASES");
  }

  const preferred = valid.find((item) => /setup|gocut/i.test(item.assets?.map((a) => a.name).join(" ") ?? "")) ?? valid[0];
  const fallbackByName = new Map(FALLBACK_RELEASE.assets.map((a) => [a.name, a.sha256]));

  const assets: ReleaseAssetInfo[] = (preferred.assets ?? [])
    .filter((a) => a.name.toLowerCase().endsWith(".exe") || a.name.toLowerCase().endsWith(".zip"))
    .map((a) => ({
      id: String(a.id),
      name: a.name,
      sizeBytes: a.size,
      downloadUrl: a.browser_download_url,
      sha256: extractDigest(a.digest) || fallbackByName.get(a.name) || "",
      role: classifyRole(a.name),
    }));

  if (assets.length === 0) {
    throw new Error("NO_WINDOWS_ASSETS");
  }

  return {
    tag: preferred.tag_name,
    name: sanitizeTitle(preferred.name || preferred.tag_name),
    publishedAt: preferred.published_at || FALLBACK_RELEASE.publishedAt,
    htmlUrl: preferred.html_url,
    prerelease: Boolean(preferred.prerelease),
    assets,
    source: "github-live",
  };
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const mib = bytes / (1024 * 1024);
  if (mib < 10) return `${mib.toFixed(2)} MiB`;
  return `${mib.toFixed(1)} MiB`;
}
