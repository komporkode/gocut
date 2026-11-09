import { TRANSLATIONS, type SiteLang } from "./data/i18n";
import {
  FALLBACK_RELEASE,
  fetchLatestRelease,
  formatFileSize,
  type ReleaseAssetInfo,
  type ReleaseInfo,
} from "./data/releases";

let currentLang: SiteLang = resolveInitialLang();
let latestRelease: ReleaseInfo = FALLBACK_RELEASE;
let currentFetchState: "loading" | "ok" | "fallback" = "loading";

function resolveInitialLang(): SiteLang {
  try {
    const saved = localStorage.getItem("gocut-site-lang");
    if (saved === "id" || saved === "en") return saved;
  } catch {}
  return "id";
}

function t(key: string): string {
  return TRANSLATIONS[currentLang][key] ?? TRANSLATIONS.id[key] ?? key;
}

function applyTranslations(lang: SiteLang): void {
  currentLang = lang;
  document.documentElement.lang = lang;
  try {
    localStorage.setItem("gocut-site-lang", lang);
  } catch {}

  document.title = t("meta.title");

  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (key) {
      el.textContent = t(key);
    }
  });

  const langBtn = document.getElementById("lang-toggle");
  if (langBtn) {
    langBtn.textContent = lang === "id" ? "ID / EN" : "EN / ID";
    langBtn.setAttribute(
      "aria-label",
      lang === "id" ? "Ganti bahasa ke Inggris" : "Switch language to Indonesian",
    );
  }

  updateThemeButtonUI();
  renderReleaseSection();
}

/* -------------------------------------------------------------------------- */
/* 2-State Theme Toggle (modern-web-guidance: color-scheme + light-dark())     */
/* -------------------------------------------------------------------------- */

const metaColorScheme = document.head.querySelector<HTMLMetaElement>(
  'meta[name="color-scheme"]',
);
const osDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function getEffectiveTheme(): "dark" | "light" {
  const content = metaColorScheme?.getAttribute("content") ?? "light dark";
  if (content === "dark") return "dark";
  if (content === "light") return "light";
  return osDarkQuery.matches ? "dark" : "light";
}

