import {
  SubtitleAnimationForm,
  SubtitleStyleForm,
} from "./SubtitleBatchOptions";
import type {
  SubtitleAnimation,
  SubtitleStyleValues,
} from "../core/subtitleWorkflow";
import { DEFAULT_TEXT } from "../core/defaults";
import { useTranslation } from "../i18n/useTranslation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FolderOpen,
  LockKeyhole,
  Search,
  Subtitles,
} from "lucide-react";
import { useEditorStore } from "../editor/store";
import { clone } from "../core/model";
import {
  applySubtitleEdit,
  prepareSubtitleEdit,
  type SubtitleEdit,
  type SubtitleEditPlan,
} from "../core/subtitleEdits";
import type { Clip, Project } from "../core/types";
import "./SubtitlePanel.css";

interface Props {
  onSpeech: (mode: "asr" | "tts") => void;
  onImport: () => void | Promise<void>;
  onExport: () => void | Promise<void>;
}
interface CueDraft {
  project: Project;
  id: string;
  text: string;
  start: string;
  end: string;
}
const seconds = (value: number) => Number(value.toFixed(6)).toString();
const timeLabel = (value: number) =>
  `${Math.floor(value / 60)
    .toString()
    .padStart(2, "0")}:${(value % 60).toFixed(2).padStart(5, "0")}`;

