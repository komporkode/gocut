import { useEffect, useRef, useState } from "react";
import { AudioLines, Check, LoaderCircle, Pause, Play, Plus, Search, X } from "lucide-react";
import { BUILTIN_ASSETS, BUILTIN_CATEGORIES, builtinAssetUrl, filterBuiltinAssets, type BuiltinAsset, type BuiltinAssetCategory } from "../core/builtinAssets";
import "./AssetLibrary.css";
import { useTranslation } from "../i18n";

export interface AssetLibraryProps {
  onAdd: (asset: BuiltinAsset) => void | Promise<void>;
  addingId?: string | null;
}

export default function AssetLibrary({ onAdd, addingId }: AssetLibraryProps) {
  const { t } = useTranslation();
  const [category, setCategory] = useState<BuiltinAssetCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const [recent, setRecent] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { audio.current?.pause(); if (addedTimer.current) clearTimeout(addedTimer.current); }, []);
  useEffect(() => { audio.current?.pause(); audio.current = null; setPlaying(null); }, [category, query]);

  const filtered = filterBuiltinAssets(category, query);
  const busy = addingId || pending;

  const previewSound = async (asset: BuiltinAsset) => {
    audio.current?.pause();
    if (playing === asset.id) { audio.current = null; setPlaying(null); return; }
    const element = new Audio(builtinAssetUrl(asset));
    element.volume = 0.55;
    audio.current = element;
    element.onended = () => { if (audio.current === element) setPlaying(null); };
    element.onerror = () => { if (audio.current === element) { setPlaying(null); setError(t("builtin.audioFailed")); } };
    try { await element.play(); if (audio.current === element) setPlaying(asset.id); } catch { if (audio.current === element) setError(t("builtin.audioFailed")); }
  };

  const add = async (asset: BuiltinAsset) => {
    if (busy) return;
    setPending(asset.id); setError("");
    try {
      await onAdd(asset); setRecent(asset.id);
      if (addedTimer.current) clearTimeout(addedTimer.current);
      addedTimer.current = setTimeout(() => setRecent(null), 1800);
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("builtin.addFailed")); }
    finally { setPending(null); }
  };

  const categoryNames: Record<string, string> = {
    all: t("builtin.catAll"),
    stickers: t("builtin.catStickers"),
    backgrounds: t("builtin.catBackgrounds"),
    titles: t("builtin.catTitles"),
    sounds: t("builtin.catSounds"),
  };

  return <section className="builtin-library" aria-label={t("builtin.libraryTitle")}>
    <header className="builtin-header">
      <div>
        <strong>{t("builtin.headerTitle")}</strong>
        <span>{t("builtin.headerSubtitle", { count: BUILTIN_ASSETS.length })}</span>
      </div>
      <span className="builtin-offline">{t("builtin.badgeBuiltin")}</span>
    </header>
    <label className="builtin-search">
      <Search size={14} />
      <input
        aria-label={t("builtin.searchAria")}
        placeholder={t("builtin.searchPlaceholder")}
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      {query && <button aria-label={t("builtin.clearSearch")} onClick={() => setQuery("")}><X size={13}/></button>}
    </label>
    <div className="builtin-categories" role="tablist" aria-label={t("builtin.categoriesAria")}>
      {[{id: "all" as const, name: t("builtin.catAll")}, ...BUILTIN_CATEGORIES].map(item => (
        <button
          key={item.id}
          role="tab"
          aria-selected={category === item.id}
          onClick={() => setCategory(item.id)}
        >
          {categoryNames[item.id] || item.name}
        </button>
      ))}
    </div>
    {error && <p className="builtin-error" role="alert">{error}</p>}
    <div className="builtin-results">
      {category === "titles" && <p className="builtin-hint">{t("builtin.titlesHint")}</p>}
      {filtered.length === 0 ? (
        <div className="builtin-empty">
          <Search size={25}/>
          <strong>{t("builtin.empty")}</strong>
          <span>{t("builtin.emptyTip")}</span>
          <button onClick={() => { setQuery(""); setCategory("all"); }}>{t("builtin.viewAll")}</button>
        </div>
      ) : (
        <div className="builtin-grid">
          {filtered.map(asset => (
            <article className={`builtin-card builtin-${asset.category}`} key={asset.id} data-builtin-id={asset.id}>
              {asset.kind === "audio" ? (
                <button
                  className="builtin-preview builtin-audio"
                  aria-label={`${playing === asset.id ? "Stop" : "Play"} ${asset.name}`}
                  onClick={() => void previewSound(asset)}
                >
                  <AudioLines size={32}/>
                  <span className="builtin-play">{playing === asset.id ? <Pause size={13}/> : <Play size={13}/>}</span>
                  <small>{asset.duration.toFixed(2)}s</small>
                </button>
              ) : (
                <div className={`builtin-preview ${asset.transparent ? "builtin-alpha" : ""}`}>
                  <img src={builtinAssetUrl(asset)} alt={asset.name} loading="lazy" draggable={false}/>
                  {asset.transparent && <small>PNG</small>}
                </div>
              )}
              <div className="builtin-card-footer">
                <div>
                  <strong title={asset.name}>{asset.name}</strong>
                  <span>{asset.kind === "audio" ? t("builtin.typeAudio") : asset.category === "titles" ? t("builtin.typeTitle") : asset.category === "backgrounds" ? "1920 × 1080" : t("builtin.typeSticker")}</span>
                </div>
                <button
                  aria-label={`Add ${asset.name}`}
                  title={t("timeline.addMedia")}
                  disabled={!!busy}
                  onClick={() => void add(asset)}
                >
                  {busy === asset.id ? <LoaderCircle size={15} className="builtin-spin"/> : recent === asset.id ? <Check size={15}/> : <Plus size={15}/>}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
    <footer className="builtin-footer">
      <span>{t("builtin.footerCount", { count: filtered.length })}</span>
      <span>{t("builtin.footerLicense")}</span>
    </footer>
  </section>;
}
