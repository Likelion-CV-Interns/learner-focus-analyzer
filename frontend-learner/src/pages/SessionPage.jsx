import { useState, useEffect } from 'react';

const API = 'https://likelionfocus.duckdns.org';

function formatDate(str) {
  if (!str) return '';
  return str.replace('T', ' ').slice(0, 16);
}

export default function SessionPage({ user, onJoin, onLogout }) {
  const [sessions, setSessions] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  useEffect(() => {
    fetch(`${API}/api/sessions`)
      .then(r => r.json())
      .then(d => { setSessions(d.sessions || []); setLoading(false); })
      .catch(() => { setError('세션 목록을 불러올 수 없습니다.'); setLoading(false); });
  }, []);

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(135deg, #FFF5F0, #FFE8D8)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: '36px',
        width: '100%', maxWidth: 520,
        boxShadow: '0 8px 40px rgba(255,107,43,0.15)',
        border: '1.5px solid #FFD5B0',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#1A1A1A' }}>강의실 선택</div>
            <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>
              안녕하세요, <strong>{user.name}</strong>님
            </div>
          </div>
          <button
            onClick={onLogout}
            style={{
              padding: '6px 12px', borderRadius: 8,
              border: '1.5px solid #DDD', background: '#fff',
              fontSize: 12, color: '#888', cursor: 'pointer',
            }}
          >
            로그아웃
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#AAA' }}>불러오는 중...</div>
        ) : error ? (
          <div style={{
            background: '#FEF2F2', borderRadius: 10, padding: '14px',
            color: '#DC2626', fontSize: 13, textAlign: 'center',
          }}>{error}</div>
        ) : sessions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 14, color: '#888' }}>현재 진행 중인 강의실이 없습니다.</div>
            <div style={{ fontSize: 12, color: '#AAA', marginTop: 6 }}>강의자가 세션을 생성하면 여기에 표시됩니다.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sessions.map(s => (
              <div
                key={s.session_id}
                style={{
                  border: '1.5px solid #FFD5B0', borderRadius: 14,
                  padding: '16px 18px', background: '#FFF8F5',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: '#AAA', marginTop: 3 }}>{formatDate(s.created_at)}</div>
                </div>
                <button
                  onClick={() => onJoin({ session_id: s.session_id, name: s.name })}
                  style={{
                    padding: '9px 18px', borderRadius: 10, border: 'none',
                    background: 'linear-gradient(135deg, #FF6B2B, #FF8C55)',
                    color: '#fff', fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', boxShadow: '0 3px 10px rgba(255,107,43,0.3)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  입장
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => window.location.reload()}
          style={{
            width: '100%', marginTop: 20, padding: '10px',
            borderRadius: 10, border: '1.5px solid #EEE',
            background: '#FAFAFA', color: '#888',
            fontSize: 13, cursor: 'pointer',
          }}
        >
          새로고침
        </button>
      </div>
    </div>
  );
}
