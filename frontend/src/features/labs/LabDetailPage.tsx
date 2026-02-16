import { useParams, NavLink } from 'react-router-dom';
import { getLabById } from './labData';
import { useState, useEffect, useCallback } from 'react';

/* ═══════════════════════════════════════════════════════════════
   Lab Detail Page — Interactive step-by-step worksheet
   ═══════════════════════════════════════════════════════════════ */

const WHERE_BADGES: Record<string, { label: string; icon: string; bg: string; fg: string }> = {
  builder: { label: 'Topology Builder', icon: '🗺️', bg: '#3b82f620', fg: '#3b82f6' },
  cli:     { label: 'CLI Terminal',     icon: '💻', bg: '#22c55e20', fg: '#22c55e' },
  flows:   { label: 'SDN Flows',       icon: '📡', bg: '#f59e0b20', fg: '#f59e0b' },
  browser: { label: 'Browser',         icon: '🌐', bg: '#a78bfa20', fg: '#a78bfa' },
  info:    { label: 'Read & Learn',    icon: '📖', bg: '#64748b20', fg: '#94a3b8' },
};

function saveProgress(labId: string, current: number, total: number) {
  localStorage.setItem(`lab-progress-${labId}`, JSON.stringify({ current, total }));
}

function loadCompletedSteps(labId: string): Set<number> {
  try {
    const raw = localStorage.getItem(`lab-steps-${labId}`);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* ignore */ }
  return new Set();
}

function saveCompletedSteps(labId: string, steps: Set<number>) {
  localStorage.setItem(`lab-steps-${labId}`, JSON.stringify([...steps]));
}

