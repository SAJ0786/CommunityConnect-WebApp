import React, { useEffect, useState } from 'react';

// Global toast system — call window.showToast('message', 'success'|'error'|'info'|'warning')
let _setToasts = null;

export function showToast(message, type = 'success') {
  if (_setToasts) {
    const id = Date.now();
    _setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      _setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  }
}

// Expose globally for easy use anywhere
if (typeof window !== 'undefined') {
  window.showToast = showToast;
}

const COLORS = {
  success: { bg: 'var(--cc-success-soft)', border: 'var(--cc-accent-border)', color: 'var(--cc-success)', icon: '✓' },
  error:   { bg: 'var(--cc-danger-soft)', border: 'var(--cc-danger-border)', color: 'var(--cc-danger)', icon: '✕' },
  warning: { bg: 'var(--cc-warning-soft)', border: 'var(--cc-warning-border)', color: 'var(--cc-warning-strong)', icon: '⚠' },
  info:    { bg: 'var(--cc-primary-soft)', border: 'var(--cc-primary-border)', color: 'var(--cc-primary-strong)', icon: 'ℹ' },
};

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);
  _setToasts = setToasts;

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8,
      width: 'calc(100% - 32px)', maxWidth: 400,
      pointerEvents: 'none'
    }}>
      {toasts.map(t => {
        const c = COLORS[t.type] || COLORS.info;
        return (
          <div key={t.id} style={{
            background: c.bg, border: `1px solid ${c.border}`,
            borderRadius: 14, padding: '13px 16px',
            display: 'flex', alignItems: 'flex-start', gap: 10,
            boxShadow: '0 8px 24px color-mix(in srgb, var(--cc-shadow-base) 12%, transparent)',
            animation: 'slideUp .2s ease',
            pointerEvents: 'auto'
          }}>
            <span style={{ fontWeight: 900, color: c.color, fontSize: '1rem', flexShrink: 0 }}>
              {c.icon}
            </span>
            <span style={{ color: c.color, fontSize: '0.875rem', lineHeight: 1.5, fontWeight: 600 }}>
              {t.message}
            </span>
          </div>
        );
      })}
      <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }`}</style>
    </div>
  );
}
