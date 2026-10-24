import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { DerivativeProgress, DerivativeRequest } from '../core/types';
import { applyDerivative, derivativePlan } from '../core/derivativeEdits';
import { useEditorStore } from '../editor/store';
import { useTranslation } from '../i18n';

export default function DerivativeDialog({ mode, onClose }: { mode: 'reverse' | 'freeze'; onClose(): void }) {
  const { t } = useTranslation();
  const [captured] = useState(() => {
    const s = useEditorStore.getState();
    return { project: s.project, clipId: s.selectedIds[0], time: s.playhead };
  });
  const [audio, setAudio] = useState<'reverse' | 'mute'>('reverse');
  const [duration, setDuration] = useState('2');
  const [progress, setProgress] = useState<DerivativeProgress | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const running = useRef<string | null>(null), alive = useRef(true), cancelled = useRef(false);
  useEffect(() => {
    alive.current = true;
    const unsubscribe = window.editorAPI?.onDerivativeProgress(e => { if (e.jobId === running.current) setProgress(e); });
    return () => { alive.current = false; unsubscribe?.(); if (running.current) void window.editorAPI?.cancelDerivative(running.current); };
  }, []);
  const request: DerivativeRequest = { mode, audio, duration: Number(duration), time: captured.time };
  let preflight = '';
  try { derivativePlan(captured.project, captured.clipId, request); } catch (e) { preflight = (e as Error).message; }
  const start = async () => {
    if (!window.editorAPI || running.current) return;
    const jobId = crypto.randomUUID(); running.current = jobId; cancelled.current = false; setBusy(true); setError('');
    try {
      const asset = await window.editorAPI.deriveMedia(jobId, captured.project, captured.clipId, request);
      if (!alive.current || cancelled.current) return;
      const store = useEditorStore.getState();
      if (store.project !== captured.project) throw new Error(t('derivative.staleError'));
      const result = applyDerivative(store.project, captured.clipId, request, asset);
      store.commit(result.project); store.select([result.clipId]); store.seek(mode === 'freeze' ? captured.time : result.project.clips.find(c => c.id === result.clipId)!.start);
      onClose();
    } catch (e) { if (alive.current) setError(String(e).replace(/^Error: Error invoking remote method '[^']+': (?:Error: )?/, '')); }
    finally { running.current = null; if (alive.current) setBusy(false); }
  };
  const title = mode === 'reverse' ? t('derivative.reverseTitle') : t('derivative.freezeTitle');
  return (
    <div className="modal-backdrop">
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button disabled={busy} aria-label={t('derivative.close')} onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">
          <p>{captured.project.clips.find(c => c.id === captured.clipId)?.name}</p>
          {mode === 'reverse' ? (
            <>
              <p>{t('derivative.reverseDesc')}</p>
              <label>
                {t('derivative.reverseAudio')}{' '}
                <select aria-label={t('derivative.reverseAudio')} disabled={busy} value={audio} onChange={e => setAudio(e.target.value as typeof audio)}>
                  <option value="reverse">{t('derivative.reverseAudioSync')}</option>
                  <option value="mute">{t('derivative.reverseAudioMute')}</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <p>{t('derivative.freezeDesc')}</p>
              <label>
                {t('derivative.freezeDuration')}{' '}
                <input aria-label={t('derivative.freezeDuration')} type="number" min={1 / captured.project.fps} max="3600" step={1 / captured.project.fps} disabled={busy} value={duration} onChange={e => setDuration(e.target.value)} />
              </label>
            </>
          )}
          <p className="muted small">{t('derivative.note')}</p>
          {progress && (
            <div className="export-progress">
              <p>{progress.message}</p>
              <progress max={1} value={progress.progress} />
              <p>{Math.round(progress.progress * 100)}%</p>
            </div>
          )}
          {(error || preflight) && <p role="alert" className="inline-warning">{error || preflight}</p>}
        </div>
        <footer>
          {busy ? (
            <button onClick={() => { cancelled.current = true; if (running.current) void window.editorAPI?.cancelDerivative(running.current); }}>
              {t('derivative.cancel')}
            </button>
          ) : (
            <>
              <button onClick={onClose}>{t('dialog.closeButton')}</button>
              <button className="primary" disabled={!!preflight || !window.editorAPI} onClick={() => void start()}>
                {mode === 'reverse' ? t('derivative.generateReverse') : t('derivative.generateFreeze')}
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
