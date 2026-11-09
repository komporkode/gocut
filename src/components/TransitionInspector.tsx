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

      <div className="inspector-content" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Selected Transition Overview */}
        <div className="transition-active-card" style={{
          background: '#18181b',
          border: '1px solid #27272a',
          borderRadius: '6px',
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#f4f4f5' }}>
              {currentPreset?.name ?? transition.type}
            </div>
            <div style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '2px' }}>
              {currentPreset?.description ?? 'Efek perpindahan visual antar klip'}
            </div>
          </div>
          <div style={{
            background: 'rgba(99, 59, 251, 0.15)',
            border: '1px solid rgba(99, 59, 251, 0.4)',
            borderRadius: '4px',
            padding: '2px 8px',
            fontSize: '11px',
            fontWeight: 600,
            color: '#a78bfa',
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          }}>
            {transition.duration.toFixed(2)}s
          </div>
        </div>

        {/* Duration Slider and Numerical Input */}
        <div className="transition-duration-section">
          <div className="section-title" style={{ marginBottom: '8px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={13} />
              Durasi Transisi
            </h3>
            <div className="numeric-field" style={{ width: '64px', minWidth: '64px' }}>
              <input
                aria-label="Durasi Transisi"
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
              />
              <span className="numeric-suffix">s</span>
            </div>
          </div>

          <input
            className="property-range"
            aria-label="Durasi Slider"
            type="range"
            min="0.1"
            max={maxSafeDuration}
            step="0.05"
            value={transition.duration}
            onChange={(e) => resizeTransitionRecord(transition.id, parseFloat(e.target.value))}
            style={{ width: '100%', marginBottom: '10px' }}
          />

          {/* Quick preset buttons */}
          <div className="speed-presets" style={{ marginTop: '8px' }}>
            {[0.3, 0.5, 0.8, 1.0, 1.5].filter((d) => d <= maxSafeDuration).map((dur) => (
              <button
                key={dur}
                type="button"
                className={`speed-preset-btn ${Math.abs(transition.duration - dur) < 0.04 ? 'is-active' : ''}`}
                onClick={() => resizeTransitionRecord(transition.id, dur)}
              >
                {dur}s
              </button>
            ))}
          </div>
        </div>

        {/* Apply to All Footer Button */}
        <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid #27272a' }}>
          <button
            type="button"
            onClick={handleApplyToAll}
            className="inspector-effects-link-btn"
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

