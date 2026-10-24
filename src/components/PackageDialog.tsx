import { useEffect, useRef, useState } from "react";
import type { ExportProgress, Project } from "../core/types";
import { FolderOpen, Package, X } from "lucide-react";
import { useTranslation } from "../i18n";

export default function PackageDialog({ project, onClose }: { project: Project; onClose(): void }) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<ExportProgress | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const job = useRef<string | null>(null);
  const alive = useRef(true), requested = useRef(false);
  useEffect(() => {
    alive.current = true;
    const unsubscribe = window.editorAPI?.onPackageProgress(event => {
      if (!requested.current) return;
      if (job.current && job.current !== event.jobId) return;
      setProgress(event);
      if (["complete", "error", "cancelled"].includes(event.status)) {
        requested.current = false;
        setBusy(false);
        if (event.status === "error") setError(event.message ?? t("package.failed"));
      }
    });
    return () => { alive.current = false; unsubscribe?.(); if (requested.current && job.current) void window.editorAPI?.cancelPackage(job.current); };
  }, []);
  const start = async () => {
    if (!window.editorAPI) { setError(t("package.desktopOnly")); return; }
    if (requested.current) return;
    requested.current = true;
    setBusy(true); setError(""); setProgress(null); job.current = null;
    try {
      const result = await window.editorAPI.packageProject(project);
      if (!alive.current) { if (result) void window.editorAPI.cancelPackage(result.jobId); return; }
      if (result) { job.current = result.jobId; setProgress(current => current ?? { jobId: result.jobId, status: "preparing", progress: 0, message: t("package.checking") }); }
      else { requested.current = false; setBusy(false); }
    }
    catch (e) { requested.current = false; if (alive.current) { setBusy(false); setError(String(e)); } }
  };
  return (
    <div className="modal-backdrop">
      <section className="modal" role="dialog" aria-modal="true" aria-label={t("package.title")}>
        <header>
          <h2><Package size={18} /> {t("package.title")}</h2>
          <button aria-label={t("dialog.close")} disabled={busy} onClick={onClose}><X size={18} /></button>
        </header>
        <div className="modal-body">
          <h3>{project.name}</h3>
          <p>{t("package.desc", { count: project.assets.length })}</p>
          <p className="muted small">{t("package.note")}</p>
          {progress && (
            <div className="export-progress">
              <p>{progress.status === "complete" ? t("package.complete") : progress.status === "cancelled" ? t("package.cancelled") : progress.message}</p>
              <progress max={1} value={progress.progress} />
              <p>{Math.round(progress.progress * 100)}%</p>
            </div>
          )}
          {error && <p role="alert" className="inline-warning">{error}</p>}
        </div>
        <footer>
          {busy ? (
            <button disabled={!job.current} onClick={() => { if (job.current) void window.editorAPI?.cancelPackage(job.current); }}>
              {t("package.cancel")}
            </button>
          ) : progress?.status === "complete" ? (
            <>
              <button onClick={() => void window.editorAPI?.revealPath(progress.path!)}>
                <FolderOpen size={15}/>{t("package.reveal")}
              </button>
              <button className="primary" onClick={onClose}>{t("dialog.closeButton")}</button>
            </>
          ) : (
            <>
              <button onClick={onClose}>{t("dialog.cancel")}</button>
              <button className="primary" onClick={() => void start()}>{t("package.start")}</button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