export default function LabDetailPage() {
  const { labId } = useParams<{ labId: string }>();
  const lab = labId ? getLabById(labId) : undefined;

  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // Load saved progress
  useEffect(() => {
    if (!lab) return;
    const saved = loadCompletedSteps(lab.id);
    setCompletedSteps(saved);
    // Jump to first incomplete step
    const firstIncomplete = lab.steps.findIndex((_, i) => !saved.has(i));
    if (firstIncomplete >= 0) setCurrentStep(firstIncomplete);
  }, [lab]);

  // Save progress when completedSteps changes
  useEffect(() => {
    if (!lab) return;
    saveCompletedSteps(lab.id, completedSteps);
    saveProgress(lab.id, completedSteps.size, lab.steps.length);
  }, [completedSteps, lab]);

  const markComplete = useCallback((idx: number) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }, []);

  const copyCommands = useCallback(async (commands: string[], idx: number) => {
    const text = commands.filter((c) => !c.startsWith('#') && c.trim()).join('\n');
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }, []);

  if (!lab) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--color-text-muted)' }}>
        <h2>Lab not found</h2>
        <NavLink to="/labs" style={{ color: 'var(--color-primary)' }}>← Back to Labs</NavLink>
      </div>
    );
  }

  const step = lab.steps[currentStep];
  const pct = lab.steps.length > 0 ? Math.round((completedSteps.size / lab.steps.length) * 100) : 0;
  const allDone = completedSteps.size === lab.steps.length;
  const badge = WHERE_BADGES[step.where] ?? WHERE_BADGES.info;

  return (
    <div style={{ display: 'flex', gap: 20, minHeight: '80vh' }}>

      {/* ── Left: Step Sidebar ── */}
      <div style={{
        width: 260, minWidth: 260, background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
        borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <NavLink to="/labs" style={{ fontSize: 12, color: 'var(--color-text-muted)', textDecoration: 'none', marginBottom: 8 }}>
          ← All Labs
        </NavLink>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>{lab.title}</h3>

        {/* Progress */}
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>
          Progress: {completedSteps.size}/{lab.steps.length} steps ({pct}%)
        </div>
        <div style={{ width: '100%', height: 4, borderRadius: 4, background: 'var(--color-border)', overflow: 'hidden', marginBottom: 12 }}>
          <div style={{
            width: `${pct}%`, height: '100%', borderRadius: 4, transition: 'width 0.3s',
            background: allDone ? '#22c55e' : 'var(--color-primary)',
          }} />
        </div>

        {/* Step list */}
        {lab.steps.map((s, i) => {
          const done = completedSteps.has(i);
          const active = i === currentStep;
          const wb = WHERE_BADGES[s.where] ?? WHERE_BADGES.info;
          return (
            <button key={i} onClick={() => setCurrentStep(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: active ? 'rgba(59,130,246,0.12)' : 'transparent',
                textAlign: 'left', width: '100%', transition: 'all 0.15s',
              }}
            >
              <span style={{
                width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, flexShrink: 0,
                background: done ? '#22c55e' : active ? 'var(--color-primary)' : 'var(--color-border)',
                color: done || active ? '#fff' : 'var(--color-text-muted)',
              }}>
                {done ? '✓' : i + 1}
              </span>
              <div style={{ overflow: 'hidden' }}>
                <div style={{
                  fontSize: 12, fontWeight: active ? 600 : 400, lineHeight: 1.3,
                  color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
                  whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden',
                }}>{s.title}</div>
                <div style={{ fontSize: 9, color: wb.fg }}>{wb.icon} {wb.label}</div>
              </div>
            </button>
          );
        })}

        {/* Reset button */}
        <button onClick={() => { setCompletedSteps(new Set()); setCurrentStep(0); }}
          style={{
            marginTop: 'auto', padding: '8px 12px', borderRadius: 8, fontSize: 11,
            background: 'transparent', border: '1px solid var(--color-border)',
            color: 'var(--color-text-muted)', cursor: 'pointer',
          }}>
          🔄 Reset Progress
        </button>
      </div>

      {/* ── Right: Step Content ── */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Step header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <span style={{
            width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 700, background: badge.bg, color: badge.fg,
          }}>
            {currentStep + 1}
          </span>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{step.title}</h2>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 8,
              background: badge.bg, color: badge.fg, marginTop: 4,
            }}>{badge.icon} {badge.label}</span>
          </div>
        </div>

        {/* Description */}
        <div style={{
          background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12,
          padding: 20, marginBottom: 16, lineHeight: 1.7, fontSize: 14, whiteSpace: 'pre-line',
        }}>
          {step.description}
        </div>

        {/* Topology ASCII (if first/info step and lab has one) */}
        {step.where === 'info' && currentStep === 0 && lab.topology && (
          <div style={{
            background: '#0d1117', border: '1px solid var(--color-border)', borderRadius: 12,
            padding: 16, marginBottom: 16, fontFamily: 'monospace', fontSize: 13,
            color: '#22c55e', whiteSpace: 'pre', overflowX: 'auto',
          }}>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>TARGET TOPOLOGY</div>
            {lab.topology}
          </div>
        )}

        {/* Instructions */}
        <div style={{
          background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12,
          padding: 20, marginBottom: 16,
        }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 12px', color: badge.fg }}>
            📝 Instructions
          </h4>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            {step.instructions.map((inst, i) => (
              <li key={i} style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--color-text)' }}>
                {inst}
              </li>
            ))}
          </ol>
        </div>

        {/* Commands (copyable) */}
        {step.commands && step.commands.length > 0 && (
          <div style={{
            background: '#0d1117', border: '1px solid var(--color-border)', borderRadius: 12,
            padding: 16, marginBottom: 16, position: 'relative',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>COMMANDS</span>
              <button onClick={() => copyCommands(step.commands!, currentStep)}
                style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  background: copiedIdx === currentStep ? '#22c55e20' : '#ffffff10',
                  color: copiedIdx === currentStep ? '#22c55e' : '#94a3b8',
                  border: 'none', cursor: 'pointer',
                }}>
                {copiedIdx === currentStep ? '✓ Copied!' : '📋 Copy commands'}
              </button>
            </div>
            <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6, overflowX: 'auto' }}>
              {step.commands.map((cmd, i) => (
                <div key={i} style={{
                  color: cmd.startsWith('#') ? '#64748b' : cmd.trim() === '' ? 'transparent' : '#e2e8f0',
                }}>
                  {cmd.startsWith('#') ? cmd : cmd.trim() === '' ? ' ' : `$ ${cmd}`}
                </div>
              ))}
            </pre>
          </div>
        )}

        {/* Tip */}
        {step.tip && (
          <div style={{
            background: '#f59e0b10', border: '1px solid #f59e0b30', borderRadius: 12,
            padding: 14, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 16 }}>💡</span>
            <div style={{ fontSize: 13, color: '#f59e0b', lineHeight: 1.6 }}>{step.tip}</div>
          </div>
        )}

        {/* Verify */}
        {step.verify && (
          <div style={{
            background: '#22c55e10', border: '1px solid #22c55e30', borderRadius: 12,
            padding: 14, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 16 }}>✅</span>
            <div style={{ fontSize: 13, color: '#22c55e', lineHeight: 1.6 }}>
              <strong>Verify:</strong> {step.verify}
            </div>
          </div>
        )}

        {/* Navigation + Mark Complete */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--color-border)',
        }}>
          <button onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            style={{
              padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              border: '1px solid var(--color-border)', cursor: 'pointer',
              background: 'var(--color-bg-card)', color: 'var(--color-text)',
              opacity: currentStep === 0 ? 0.3 : 1,
            }}>
            ← Previous
          </button>

          <button onClick={() => markComplete(currentStep)}
            style={{
              padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 700,
              border: 'none', cursor: 'pointer',
              background: completedSteps.has(currentStep) ? '#22c55e' : 'var(--color-primary)',
              color: '#fff',
            }}>
            {completedSteps.has(currentStep) ? '✓ Completed' : 'Mark as Done'}
          </button>

          <button onClick={() => {
            if (!completedSteps.has(currentStep)) markComplete(currentStep);
            setCurrentStep(Math.min(lab.steps.length - 1, currentStep + 1));
          }}
            disabled={currentStep === lab.steps.length - 1}
            style={{
              padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              border: 'none', cursor: 'pointer',
              background: 'var(--color-primary)', color: '#fff',
              opacity: currentStep === lab.steps.length - 1 ? 0.3 : 1,
            }}>
            Next Step →
          </button>
        </div>

        {/* All complete celebration */}
        {allDone && (
          <div style={{
            marginTop: 20, padding: 20, borderRadius: 12, textAlign: 'center',
            background: 'linear-gradient(135deg, #22c55e10, #3b82f610)',
            border: '1px solid #22c55e30',
          }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🎉</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#22c55e' }}>Lab Complete!</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
              You've completed all {lab.steps.length} steps. Great work!
            </div>
            <NavLink to="/labs" style={{
              display: 'inline-block', marginTop: 12, padding: '8px 20px', borderRadius: 10,
              background: 'var(--color-primary)', color: '#fff', textDecoration: 'none',
              fontSize: 13, fontWeight: 600,
            }}>
              Browse More Labs →
            </NavLink>
          </div>
        )}
      </div>
    </div>
  );
}