export default function SubtitlePanel({ onImport, onExport, onSpeech }: Props) {
  const { t } = useTranslation();
  const project = useEditorStore((s) => s.project);
  const [trackId, setTrackId] = useState("");
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<string[]>([]);
  const [draft, setDraft] = useState<CueDraft | null>(null);
  const [mode, setMode] = useState<
    "offset" | "replace" | "style" | "styleValues" | "animation"
  >("offset");
  const [styleValues, setStyleValues] = useState<SubtitleStyleValues>(() => ({
    fontSize: DEFAULT_TEXT.fontSize,
    color: DEFAULT_TEXT.color,
    background: DEFAULT_TEXT.background,
    bold: DEFAULT_TEXT.bold,
    align: DEFAULT_TEXT.align,
    stroke: DEFAULT_TEXT.stroke,
    strokeWidth: DEFAULT_TEXT.strokeWidth,
  }));
  const [animation, setAnimation] = useState<SubtitleAnimation>({
    entrance: "fade",
    exit: "fade",
    inDuration: 0.4,
    outDuration: 0.4,
    distance: 48,
  });
  const cueText = useRef<HTMLTextAreaElement>(null);
  const [offset, setOffset] = useState("0");
  const [find, setFind] = useState("");
  const [replacement, setReplacement] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [plan, setPlan] = useState<SubtitleEditPlan | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const feedback = useRef<HTMLParagraphElement>(null);
  const knownTracks = useRef(new Set(project.tracks.map((t) => t.id)));
  const tracks = project.tracks.filter((t) => t.kind === "text");
  const activeTrack = tracks.find((t) => t.id === trackId);
  const clips = useMemo(
    () =>
      project.clips
        .filter((c) => c.trackId === trackId && c.text)
        .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id)),
    [project, trackId],
  );
  const visible = clips.filter((c) =>
    c.text!.text.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const selected = checked.filter((id) => clips.some((c) => c.id === id));
  const locked = !!activeTrack?.locked;
  const stale = !!plan && plan.base !== JSON.stringify(project);

  useEffect(() => {
    const textTracks = project.tracks.filter((t) => t.kind === "text");
    const preferred =
      textTracks.find((t) => t.name.includes("字幕") || /subtitle|caption|teks/i.test(t.name)) ?? textTracks[0];
    setTrackId(preferred?.id ?? "");
    setQuery("");
    setChecked([]);
    setDraft(null);
    setPlan(null);
    setError("");
    setNotice("");
  }, [project.id]);
  useEffect(() => {
    if (!project.tracks.some((t) => t.id === trackId && t.kind === "text")) {
      const preferred =
        project.tracks.find(
          (t) => t.kind === "text" && (t.name.includes("字幕") || /subtitle|caption|teks/i.test(t.name)),
        ) ?? project.tracks.find((t) => t.kind === "text");
      setTrackId(preferred?.id ?? "");
    }
    // Newly imported cues become selected in the editor; follow their new track.
    const first = project.clips.find(
      (c) => c.id === useEditorStore.getState().selectedIds[0] && c.text,
    );
    if (
      first &&
      first.trackId !== trackId &&
      (!knownTracks.current.has(first.trackId) ||
        !project.clips.some((c) => c.trackId === trackId))
    )
      setTrackId(first.trackId);
    knownTracks.current = new Set(project.tracks.map((t) => t.id));
  }, [project, trackId]);
  useEffect(() => {
    setChecked([]);
    setDraft(null);
    setPlan(null);
    setError("");
    setNotice("");
    setReferenceId("");
  }, [trackId]);
  useEffect(() => {
    if (error) feedback.current?.scrollIntoView({ block: "nearest" });
  }, [error]);

  function attempt(action: () => void) {
    setError("");
    setNotice("");
    try {
      action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function fileAction(action: Props["onImport"]) {
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  function editCue(clip: Clip) {
    useEditorStore.getState().select([clip.id]);
    useEditorStore.getState().seek(clip.start);
    setDraft({
      project: clone(project),
      id: clip.id,
      text: clip.text!.text,
      start: seconds(clip.start),
      end: seconds(clip.start + clip.duration),
    });
    setReferenceId(clip.id);
    setPlan(null);
    setError("");
    setNotice("");
  }
  function saveCue() {
    attempt(() => {
      if (!draft) return;
      if (!draft.start.trim() || !draft.end.trim())
        throw new Error(t("subtitles.fillStartEnd"));
      const next = prepareSubtitleEdit(draft.project, [draft.id], {
        type: "cue",
        text: draft.text,
        start: Number(draft.start),
        end: Number(draft.end),
      });
      const store = useEditorStore.getState();
      store.commit(applySubtitleEdit(store.project, next));
      setDraft(null);
      setNotice(
        next.changedIds.length ? t("subtitles.savedNotice") : t("subtitles.unchangedNotice"),
      );
    });
  }
  function prepare() {
    attempt(() => {
      let edit: SubtitleEdit;
      if (mode === "offset") {
        if (!offset.trim()) throw new Error(t("subtitles.fillStartEnd"));
        edit = { type: "offset", seconds: Number(offset) };
      } else if (mode === "replace")
        edit = { type: "replace", find, replacement };
      else if (mode === "style") edit = { type: "style", referenceId };
      else if (mode === "styleValues")
        edit = { type: "styleValues", values: styleValues };
      else edit = { type: "animation", options: animation };
      const next = prepareSubtitleEdit(
        useEditorStore.getState().project,
        selected,
        edit,
      );
      if (!next.changedIds.length) {
        setPlan(null);
        setNotice(t("subtitles.noModifyNotice"));
        return;
      }
      setPlan(next);
    });
  }
  function apply() {
    attempt(() => {
      if (!plan) return;
      const store = useEditorStore.getState();
      store.commit(applySubtitleEdit(store.project, plan));
      const surviving = selected.filter((id) =>
        plan.project.clips.some((c) => c.id === id),
      );
      store.select(surviving);
      setChecked(surviving);
      setNotice(t("subtitles.willModify", { count: plan.changedIds.length }));
      setPlan(null);
      setDraft(null);
    });
  }
  function splitCue() {
    attempt(() => {
      if (!draft || !cueText.current) return;
      const store = useEditorStore.getState();
      const next = prepareSubtitleEdit(draft.project, [draft.id], {
        type: "split",
        at: store.playhead,
        offset: cueText.current.selectionStart,
      });
      store.commit(applySubtitleEdit(store.project, next));
      store.select(next.changedIds);
      setChecked(next.changedIds);
      setDraft(null);
      setPlan(null);
      setNotice(t("subtitles.splitNotice"));
    });
  }
  function mergeSelection() {
    attempt(() => {
      setPlan(
        prepareSubtitleEdit(useEditorStore.getState().project, selected, {
          type: "merge",
        }),
      );
      setDraft(null);
    });
  }
  function setSelection(ids: string[]) {
    setChecked(ids);
    setPlan(null);
  }
  const draftStale =
    draft && JSON.stringify(draft.project) !== JSON.stringify(project);

  return (
    <section className="subtitle-panel" aria-label={t("subtitles.title")}>
      <div className="subtitle-heading">
        <h3>{t("subtitles.header")}</h3>
        <span>{t("subtitles.cuesCount", { count: clips.length })}</span>
      </div>
      <div className="subtitle-file-actions">
        <button
          className="small-button"
          disabled={!window.editorAPI}
          onClick={() => onSpeech("asr")}
        >
          {t("speech.asr")}
        </button>
        <button
          className="small-button"
          disabled={!window.editorAPI}
          onClick={() => onSpeech("tts")}
        >
          {t("speech.tts")}
        </button>
        <button
          className="small-button"
          onClick={() => void fileAction(onImport)}
        >
          <FolderOpen size={14} />
          {t("subtitles.importFile")}
        </button>
        <button
          className="small-button"
          onClick={() => void fileAction(onExport)}
          disabled={!project.clips.some((c) => c.text)}
          title={t("subtitles.exportAllTitle")}
        >
          <Download size={14} />
          {t("subtitles.exportAllSrt")}
        </button>
      </div>
      <p className="subtitle-hint">{t("subtitles.exportHint")}</p>
      <label className="subtitle-track-label">
        {t("subtitles.textTrack")}
        <select
          aria-label={t("subtitles.textTrackAria")}
          value={trackId}
          onChange={(e) => setTrackId(e.target.value)}
        >
          {!tracks.length && <option value="">{t("subtitles.noTextTracks")}</option>}
          {tracks.map((trk) => (
            <option key={trk.id} value={trk.id}>
              {trk.name}
              {trk.locked ? t("subtitles.locked") : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="subtitle-search">
        <Search size={14} />
        <input
          aria-label={t("subtitles.searchAria")}
          placeholder={t("subtitles.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="subtitle-selection">
        <label>
          <input
            type="checkbox"
            aria-label={t("subtitles.selectSearchResults")}
            disabled={locked || !visible.length}
            checked={
              visible.length > 0 &&
              visible.every((c) => selected.includes(c.id))
            }
            onChange={(e) =>
              setSelection(
                e.target.checked
                  ? [...new Set([...selected, ...visible.map((c) => c.id)])]
                  : selected.filter((id) => !visible.some((c) => c.id === id)),
              )
            }
          />
          {t("subtitles.selectSearchResults")}
        </label>
        <button
          className="subtitle-clear"
          disabled={!selected.length}
          onClick={() => setSelection([])}
        >
          {t("subtitles.clearSelection", { count: selected.length })}
        </button>
      </div>
      {locked && (
        <p className="subtitle-hint">
          <LockKeyhole size={13} />
          {t("subtitles.trackLockedHint")}
        </p>
      )}
      <div className="subtitle-cues">
        {!visible.length && (
          <div className="subtitle-empty">
            <Subtitles size={27} />
            <p>
              {clips.length
                ? t("subtitles.noMatch")
                : t("subtitles.emptyHint")}
            </p>
          </div>
        )}
        {visible.map((clip) => (
          <div
            key={clip.id}
            className={`subtitle-cue ${draft?.id === clip.id ? "active" : ""}`}
            data-cue-id={clip.id}
          >
            <div className="subtitle-cue-line">
              <input
                type="checkbox"
                aria-label={t("subtitles.selectClip", { text: clip.text!.text.slice(0, 40) })}
                checked={selected.includes(clip.id)}
                disabled={locked}
                onChange={(e) =>
                  setSelection(
                    e.target.checked
                      ? [...selected, clip.id]
                      : selected.filter((id) => id !== clip.id),
                  )
                }
              />
              <button
                className="subtitle-cue-content"
                onClick={() => editCue(clip)}
                title={t("subtitles.locateEdit")}
              >
                <span className="subtitle-time">
                  {timeLabel(clip.start)} —{" "}
                  {timeLabel(clip.start + clip.duration)}
                </span>
                <span>{clip.text!.text || t("subtitles.empty")}</span>
              </button>
            </div>
            {draft?.id === clip.id && (
              <div className="subtitle-cue-form">
                <textarea
                  ref={cueText}
                  aria-label={t("subtitles.content")}
                  value={draft.text}
                  maxLength={20000}
                  disabled={locked}
                  onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                />
                <div className="subtitle-times">
                  <label>
                    {t("subtitles.startSec")}
                    <input
                      aria-label={t("subtitles.startSec")}
                      type="number"
                      min="0"
                      max="86400"
                      step={1 / project.fps}
                      value={draft.start}
                      disabled={locked}
                      onChange={(e) =>
                        setDraft({ ...draft, start: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    {t("subtitles.endSec")}
                    <input
                      aria-label={t("subtitles.endSec")}
                      type="number"
                      min="0"
                      max="86400"
                      step={1 / project.fps}
                      value={draft.end}
                      disabled={locked}
                      onChange={(e) =>
                        setDraft({ ...draft, end: e.target.value })
                      }
                    />
                  </label>
                </div>
                <p className="subtitle-hint">
                  {t("subtitles.splitHint")}
                </p>
                <button
                  className="small-button"
                  disabled={
                    locked ||
                    !!draftStale ||
                    draft.text !== clip.text!.text ||
                    Number(draft.start) !== clip.start ||
                    Math.abs(Number(draft.end) - clip.start - clip.duration) >
                      1e-8
                  }
                  onClick={splitCue}
                >
                  {t("subtitles.splitAtPlayhead")}
                </button>
                {draftStale && (
                  <p className="subtitle-warning">
                    {t("subtitles.projectChanged")}
                  </p>
                )}
                <div className="subtitle-draft-actions">
                  <button
                    className="small-button"
                    onClick={() => setDraft(null)}
                  >
                    {t("dialog.cancel")}
                  </button>
                  <button
                    className="primary small-button"
                    disabled={locked || !!draftStale}
                    onClick={saveCue}
                  >
                    {t("subtitles.saveClip")}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="subtitle-batch">
        <div className="subtitle-heading">
          <h4>{t("subtitles.batchModify")}</h4>
          <span>{t("subtitles.selectedCount", { count: selected.length })}</span>
        </div>
        <div
          className="subtitle-batch-tabs"
          role="tablist"
          aria-label={t("subtitles.batchAction")}
        >
          {(
            [
              ["offset", t("subtitles.batchOffset")],
              ["replace", t("subtitles.batchReplace")],
              ["style", t("subtitles.batchStyle")],
              ["styleValues", t("subtitles.batchStyleValues")],
              ["animation", t("subtitles.batchAnimation")],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={mode === key}
              className={mode === key ? "active" : ""}
              onClick={() => {
                setMode(key);
                setPlan(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className="small-button"
          disabled={locked || selected.length < 2}
          onClick={mergeSelection}
        >
          {t("subtitles.mergeSelected")}
        </button>
        <p className="subtitle-hint">
          {t("subtitles.mergeDesc")}
        </p>
        {mode === "styleValues" && (
          <SubtitleStyleForm
            value={styleValues}
            onChange={(v) => {
              setStyleValues(v);
              setPlan(null);
            }}
          />
        )}
        {mode === "animation" && (
          <SubtitleAnimationForm
            value={animation}
            onChange={(v) => {
              setAnimation(v);
              setPlan(null);
            }}
          />
        )}
        {mode === "offset" && (
          <label className="subtitle-batch-field">
            {t("subtitles.offsetSec")}
            <input
              aria-label={t("subtitles.offsetSec")}
              type="number"
              step={1 / project.fps}
              value={offset}
              onChange={(e) => {
                setOffset(e.target.value);
                setPlan(null);
              }}
            />
          </label>
        )}
        {mode === "replace" && (
          <div className="subtitle-replace">
            <input
              aria-label={t("subtitles.findText")}
              placeholder={t("subtitles.findText")}
              value={find}
              onChange={(e) => {
                setFind(e.target.value);
                setPlan(null);
              }}
            />
            <input
              aria-label={t("subtitles.replaceText")}
              placeholder={t("subtitles.replaceText")}
              value={replacement}
              onChange={(e) => {
                setReplacement(e.target.value);
                setPlan(null);
              }}
            />
          </div>
        )}
        {mode === "style" && (
          <>
            <label className="subtitle-batch-field">
              {t("subtitles.styleReference")}
              <select
                aria-label={t("subtitles.styleReference")}
                value={referenceId}
                onChange={(e) => {
                  setReferenceId(e.target.value);
                  setPlan(null);
                }}
              >
                <option value="">{t("subtitles.chooseReference")}</option>
                {clips.map((c) => (
                  <option key={c.id} value={c.id}>
                    {timeLabel(c.start)} ·{" "}
                    {c.text!.text.slice(0, 30) || t("subtitles.empty")}
                  </option>
                ))}
              </select>
            </label>
            <p className="subtitle-hint">
              {t("subtitles.styleCopyNote")}
            </p>
          </>
        )}
        {plan ? (
          <div className="subtitle-plan">
            <p>
              {stale ? t("subtitles.projectChanged") : t("subtitles.willModify", { count: plan.changedIds.length })}
            </p>
            <div>
              <button
                className="small-button"
                onClick={() =>
                  attempt(() => {
                    if (plan)
                      setPlan(
                        prepareSubtitleEdit(
                          useEditorStore.getState().project,
                          selected,
                          plan.edit,
                        ),
                      );
                  })
                }
              >
                {t("subtitles.recheck")}
              </button>
              <button
                className="primary small-button"
                disabled={stale || locked}
                onClick={apply}
              >
                {t("subtitles.applyChanges", { count: plan.changedIds.length })}
              </button>
            </div>
          </div>
        ) : (
          <button
            className="small-button subtitle-check"
            disabled={!selected.length || locked}
            onClick={prepare}
          >
            {t("subtitles.checkChanges")}
          </button>
        )}
      </div>
      {error && (
        <p ref={feedback} className="subtitle-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="subtitle-notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
