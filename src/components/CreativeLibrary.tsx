import { useState } from "react";
import { Plus, Search, Type } from "lucide-react";
import {
  MOTION_PRESETS,
  TEXT_PRESETS,
  TRANSITION_PRESETS,
  type MotionId,
  type TextPreset,
  type TransitionId,
} from "../core/creativePresets";
import PresetPreview from "./PresetPreview";
import { useTranslation } from "../i18n";
import "./CreativeLibrary.css";

function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (text: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <label className="creative-search">
      <Search size={14} />
      <input
        aria-label={t("creative.search")}
        placeholder={t("creative.searchPlaceholder")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="creative-footer">{t("creative.footerNotice")}</footer>
  );
}

export function TextLibrary({
  onAdd,
  onBlank,
}: {
  onAdd: (preset: TextPreset) => void;
  onBlank: () => void;
}) {
  const { t } = useTranslation();
  const categoryLabels: Record<string, string> = {
    "all": t("media.filterAll"),
    "Title": t("creative.catTitle"),
    "Subtitle": t("nav.subtitles"),
    "Badge": t("creative.catBadge"),
    "Dynamic": t("creative.catDynamic"),
    "全部": t("media.filterAll"),
    "标题": t("creative.catTitle"),
    "字幕": t("nav.subtitles"),
    "标记": t("creative.catBadge"),
    "动态": t("creative.catDynamic"),
  };
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("all");
  const presets = TEXT_PRESETS.filter(
    (p) =>
      (category === "all" || category === "全部" || category === p.category) &&
      (p.name + p.style.text)
        .toLowerCase()
        .includes(query.toLowerCase().trim()),
  );
  return (
    <section className="creative-library" aria-label={t("creative.textLibrary")}>
      <header>
        <strong>
          {t("creative.textPresets")} <small>{TEXT_PRESETS.length}</small>
        </strong>
        <button onClick={onBlank}>
          <Type size={12} /> {t("creative.addText")}
        </button>
      </header>
      <SearchBox value={query} onChange={setQuery} />
      <div className="creative-tabs" role="tablist" aria-label={t("creative.category")}>
        {["all", "Title", "Subtitle", "Badge", "Dynamic"].map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={category === c}
            onClick={() => setCategory(c)}
          >
            {categoryLabels[c] || c}
          </button>
        ))}
      </div>
      <div className="creative-scroll">
        <p className="creative-help">{t("creative.textHelp")}</p>
        <div className="creative-grid">
          {presets.map((p) => (
            <article className="creative-card" key={p.id} data-preset-id={p.id}>
              <PresetPreview text={p} label={p.name} />
              <div>
                <span>
                  {p.name}
                  <small>{categoryLabels[p.category] || p.category} · {t("creative.editableText")}</small>
                </span>
                <button
                  aria-label={`${t("timeline.addMedia")}: ${p.name}`}
                  onClick={() => onAdd(p)}
                >
                  <Plus size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
        {!presets.length && (
          <p className="creative-empty">{t("creative.noTextPresets")}</p>
        )}
      </div>
      <Footer />
    </section>
  );
}

export function MotionLibrary({
  disabled,
  onApply,
}: {
  disabled: boolean;
  onApply: (motion: MotionId) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const presets = MOTION_PRESETS.filter((p) =>
    (p.name + p.description).includes(query.trim()),
  );
  return (
    <>
      <SearchBox value={query} onChange={setQuery} />
      <p className="creative-help">{t("creative.motionHelp")}</p>
      <div className="creative-grid">
        {presets.map((p) => (
          <article className="creative-card" key={p.id} data-preset-id={p.id}>
            <PresetPreview motion={p.id} label={p.name} />
            <div>
              <span title={p.description}>
                {p.name}
                <small>{t("creative.keyframeMotion")}</small>
              </span>
              <button
                disabled={disabled}
                aria-label={`${t("effects.apply")} ${p.name}`}
                onClick={() => onApply(p.id)}
              >
                <Plus size={14} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {!presets.length && <p className="creative-empty">{t("creative.noMotionPresets")}</p>}
    </>
  );
}

export function TransitionLibrary({
  disabled,
  onApply,
}: {
  disabled: boolean;
  onApply: (transition: TransitionId, seconds: number) => void;
}) {
  const { t } = useTranslation();
  const transCategories: Record<string, string> = {
    "all": t("media.filterAll"),
    "Basic": t("creative.catBasic"),
    "Motion": t("creative.catCamera"),
    "Dynamic": t("creative.catDynamic"),
    "全部": t("media.filterAll"),
    "基础": t("creative.catBasic"),
    "运镜": t("creative.catCamera"),
    "动感": t("creative.catDynamic"),
  };
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [seconds, setSeconds] = useState(0.5);
  const presets = TRANSITION_PRESETS.filter(
    (p) =>
      (category === "all" || category === "全部" || category === p.category) &&
      (p.name + p.description).includes(query.trim()),
  );
  return (
    <section className="creative-library" aria-label={t("creative.transitionLibrary")}>
      <header>
        <strong>
          {t("creative.videoTransitions")} <small>{TRANSITION_PRESETS.length}</small>
        </strong>
        <span>{t("creative.localGenerated")}</span>
      </header>
      <SearchBox value={query} onChange={setQuery} />
      <div className="creative-tabs" role="tablist" aria-label={t("creative.category")}>
        {["all", "Basic", "Motion", "Dynamic"].map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={category === c}
            onClick={() => setCategory(c)}
          >
            {transCategories[c] || c}
          </button>
        ))}
      </div>
      <label className="creative-duration">
        {t("creative.transitionDuration")}
        <input
          type="number"
          aria-label={t("creative.transitionDuration")}
          min={0.05}
          max={5}
          step={0.05}
          value={seconds}
          onChange={(e) => {
            const value = Number(e.target.value);
            if (Number.isFinite(value))
              setSeconds(Math.max(0.05, Math.min(5, value)));
          }}
        />
        s
      </label>
      <div className="creative-scroll">
        <p className="creative-help">{t("creative.transitionHelp")}</p>
        <div className="creative-grid">
          {presets.map((p) => (
            <article
              className="creative-card is-draggable"
              key={p.id}
              data-preset-id={p.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-gocut-transition", p.id);
                e.dataTransfer.setData("application/x-reacut-transition", p.id);
                e.dataTransfer.setData("application/x-transition-duration", String(seconds));
                e.dataTransfer.setData("text/plain", p.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
            >
              <PresetPreview transition={p.id} label={p.name} />
              <div>
                <span title={p.description}>
                  {p.name}
                  <small>
                    {transCategories[p.category] || p.category} · {p.description}
                  </small>
                </span>
                <button
                  disabled={disabled}
                  className="transition-apply"
                  aria-label={`${t("effects.apply")} ${p.name}`}
                  onClick={() => onApply(p.id, seconds)}
                >
                  <Plus size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
        {!presets.length && <p className="creative-empty">{t("creative.noTransitionPresets")}</p>}
      </div>
      <Footer />
    </section>
  );
}
