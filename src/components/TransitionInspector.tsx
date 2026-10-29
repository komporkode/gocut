import React, { useState } from 'react';
import { Trash2, X, SlidersHorizontal, Check, Sparkles, Clock, Layers } from 'lucide-react';
import { useEditorStore } from '../editor/store';
import { TRANSITION_PRESETS, type TransitionId } from '../core/creativePresets';
import type { TransitionType } from '../core/types';

interface TransitionInspectorProps {
  transitionId: string;
}

export default function TransitionInspector({ transitionId }: TransitionInspectorProps) {
  const project = useEditorStore((s) => s.project);
  const selectTransition = useEditorStore((s) => s.selectTransition);
  const resizeTransitionRecord = useEditorStore((s) => s.resizeTransitionRecord);
  const removeTransitionRecord = useEditorStore((s) => s.removeTransitionRecord);
  const applyTransitionToAllCuts = useEditorStore((s) => s.applyTransitionToAllCuts);

  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [appliedNotification, setAppliedNotification] = useState<string | null>(null);

  const transition = project.transitions?.find((t) => t.id === transitionId);
  if (!transition) return null;

  const fromClip = project.clips.find((c) => c.id === transition.fromClipId);
  const toClip = project.clips.find((c) => c.id === transition.toClipId);
  const maxSafeDuration = fromClip && toClip ? Math.min(fromClip.duration, toClip.duration) : 5.0;

  const categories = ['All', 'Basic', 'Motion', 'Dynamic'];
  const filteredPresets =
    activeCategory === 'All'
      ? TRANSITION_PRESETS
      : TRANSITION_PRESETS.filter((p) => p.category === activeCategory);

  const handleTypeSelect = (typeId: TransitionId) => {
    // Update type directly on the existing transition
    const p = structuredClone(project);
    const target = p.transitions?.find((t: any) => t.id === transitionId);
    if (target) {
      target.type = typeId as TransitionType;
      useEditorStore.getState().commit(p);
    }
  };

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
          <Sparkles size={16} className="text-cyan-400" />
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
          background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.4) 0%, rgba(88, 28, 135, 0.4) 100%)',
          border: '1px solid rgba(96, 165, 250, 0.4)',
          borderRadius: '8px',
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
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid #38bdf8',
            borderRadius: '4px',
            padding: '3px 8px',
            fontSize: '11px',
            fontWeight: 600,
            color: '#38bdf8',
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
            style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
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
                  background: Math.abs(transition.duration - dur) < 0.04 ? '#0284c7' : '#1e293b',
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

        {/* Transition Presets Gallery */}
        <div className="transition-presets-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Layers size={14} />
              Katalog Transisi
            </label>
          </div>

          {/* Category Chips */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  padding: '3px 10px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  background: activeCategory === cat ? '#38bdf8' : 'rgba(255, 255, 255, 0.08)',
                  color: activeCategory === cat ? '#0f172a' : '#94a3b8',
                  border: 'none',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {cat === 'All' ? 'Semua' : cat === 'Basic' ? 'Dasar' : cat === 'Motion' ? 'Gerakan' : 'Dinamis'}
              </button>
            ))}
          </div>

          {/* Preset Cards Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '8px',
            maxHeight: '220px',
            overflowY: 'auto',
            paddingRight: '4px',
          }}>
            {filteredPresets.map((preset) => {
              const isSelected = transition.type === preset.id;
              return (
                <div
                  key={preset.id}
                  onClick={() => handleTypeSelect(preset.id)}
                  style={{
                    background: isSelected ? 'rgba(56, 189, 248, 0.18)' : '#1e293b',
                    border: isSelected ? '1.5px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '6px',
                    padding: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    position: 'relative',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: isSelected ? '#38bdf8' : '#e2e8f0' }}>
                      {preset.name}
                    </span>
                    {isSelected && <Check size={14} color="#38bdf8" />}
                  </div>
                  <span style={{ fontSize: '10px', color: '#94a3b8', lineHeight: '1.2' }}>
                    {preset.category}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Apply to All Footer Button */}
        <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <button
            onClick={handleApplyToAll}
            style={{
              width: '100%',
              padding: '9px 12px',
              background: '#2563eb',
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
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.4)',
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

