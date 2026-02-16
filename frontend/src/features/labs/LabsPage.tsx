import { NavLink } from 'react-router-dom';
import { labs } from './labData';
import { useState, useEffect } from 'react';

/* ═══════════════════════════════════════════════════════════════
   Labs Page — List of step-by-step lab exercises
   ═══════════════════════════════════════════════════════════════ */

const DIFF_COLORS: Record<string, { bg: string; fg: string }> = {
  beginner: { bg: '#22c55e20', fg: '#22c55e' },
  intermediate: { bg: '#f59e0b20', fg: '#f59e0b' },
  advanced: { bg: '#ef444420', fg: '#ef4444' },
};

const WHERE_ICONS: Record<string, string> = {
  builder: '🗺️',
  cli: '💻',
  flows: '📡',
  browser: '🌐',
  info: '📖',
};

function getLabProgress(labId: string): { current: number; total: number } {
  try {
    const raw = localStorage.getItem(`lab-progress-${labId}`);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { current: 0, total: 0 };
}

export default function LabsPage() {
  const [filter, setFilter] = useState<string>('all');
  const [progress, setProgress] = useState<Record<string, { current: number; total: number }>>({});

  useEffect(() => {
    const p: Record<string, { current: number; total: number }> = {};
    labs.forEach((l) => { p[l.id] = getLabProgress(l.id); });
    setProgress(p);
  }, []);

  const filtered = filter === 'all' ? labs : labs.filter((l) => l.difficulty === filter);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 6px' }}>🧪 Lab Exercises</h2>
        <p style={{ color: 'var(--color-text-muted)', margin: 0, fontSize: 14 }}>
          Step-by-step worksheets — learn by doing, one command at a time
        </p>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['all', 'beginner', 'intermediate', 'advanced'].map((d) => (
          <button key={d} onClick={() => setFilter(d)}
            style={{
              padding: '6px 14px', borderRadius: 10, border: '1px solid var(--color-border)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
              background: filter === d ? 'var(--color-primary)' : 'var(--color-bg-card)',
              color: filter === d ? '#fff' : 'var(--color-text-muted)',
              transition: 'all 0.15s',
            }}>
            {d === 'all' ? 'All Labs' : d}
          </button>
        ))}
      </div>

      {/* Lab Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340, 1fr))', gap: 16 }}>
        {filtered.map((lab) => {
          const diff = DIFF_COLORS[lab.difficulty] ?? DIFF_COLORS.beginner;
          const prog = progress[lab.id];
          const pct = prog && prog.total > 0 ? Math.round((prog.current / prog.total) * 100) : 0;
          const isComplete = pct === 100;

          return (
            <NavLink key={lab.id} to={`/labs/${lab.id}`}
              style={{
                textDecoration: 'none', color: 'inherit',
                background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
                borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 12,
                transition: 'all 0.2s', position: 'relative', overflow: 'hidden',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              {/* Status badge */}
              {isComplete && (
                <span style={{
                  position: 'absolute', top: 12, right: 12,
                  background: '#22c55e20', color: '#22c55e',
                  padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 700,
                }}>✓ DONE</span>
              )}

              {/* Icon + Title */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: diff.bg, fontSize: 22,
                }}>{lab.icon}</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{lab.title}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 6, background: diff.bg, color: diff.fg, textTransform: 'capitalize' }}>
                      {lab.difficulty}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>⏱ {lab.duration}</span>
                    <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{lab.steps.length} steps</span>
                  </div>
                </div>
              </div>

              {/* Description */}
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.5 }}>
                {lab.description}
              </p>

              {/* Tags */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {lab.tags.map((t) => (
                  <span key={t} style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 8,
                    background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                    color: 'var(--color-text-muted)',
                  }}>{t}</span>
                ))}
              </div>

              {/* Step types preview */}
              <div style={{ display: 'flex', gap: 4 }}>
                {lab.steps.map((s, i) => (
                  <span key={i} title={`${s.title} (${s.where})`}
                    style={{ fontSize: 12 }}>{WHERE_ICONS[s.where] ?? '📄'}</span>
                ))}
              </div>

              {/* Progress bar */}
              {prog && prog.total > 0 && (
                <div style={{ width: '100%', height: 4, borderRadius: 4, background: 'var(--color-border)', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: isComplete ? '#22c55e' : 'var(--color-primary)', borderRadius: 4, transition: 'width 0.3s' }} />
                </div>
              )}
            </NavLink>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>
          No labs match this filter.
        </div>
      )}
    </div>
  );
}