function syncThemeDomAttributes(): void {
  const content = metaColorScheme?.getAttribute("content") ?? "light dark";
  if (content === "dark" || content === "light") {
    document.documentElement.setAttribute("data-theme", content);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

function updateThemeButtonUI(): void {
  const btn = document.getElementById("theme-toggle");
  const label = document.getElementById("theme-toggle-label");
  if (!btn || !label) return;
  const effective = getEffectiveTheme();
  const nextIsDark = effective === "light";
  label.textContent = nextIsDark ? t("theme.toDark") : t("theme.toLight");
  btn.setAttribute("aria-pressed", String(effective === "dark"));
}

function initThemeToggle(): void {
  const btn = document.getElementById("theme-toggle");
  syncThemeDomAttributes();
  updateThemeButtonUI();

  btn?.addEventListener("click", () => {
    const current = getEffectiveTheme();
    const next: "dark" | "light" = current === "dark" ? "light" : "dark";
    const matchesOS = (next === "dark") === osDarkQuery.matches;

    if (matchesOS) {
      try {
        localStorage.removeItem("color-scheme");
      } catch {}
      metaColorScheme?.setAttribute("content", "light dark");
    } else {
      try {
        localStorage.setItem("color-scheme", next);
      } catch {}
      metaColorScheme?.setAttribute("content", next);
    }

    syncThemeDomAttributes();
    updateThemeButtonUI();
  });

  // Only react to OS preference changes while synced (no stored override)
  osDarkQuery.addEventListener("change", () => {
    let hasOverride = false;
    try {
      hasOverride = Boolean(localStorage.getItem("color-scheme"));
    } catch {}
    if (!hasOverride) {
      syncThemeDomAttributes();
      updateThemeButtonUI();
    }
  });

  // Sync theme & language overrides across tabs
  window.addEventListener("storage", (event) => {
    if (event.key === "color-scheme") {
      const next =
        event.newValue === "light" || event.newValue === "dark"
          ? event.newValue
          : "light dark";
      metaColorScheme?.setAttribute("content", next);
      syncThemeDomAttributes();
      updateThemeButtonUI();
    } else if (
      event.key === "gocut-site-lang" &&
      (event.newValue === "id" || event.newValue === "en") &&
      event.newValue !== currentLang
    ) {
      applyTranslations(event.newValue);
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Accessible Mobile Navigation Drawer                                         */
/* -------------------------------------------------------------------------- */

function initMobileDrawer(): void {
  const openBtn = document.getElementById("drawer-open-btn");
  const closeBtn = document.getElementById("drawer-close-btn");
  const drawer = document.getElementById("mobile-nav-drawer");
  const backdrop = document.getElementById("drawer-backdrop");
  if (!openBtn || !closeBtn || !drawer || !backdrop) return;

  const desktopQuery = window.matchMedia("(min-width: 56em)");
  const backgroundRegions = [
    document.querySelector<HTMLElement>("header.site-header"),
    document.querySelector<HTMLElement>("main"),
    document.querySelector<HTMLElement>("footer.site-footer"),
  ];

  const setBackgroundInert = (isInert: boolean) => {
    backgroundRegions.forEach((region) => {
      if (region) region.inert = isInert;
    });
  };

  const closeDrawer = (restoreFocus: boolean) => {
    if (drawer.hasAttribute("hidden")) return;
    drawer.setAttribute("hidden", "");
    backdrop.setAttribute("hidden", "");
    openBtn.setAttribute("aria-expanded", "false");
    setBackgroundInert(false);
    if (restoreFocus) {
      openBtn.focus();
    }
  };

  const openDrawer = () => {
    drawer.removeAttribute("hidden");
    backdrop.removeAttribute("hidden");
    openBtn.setAttribute("aria-expanded", "true");
    setBackgroundInert(true);
    closeBtn.focus();
  };

  openBtn.addEventListener("click", openDrawer);
  closeBtn.addEventListener("click", () => closeDrawer(true));
  backdrop.addEventListener("click", () => closeDrawer(true));

  drawer.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => closeDrawer(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !drawer.hasAttribute("hidden")) {
      event.preventDefault();
      closeDrawer(true);
    }
  });

  desktopQuery.addEventListener("change", (ev) => {
    if (ev.matches) {
      closeDrawer(false);
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Accessible ARIA Tablist Controller (Keyboard ArrowLeft/ArrowRight/Home/End) */
/* -------------------------------------------------------------------------- */

function initTablists(): void {
  document.querySelectorAll<HTMLElement>('[role="tablist"]').forEach((tablist) => {
    const tabs = Array.from(tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]'));

    const activate = (nextTab: HTMLButtonElement, moveFocus: boolean) => {
      tabs.forEach((tab) => {
        const selected = tab === nextTab;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
        const panelId = tab.getAttribute("aria-controls");
        const panel = panelId ? document.getElementById(panelId) : null;
        if (panel) {
          if (selected) panel.removeAttribute("hidden");
          else panel.setAttribute("hidden", "");
        }
      });
      if (moveFocus) nextTab.focus();
    };

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activate(tab, false));
      tab.addEventListener("keydown", (e) => {
        let nextIndex = -1;
        if (e.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
        else if (e.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
        else if (e.key === "Home") nextIndex = 0;
        else if (e.key === "End") nextIndex = tabs.length - 1;

        if (nextIndex >= 0) {
          e.preventDefault();
          activate(tabs[nextIndex], true);
        }
      });
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Native <dialog closedby="any"> Screenshot Lightbox                         */
/* -------------------------------------------------------------------------- */

function initLightbox(): void {
  const dialog = document.getElementById("screenshot-lightbox") as HTMLDialogElement | null;
  const closeBtn = document.getElementById("lightbox-close-btn");
  const titleEl = document.getElementById("lightbox-title");
  const imgEl = document.getElementById("lightbox-img") as HTMLImageElement | null;
  const captionEl = document.getElementById("lightbox-caption");

  if (!dialog || !closeBtn || !titleEl || !imgEl || !captionEl) return;

  let pointerDownOnBackdrop = false;

  document.querySelectorAll<HTMLButtonElement>(".shot-trigger").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const src = trigger.dataset.lightboxSrc ?? "/screenshots/gocut-editor.png";
      const titleKey = trigger.dataset.lightboxTitleKey ?? "shots.editor.title";
      const captionKey = trigger.dataset.lightboxCaptionKey ?? "shots.editor.caption";
      const thumbImg = trigger.querySelector("img");

      imgEl.src = src;
      imgEl.alt = thumbImg?.alt ?? t(titleKey);
      titleEl.textContent = t(titleKey);
      captionEl.textContent = t(captionKey);
      dialog.showModal();
    });
  });

  closeBtn.addEventListener("click", () => dialog.close("close-button"));

  dialog.addEventListener("close", () => {
    dialog.returnValue = "";
  });

  // Polyfill fallback ONLY if native closedby="any" is unavailable
  if (!("closedBy" in HTMLDialogElement.prototype)) {
    dialog.addEventListener("pointerdown", (event) => {
      if (event.target !== dialog) {
        pointerDownOnBackdrop = false;
        return;
      }
      const rect = dialog.getBoundingClientRect();
      pointerDownOnBackdrop =
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom;
    });
    dialog.addEventListener("pointerup", (event) => {
      if (!pointerDownOnBackdrop || event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const outside =
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom;
      if (outside) dialog.close("backdrop");
      pointerDownOnBackdrop = false;
    });
  }
}

/* -------------------------------------------------------------------------- */
/* GitHub Releases Fetcher & SHA-256 Copy UI                                  */
/* -------------------------------------------------------------------------- */

function getRoleDescription(role: ReleaseAssetInfo["role"]): string {
  switch (role) {
    case "setup":
      return t("downloads.roleSetup");
    case "websetup":
      return t("downloads.roleWebsetup");
    case "portable":
      return t("downloads.rolePortable");
    default:
      return t("downloads.roleOther");
  }
}

function formatPublishedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const formatted = new Intl.DateTimeFormat(currentLang === "id" ? "id-ID" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
  return `${t("release.published")} ${formatted}`;
}

function renderReleaseSection(): void {
  const statusEl = document.getElementById("release-status-text");
  const tagEl = document.getElementById("active-release-tag");
  const dateEl = document.getElementById("active-release-date");
  const linkEl = document.getElementById("active-release-link") as HTMLAnchorElement | null;
  const listEl = document.getElementById("installer-list");
  const stageBodyEl = document.querySelector<HTMLElement>('[data-i18n="downloads.stageBody"]');
  const heroCtaEl = document.getElementById("hero-download-cta") as HTMLAnchorElement | null;

  if (statusEl) {
    if (currentFetchState === "loading") {
      statusEl.textContent = t("downloads.loading");
      statusEl.dataset.state = "loading";
    } else if (currentFetchState === "ok") {
      statusEl.textContent = t("downloads.liveOk");
      statusEl.dataset.state = "ok";
    } else {
      statusEl.textContent = t("downloads.fallbackWarn");
      statusEl.dataset.state = "warn";
    }
  }

  const release = latestRelease;
  const channelLabel = release.prerelease ? t("release.prerelease") : t("release.stable");

  if (tagEl) tagEl.textContent = `${release.tag} (${channelLabel})`;
  if (dateEl) dateEl.textContent = formatPublishedDate(release.publishedAt);
  if (linkEl) linkEl.href = release.htmlUrl;

  if (stageBodyEl) {
    const isV090Published = /0\.9\./.test(release.tag);
    stageBodyEl.textContent = isV090Published
      ? t("downloads.stagePublished")
      : t("downloads.stageBody");
  }

  const primarySetup =
    release.assets.find((a) => a.role === "setup") ?? release.assets[0];
  if (heroCtaEl && primarySetup) {
    heroCtaEl.href = "#downloads";
  }

  if (!listEl) return;
  listEl.innerHTML = "";

  if (release.assets.length === 0) {
    const emptyEl = document.createElement("div");
    emptyEl.className = "installer-empty";
    emptyEl.textContent = t("downloads.empty");
    listEl.appendChild(emptyEl);
    return;
  }

  release.assets.forEach((asset) => {
    const row = document.createElement("article");
    row.className = "installer-row";

    const info = document.createElement("div");
    info.className = "installer-info";

    const head = document.createElement("div");
    head.className = "installer-head";

    const nameSpan = document.createElement("span");
    nameSpan.className = "installer-name";
    nameSpan.textContent = asset.name;

    const sizeSpan = document.createElement("span");
    sizeSpan.className = "installer-size";
    sizeSpan.textContent = formatFileSize(asset.sizeBytes);

    head.append(nameSpan, sizeSpan);

    const desc = document.createElement("p");
    desc.className = "installer-desc";
    desc.textContent = getRoleDescription(asset.role);

    const shaLine = document.createElement("div");
    shaLine.className = "installer-sha";
    shaLine.textContent = asset.sha256
      ? `SHA-256: ${asset.sha256}`
      : t("downloads.shaMissing");

    info.append(head, desc, shaLine);

    const actions = document.createElement("div");
    actions.className = "installer-actions";

    if (asset.sha256) {
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "btn btn-secondary";
      copyBtn.textContent = t("downloads.copySha");
      copyBtn.setAttribute("aria-label", `${t("downloads.copySha")} ${asset.name}`);
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(asset.sha256);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = asset.sha256;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }
        copyBtn.textContent = `${t("downloads.copiedSha")}: ${asset.sha256.slice(0, 8)}...`;
        setTimeout(() => {
          copyBtn.textContent = t("downloads.copySha");
        }, 2000);
      });
      actions.appendChild(copyBtn);
    }

    const dlLink = document.createElement("a");
    dlLink.className = asset.role === "setup" ? "btn btn-primary" : "btn btn-secondary";
    dlLink.href = asset.downloadUrl;
    dlLink.rel = "noopener noreferrer";
    dlLink.textContent = `${t("downloads.downloadBtn")} (${formatFileSize(asset.sizeBytes)})`;
    actions.appendChild(dlLink);

    row.append(info, actions);
    listEl.appendChild(row);
  });
}

let activeAbortController: AbortController | null = null;

async function loadGitHubRelease(bypassCache = false): Promise<void> {
  if (activeAbortController) {
    activeAbortController.abort();
  }
  activeAbortController = new AbortController();
  currentFetchState = "loading";
  renderReleaseSection();

  try {
    const info = await fetchLatestRelease(activeAbortController.signal, bypassCache);
    latestRelease = info;
    currentFetchState = "ok";
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    latestRelease = FALLBACK_RELEASE;
    currentFetchState = "fallback";
  }
  renderReleaseSection();
}

/* -------------------------------------------------------------------------- */
/* Bootstrap                                                                  */
/* -------------------------------------------------------------------------- */

function loadWebFontsNonBlocking(): void {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap";
  document.head.appendChild(link);
}

function init(): void {
  loadWebFontsNonBlocking();
  initThemeToggle();
  initMobileDrawer();
  initTablists();
  initLightbox();

  const langBtn = document.getElementById("lang-toggle");
  langBtn?.addEventListener("click", () => {
    const next: SiteLang = currentLang === "id" ? "en" : "id";
    applyTranslations(next);
  });

  const refreshBtn = document.getElementById("refresh-releases-btn");
  refreshBtn?.addEventListener("click", () => {
    void loadGitHubRelease(true);
  });

  applyTranslations(currentLang);
  void loadGitHubRelease(false);
}

init();
