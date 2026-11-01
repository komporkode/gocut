import React, { useState } from 'react';
import { Trash2, X, SlidersHorizontal, Sparkles, Clock } from 'lucide-react';
import { useEditorStore } from '../editor/store';
import { TRANSITION_PRESETS } from '../core/creativePresets';

interface TransitionInspectorProps {
  transitionId: string;
}

export default function TransitionInspector({ transitionId }: TransitionInspectorProps) {
  const project = useEditorStore((s) => s.project);
  const selectTransition = useEditorStore((s) => s.selectTransition);
  const resizeTransitionRecord = useEditorStore((s) => s.resizeTransitionRecord);
  const removeTransitionRecord = useEditorStore((s) => s.removeTransitionRecord);
  const applyTransitionToAllCuts = useEditorStore((s) => s.applyTransitionToAllCuts);

  const [appliedNotification, setAppliedNotification] = useState<string | null>(null);

  const transition = project.transitions?.find((t) => t.id === transitionId);
  if (!transition) return null;

  const fromClip = project.clips.find((c) => c.id === transition.fromClipId);
  const toClip = project.clips.find((c) => c.id === transition.toClipId);
  const maxSafeDuration = fromClip && toClip ? Math.min(fromClip.duration, toClip.duration) : 5.0;

  const handleApplyToAll = () => {
    applyTransitionToAllCuts(transition.type, transition.duration, transition.trackId);
    setAppliedNotification('Diterapkan ke semua sambungan!');
    setTimeout(() => setAppliedNotification(null), 2500);
  };

  const currentPreset = TRANSITION_PRESETS.find((p) => p.id === transition.type);

  return (
    <aside className="inspector panel tl-transition-inspector">
      <div className="panel-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={16} style={{ color: "var(--accent-light, #9d7dfd)" }} />
          <span style={{ fontWeight: 600 }}>Properti Transisi</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            title="Hapus Transisi (Backspace/Del)"
            className="panel-icon-btn danger"
            onClick={() => {
              removeTransitionRecord(transition.id);
              selectTransition(null);
            }}
          >
            <Trash2 size={15} />
          </button>
          <button
            title="Tutup Panel"
            className="panel-icon-btn"
            onClick={() => selectTransition(null)}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="inspector-content" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* Selected Transition Overview */}
        <div className="transition-active-card" style={{
          background: '#161920',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '6px',
          padding: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
              {currentPreset?.name ?? transition.type}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
              {currentPreset?.description ?? 'Efek perpindahan visual antar klip'}
            </div>
          </div>
          <div style={{
            background: 'var(--accent-soft, rgba(99, 59, 251, 0.15))',
            border: '1px solid var(--accent-border, rgba(99, 59, 251, 0.45))',
            borderRadius: '4px',
            padding: '3px 8px',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--accent-light, #9d7dfd)',
          }}>
            {transition.duration.toFixed(2)}s
          </div>
        </div>

        {/* Duration Slider and Numerical Input */}
        <div className="transition-duration-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={14} />
              Durasi Transisi
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input
                type="number"
                min="0.1"
                max={maxSafeDuration}
                step="0.05"
                value={Number(transition.duration.toFixed(2))}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (Number.isFinite(val) && val >= 0.1 && val <= maxSafeDuration) {
                    resizeTransitionRecord(transition.id, val);
                  }
                }}
                style={{
                  width: '64px',
                  background: '#1e293b',
                  border: '1px solid #475569',
                  borderRadius: '4px',
                  color: '#fff',
                  padding: '2px 6px',
                  fontSize: '12px',
                  textAlign: 'right',
                }}
              />
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>detik</span>
            </div>
          </div>

          <input
            type="range"
            min="0.1"
            max={maxSafeDuration}
            step="0.05"
            value={transition.duration}
            onChange={(e) => resizeTransitionRecord(transition.id, parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#633bfb', cursor: 'pointer' }}
          />

          {/* Quick preset buttons */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
            {[0.3, 0.5, 0.8, 1.0, 1.5].filter((d) => d <= maxSafeDuration).map((dur) => (
              <button
                key={dur}
                onClick={() => resizeTransitionRecord(transition.id, dur)}
                style={{
                  flex: 1,
                  padding: '4px 0',
                  fontSize: '11px',
                  background: Math.abs(transition.duration - dur) < 0.04 ? '#633bfb' : '#1e2530',
                  color: Math.abs(transition.duration - dur) < 0.04 ? '#ffffff' : '#94a3b8',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 500,
                  transition: 'all 0.15s ease',
                }}
              >
                {dur}s
              </button>
            ))}
          </div>
        </div>

        {/* Apply to All Footer Button */}
        <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <button
            onClick={handleApplyToAll}
            style={{
              width: '100%',
              padding: '9px 12px',
              background: '#633bfb',
              border: 'none',
              borderRadius: '6px',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'background 0.15s',
            }}
          >
            <SlidersHorizontal size={14} />
            Terapkan ke Semua Sambungan
          </button>
          {appliedNotification && (
            <div style={{
              marginTop: '6px',
              textAlign: 'center',
              fontSize: '11px',
              color: '#34d399',
              fontWeight: 600,
            }}>
              {appliedNotification}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

