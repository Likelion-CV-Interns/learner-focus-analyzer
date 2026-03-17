import { useEffect, useRef } from 'react';

const NOTIF_ICONS = {
  individual: '👤',
  class: '👥',
  boredom: '😴',
  info: 'ℹ️',
};

const NOTIF_COLORS = {
  individual: { bg: '#FEF2F2', border: '#FECACA', text: '#DC2626' },
  class: { bg: '#FFFBEB', border: '#FDE68A', text: '#D97706' },
  boredom: { bg: '#F5F3FF', border: '#DDD6FE', text: '#7C3AED' },
  info: { bg: '#EFF6FF', border: '#BFDBFE', text: '#2563EB' },
};

// Toast notification that auto-dismisses
export function NotificationToast({ notif, onClose }) {
  const style = NOTIF_COLORS[notif.type] || NOTIF_COLORS.info;

  useEffect(() => {
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '14px 16px',
      background: style.bg,
      border: `1.5px solid ${style.border}`,
      borderRadius: 12,
      animation: 'slideIn 0.35s ease',
      boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
      minWidth: 300,
      maxWidth: 360,
    }}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>{NOTIF_ICONS[notif.type]}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: style.text, marginBottom: 2 }}>
          {notif.title}
        </div>
        <div style={{ fontSize: 12, color: '#555', lineHeight: 1.45 }}>
          {notif.message}
        </div>
        <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
          {notif.time}
        </div>
      </div>
      <button
        onClick={onClose}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: 16, padding: 0, flexShrink: 0 }}
      >
        ×
      </button>
    </div>
  );
}

// Notification panel (dropdown)
export function NotificationPanel({ notifications, onClose, onClear }) {
  const ref = useRef(null);

  useEffect(() => {
    const handle = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        top: 52,
        right: 0,
        width: 360,
        background: '#fff',
        borderRadius: 14,
        boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
        border: '1px solid #EEE',
        zIndex: 200,
        animation: 'fadeIn 0.2s ease',
        overflow: 'hidden',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 16px',
        borderBottom: '1px solid #EEE',
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#1A1A1A' }}>
          알림 {notifications.length > 0 && <span style={{ color: '#FF6B2B' }}>({notifications.length})</span>}
        </span>
        {notifications.length > 0 && (
          <button
            onClick={onClear}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#888' }}
          >
            전체 삭제
          </button>
        )}
      </div>

      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        {notifications.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: '#999', fontSize: 13 }}>
            알림이 없습니다
          </div>
        ) : (
          notifications.map(n => {
            const style = NOTIF_COLORS[n.type] || NOTIF_COLORS.info;
            return (
              <div key={n.id} style={{
                padding: '12px 16px',
                borderBottom: '1px solid #F5F5F5',
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
              }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{NOTIF_ICONS[n.type]}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: style.text }}>{n.title}</div>
                  <div style={{ fontSize: 12, color: '#555', marginTop: 2, lineHeight: 1.4 }}>{n.message}</div>
                  <div style={{ fontSize: 11, color: '#AAA', marginTop: 3 }}>{n.time}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
