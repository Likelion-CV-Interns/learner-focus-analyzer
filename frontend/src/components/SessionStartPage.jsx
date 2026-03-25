import { useState, useEffect } from 'react';

const API = 'http://35.193.134.51:8000';

function formatDate(str) {
  if (!str) return '';
  return str.replace('T', ' ').slice(0, 16);
}

export default function SessionStartPage({ user, onSessionStart }) {
  const [title,    setTitle]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [sessions, setSessions] = useState([]);
  const [error,    setError]    = useState('');

  useEffect(() => {
    fetch(`${API}/api/sessions`)
      .then(r => r.json())
      .then(d => setSessions(d.sessions ?? []))
      .catch(() => {});
  }, []);

  const handleStart = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/sessions`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: title.trim() }),
      });
      if (!res.ok) throw new Error('세션 생성 실패');
      const data = await res.json();
      onSessionStart({ session_id: data.session_id, name: data.name });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      maxWidth: 600, margin: '60px auto', padding: '0 24px',
    }}>
      {/* 새 방송 시작 */}
      <div style={{
        background: '#fff', borderRadius: 20, padding: '32px',
        border: '1.5px solid #FFD5B0',
        boxShadow: '0 4px 24px rgba(255,107,43,0.1)',
        marginBottom: 24,
      }}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1A1A1A' }}>새 방송 시작하기</h2>
          <p style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
            강의 제목을 입력하면 세션이 생성되고 학습자들이 입장할 수 있습니다.
          </p>
        </div>

        {error && (
          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA',
            borderRadius: 8, padding: '10px 14px',
            fontSize: 13, color: '#DC2626', marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleStart}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 8 }}>
            강의 제목
          </label>
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="예: Python 기초 · 3주차"
            style={{
              width: '100%', padding: '12px 14px', fontSize: 14,
              border: '1.5px solid #E0E0E0', borderRadius: 10,
              outline: 'none', marginBottom: 16, boxSizing: 'border-box',
            }}
          />
          <button
            type="submit"
            disabled={!title.trim() || loading}
            style={{
              width: '100%', padding: '13px', borderRadius: 12, border: 'none',
              background: !title.trim() || loading
                ? '#FFD0B8'
                : 'linear-gradient(135deg, #FF6B2B, #FF8C55)',
              color: '#fff', fontSize: 15, fontWeight: 700,
              cursor: !title.trim() || loading ? 'not-allowed' : 'pointer',
              boxShadow: !title.trim() || loading ? 'none' : '0 4px 16px rgba(255,107,43,0.35)',
            }}
          >
            {loading ? '생성 중...' : '🔴 방송 시작하기'}
          </button>
        </form>
      </div>

      {/* 최근 세션 목록 */}
      {sessions.length > 0 && (
        <div style={{
          background: '#fff', borderRadius: 20, padding: '24px 32px',
          border: '1.5px solid #EEE',
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A', marginBottom: 16 }}>
            이전 세션 이어하기
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sessions.slice(0, 5).map(s => (
              <div
                key={s.session_id}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 16px', borderRadius: 12,
                  background: '#FAFAFA', border: '1px solid #EEE',
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A1A' }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: '#AAA', marginTop: 2 }}>{formatDate(s.created_at)}</div>
                </div>
                <button
                  onClick={() => onSessionStart({ session_id: s.session_id, name: s.name })}
                  style={{
                    padding: '7px 14px', borderRadius: 8,
                    border: '1.5px solid #FFD5B0', background: '#FFF5F0',
                    color: '#FF6B2B', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  모니터링 열기
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
