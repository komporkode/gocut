import { useTranslation } from "../i18n";
import { useEffect, useRef, useState } from "react";
import { MessageSquare, RefreshCw, Send, Square, X } from "lucide-react";
import { useEditorStore } from "../editor/store";
import { assistantProjectContext, previewAssistantEdits, type AssistantEditPreview } from "../core/assistantEdits";
import type { AssistantMessage, AssistantProvider, AssistantProviderInfo } from "../core/assistantTypes";
import type { Project } from "../core/types";
import "./AssistantPanel.css";

type Proposal = { preview: AssistantEditPreview; base: string; applied: boolean };
export default function AssistantPanel({ onClose }: { onClose(): void }) {
  const { t } = useTranslation();
  const project = useEditorStore(s => s.project);
  const [provider, setProvider] = useState<AssistantProvider>("codex");
  const [providers, setProviders] = useState<AssistantProviderInfo[]>([]);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState(""), [error, setError] = useState("");
  const [stream, setStream] = useState(""), [proposal, setProposal] = useState<Proposal | null>(null);
  const active = useRef<{ id: string; project: Project; base: string; history: AssistantMessage[] } | null>(null);
  const generation = useRef(0), lastPrompt = useRef("");
  const history = useRef<AssistantMessage[]>([]), chatEnd = useRef<HTMLDivElement>(null);
  const refresh = async () => {
    try { setProviders(await window.editorAPI!.getAssistantProviders()); }
    catch (e) { setError(String(e)); }
  };
  useEffect(() => { if (window.editorAPI) void refresh(); }, []);
  useEffect(() => {
    const current = ++generation.current;
    const old = active.current; active.current = null;
    if (old) void window.editorAPI?.cancelAssistant(old.id).catch(() => {});
    history.current = []; setMessages([]); setProposal(null); setBusy(false); setStream(""); setError(""); setStatus(""); setLoaded(false);
    void window.editorAPI?.getAssistantHistory(project.id).then(items => {
      if (generation.current === current) { history.current = items; setMessages(items); setLoaded(true); }
    }).catch(e => { if (generation.current === current) { setError(String(e)); setLoaded(true); } });
    return () => { ++generation.current; const request = active.current; active.current = null; if (request) void window.editorAPI?.cancelAssistant(request.id).catch(() => {}); };
  }, [project.id]);
  const persist = (items: AssistantMessage[], projectId: string) => {
    const limited = items.slice(-40).map(m => ({ ...m, content: m.content.slice(0, 6000) }));
    history.current = limited; setMessages(limited);
    void window.editorAPI?.saveAssistantHistory(projectId, limited).catch(e => setError(`对话保存失败：${String(e)}`));
  };
  useEffect(() => window.editorAPI?.onAssistantEvent(event => {
    const request = active.current;
    if (!request || event.requestId !== request.id) return;
    if (event.type === "status") setStatus(event.message);
    if (event.type === "text") setStream(text => text + event.text);
    if (event.type === "complete") {
      persist([...request.history, { role: "assistant", content: event.response.reply }], request.project.id);
      if (event.response.actions.length) {
        try { setProposal({ preview: previewAssistantEdits(request.project, event.response.actions), base: request.base, applied: false }); }
        catch (e) { setError(`建议未通过检查，项目未修改：${String(e)}`); }
      }
      active.current = null; setBusy(false); setStream(""); setStatus("回复完成");
    }
    if (event.type === "error" || event.type === "cancelled") {
      active.current = null; setBusy(false); setStream(""); setStatus(event.type === "cancelled" ? "已取消" : "");
      if (event.type === "error") setError(event.message);
    }
  }), []);
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: "nearest" }); }, [messages, stream, status]);
  const send = async (value = prompt) => {
    if (!value.trim() || active.current || !window.editorAPI) return;
    const s = useEditorStore.getState();
    const base = JSON.stringify(s.project), captured: Project = JSON.parse(base);
    const items: AssistantMessage[] = [...history.current, { role: "user", content: value.trim() }];
    const request = { id: crypto.randomUUID(), project: captured, base, history: items };
    active.current = request; lastPrompt.current = value; setBusy(true); setError(""); setProposal(null); setStream(""); setStatus("正在连接 CLI…"); setPrompt("");
    const previous = history.current.slice(-20).map(m => ({ ...m, content: m.content.slice(0, 4000) }));
    persist(items, captured.id);
    try { await window.editorAPI.startAssistant({ requestId: request.id, provider, prompt: value.trim(), history: previous, context: assistantProjectContext(captured, s.selectedIds, s.playhead) }); }
    catch (e) { if (active.current?.id === request.id) { active.current = null; setBusy(false); setError(String(e)); setStatus(""); } }
  };
  const currentProvider = providers.find(p => p.id === provider);
  const stale = proposal && JSON.stringify(project) !== proposal.base;
  return <aside className="assistant-panel panel" aria-label={t("assistant.title")}>
    <header><strong><MessageSquare size={16} />{t("assistant.title")}</strong><button aria-label={t("about.close")} onClick={onClose}><X size={16} /></button></header>
    <div className="assistant-config">
      <select aria-label="助手后端" value={provider} disabled={busy} onChange={e => setProvider(e.target.value as AssistantProvider)}><option value="codex">Codex CLI</option><option value="claude">Claude Code</option></select>
      <button aria-label="刷新助手状态" disabled={busy} onClick={() => void refresh()}><RefreshCw size={14} /></button>
      <button disabled={busy || !window.editorAPI} onClick={() => void window.editorAPI!.chooseAssistantCLI(provider).then(setProviders).catch(e => setError(String(e)))}>{t("assistant.chooseCLI")}</button>
    </div>
    <p className="assistant-provider-status">{currentProvider?.available ? `${t("assistant.detected")} ${currentProvider.label} ${currentProvider.version ?? ""}` : currentProvider?.error ?? t("assistant.detecting")}</p>
    <div className="assistant-chat" aria-live="polite">
      {!messages.length && <div className="assistant-welcome"><MessageSquare size={28} /><h3>{t("assistant.welcomeTitle")}</h3><p>{t("assistant.welcomeDesc")}</p><button onClick={() => setPrompt("Add a 3-second opening title: The Adventure Begins")}>{t("assistant.sampleTitle")}</button><button onClick={() => setPrompt("Analyze current timeline and give me 3 editing suggestions")}>{t("assistant.sampleAdvice")}</button></div>}
      {messages.map((message, i) => <div key={i} className={`assistant-message ${message.role}`}><small>{message.role === "user" ? t("assistant.roleUser") : t("assistant.roleAssistant")}</small><p>{message.content}</p></div>)}
      {stream && <div className="assistant-message assistant"><small>{t("assistant.roleAssistant")}</small><p>{stream}</p></div>}
      {status && <p className="assistant-status">{status}</p>}
      {error && <p className="assistant-error" role="alert">{error}</p>}
      {proposal && <div className="assistant-proposal"><strong>{t("assistant.proposalTitle")} · {proposal.preview.descriptions.length}</strong><ol>{proposal.preview.descriptions.map((item, i) => <li key={i}>{item}</li>)}</ol><p>{proposal.preview.before.clips} → {proposal.preview.after.clips} clips · {proposal.preview.after.duration.toFixed(2)} s</p><button className="primary" disabled={proposal.applied || !!stale} onClick={() => {
        if (JSON.stringify(useEditorStore.getState().project) !== proposal.base) { setError(t("assistant.stale")); return; }
        useEditorStore.getState().commit(proposal.preview.project); setProposal({ ...proposal, applied: true });
      }}>{proposal.applied ? t("assistant.applied") : stale ? t("assistant.stale") : `${t("effects.apply")} (${proposal.preview.descriptions.length})`}</button></div>}
      <div ref={chatEnd} />
    </div>
    <div className="assistant-compose"><p>{t("assistant.disclaimer")}</p><textarea aria-label={t("assistant.title")} placeholder={t("assistant.placeholder")} maxLength={8000} value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); if (!busy && loaded && currentProvider?.available) void send(); } }} /><div><button disabled={busy || !messages.length} onClick={() => { persist([], project.id); setProposal(null); setError(""); }}>{t("assistant.clear")}</button>{!busy && lastPrompt.current && <button onClick={() => void send(lastPrompt.current)} disabled={!currentProvider?.available}>Retry</button>}{busy ? <button onClick={() => { const req = active.current; if (req) void window.editorAPI?.cancelAssistant(req.id).catch(e => setError(String(e))); }}><Square size={13} />Cancel</button> : <button className="primary" disabled={!loaded || !prompt.trim() || !currentProvider?.available} onClick={() => void send()}><Send size={13} />{t("assistant.send")}</button>}</div></div>
  </aside>;
}
