import { useTranslation } from "../i18n";
import type {
  SubtitleAnimation,
  SubtitleStyleValues,
} from "../core/subtitleWorkflow";

export function SubtitleAnimationForm({
  value,
  onChange,
}: {
  value: SubtitleAnimation;
  onChange: (v: SubtitleAnimation) => void;
}) {
  const { t } = useTranslation();
  const motions = [
    ["none", t("subtitles.animNone")],
    ["fade", t("subtitles.animFade")],
    ["slide-up", t("subtitles.animSlideUp")],
    ["zoom", t("subtitles.animZoom")],
  ] as const;

  return (
    <div className="subtitle-options">
      {(["entrance", "exit"] as const).map((phase, i) => (
        <label key={phase}>
          {i ? t("subtitles.outAnimation") : t("subtitles.inAnimation")}
          <select
            aria-label={i ? t("subtitles.outAnimation") : t("subtitles.inAnimation")}
            value={value[phase]}
            onChange={(e) => onChange({ ...value, [phase]: e.target.value })}
          >
            {motions.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      ))}
      {(["inDuration", "outDuration"] as const).map((field, i) => (
        <label key={field}>
          {i ? t("subtitles.outSec") : t("subtitles.inSec")}
          <input
            aria-label={i ? t("subtitles.outSec") : t("subtitles.inSec")}
            type="number"
            min="0"
            max="60"
            step="0.05"
            value={value[field]}
            onChange={(e) =>
              onChange({ ...value, [field]: Number(e.target.value) })
            }
          />
        </label>
      ))}
      <label>
        {t("subtitles.slideDistance")}
        <input
          aria-label={t("subtitles.slideDistance")}
          type="number"
          min="0"
          max="10000"
          value={value.distance}
          onChange={(e) =>
            onChange({ ...value, distance: Number(e.target.value) })
          }
        />
      </label>
      <label>
        {t("subtitles.holdAnimation")}
        <select
          aria-label={t("subtitles.holdAnimation")}
          value={value.hold ?? "still"}
          onChange={(e) =>
            onChange({ ...value, hold: e.target.value as "still" | "pulse" })
          }
        >
          <option value="still">{t("subtitles.holdStill")}</option>
          <option value="pulse">{t("subtitles.holdPulse")}</option>
        </select>
      </label>
      <label>
        {t("subtitles.pulseAmp")}
        <input
          aria-label={t("subtitles.pulseAmp")}
          type="number"
          min="0"
          max="50"
          step="1"
          disabled={value.hold !== "pulse"}
          value={(value.pulseAmount ?? 0.08) * 100}
          onChange={(e) =>
            onChange({ ...value, pulseAmount: Number(e.target.value) / 100 })
          }
        />
      </label>
      <p className="subtitle-hint">{t("subtitles.holdDesc")}</p>
    </div>
  );
}

export function SubtitleStyleForm({
  value,
  onChange,
}: {
  value: SubtitleStyleValues;
  onChange: (v: SubtitleStyleValues) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="subtitle-options">
      <label>
        {t("subtitles.fontSize")}
        <input
          aria-label={t("subtitles.fontSize")}
          type="number"
          min="1"
          max="1000"
          value={value.fontSize}
          onChange={(e) =>
            onChange({ ...value, fontSize: Number(e.target.value) })
          }
        />
      </label>
      <label>
        {t("subtitles.textColor")}
        <input
          aria-label={t("subtitles.textColor")}
          type="color"
          value={value.color}
          onChange={(e) => onChange({ ...value, color: e.target.value })}
        />
      </label>
      <label>
        {t("subtitles.strokeColor")}
        <input
          aria-label={t("subtitles.strokeColor")}
          type="color"
          value={value.stroke}
          onChange={(e) => onChange({ ...value, stroke: e.target.value })}
        />
      </label>
      <label>
        {t("subtitles.strokeWidth")}
        <input
          aria-label={t("subtitles.strokeWidth")}
          type="number"
          min="0"
          max="100"
          value={value.strokeWidth}
          onChange={(e) =>
            onChange({ ...value, strokeWidth: Number(e.target.value) })
          }
        />
      </label>
      <label>
        {t("subtitles.background")}
        <input
          aria-label={t("subtitles.background")}
          value={value.background}
          onChange={(e) => onChange({ ...value, background: e.target.value })}
        />
      </label>
      <label>
        {t("subtitles.align")}
        <select
          aria-label={t("subtitles.align")}
          value={value.align}
          onChange={(e) =>
            onChange({
              ...value,
              align: e.target.value as SubtitleStyleValues["align"],
            })
          }
        >
          <option value="left">{t("subtitles.alignLeft")}</option>
          <option value="center">{t("subtitles.alignCenter")}</option>
          <option value="right">{t("subtitles.alignRight")}</option>
        </select>
      </label>
      <label>
        <input
          aria-label={t("subtitles.bold")}
          type="checkbox"
          checked={value.bold}
          onChange={(e) => onChange({ ...value, bold: e.target.checked })}
        />
        {t("subtitles.bold")}
      </label>
      <p className="subtitle-hint">{t("subtitles.styleBatchDesc")}</p>
    </div>
  );
}
