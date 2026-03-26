import { useState, useEffect } from 'react';
import RealTimeMonitor from './RealTimeMonitor';

const API = 'https://likelionfocus.duckdns.org';

function formatTime(str) {
  if (!str) return '-';
  return str.replace('T', ' ').slice(11, 16);
}

export default function ManagerDashboard({ onNewNotification }) {
  const [sessions,         setSessions]         = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [monitoringTarget, setMonitoringTarget] = useState(null);

  const fetchSessions = () => {
    fetch(`${API}/api/sessions`)
      .then(r => r.json())
      .then(d => { setSessions(d.sessions ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchSessions();
    const t = setInterval(fetchSessions, 10000); // 10초마다 갱신
    return () => clearInterval(t);
  }, []);

  // ── 모니터링 뷰 ──
  if (monitoringTarget) {
    return (
      <div>
        <div style={{
          background: '#fff', borderBottom: '1px solid #EEE',
          padding: '12px 24px', display: 'flex', alignItems: 'center',
          gap: 14, position: 'sticky', top: 60, zIndex: 90,
        }}>
          <button
            onClick={() => setMonitoringTarget(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8,
              background: '#F5F5F5', border: '1.5px solid #E0E0E0',
              fontSize: 13, fontWeight: 600, color: '#555', cursor: 'pointer',
            }}
          >
            ← 세션 목록으로
          </button>
          <div style={{ width: 1, height: 20, background: '#DDD' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg, #FF6B2B, #FF9A5C)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 800, fontSize: 14,
            }}>
              {monitoringTarget.name[0]}
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1A1A1A' }}>
              {monitoringTarget.name}
            </span>
            <span style={{
              padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
              background: '#FEF2F2', color: '#EF4444', border: '1.5px solid #FECACA',
            }}>
              🔴 라이브 중
            </span>
          </div>
        </div>
        <RealTimeMonitor
          onNewNotification={onNewNotification}
          monitoringTarget={{ sessionId: monitoringTarget.session_id, name: monitoringTarget.name, course: '' }}
        />
      </div>
    );
  }

  // ── 세션 목록 ──
  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1A1A1A' }}>진행 중인 세션</h1>
          <p style={{ fontSize: 13, color: '#888', marginTop: 3 }}>
            강의자가 시작한 세션을 실시간으로 모니터링합니다
          </p>
        </div>
        <button
          onClick={fetchSessions}
          style={{
            padding: '8px 16px', borderRadius: 8,
            border: '1.5px solid #E0E0E0', background: '#fff',
            fontSize: 13, color: '#555', cursor: 'pointer',
          }}
        >
          새로고침
        </button>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        {[
          { label: '전체 세션', value: `${sessions.length}개`, icon: '📋', color: '#3B82F6' },
        ].map(item => (
          <div key={item.label} style={{
            background: '#fff', borderRadius: 14, padding: '18px 22px',
            border: '1.5px solid #EEE', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: '#888' }}>{item.label}</span>
              <span style={{ fontSize: 20 }}>{item.icon}</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: item.color }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Session cards */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#AAA' }}>불러오는 중...</div>
      ) : sessions.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 0',
          background: '#fff', borderRadius: 16, border: '1.5px solid #EEE',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 15, color: '#888' }}>진행 중인 세션이 없습니다</div>
          <div style={{ fontSize: 13, color: '#CCC', marginTop: 6 }}>강의자가 방송을 시작하면 여기에 표시됩니다.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {sessions.map(s => (
            <div key={s.session_id} style={{
              background: '#fff', borderRadius: 16, padding: '20px 22px',
              border: '2px solid #FFD5C0',
              boxShadow: '0 4px 20px rgba(255,107,43,0.1)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: 'linear-gradient(135deg, #FF6B2B, #FF9A5C)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 18, fontWeight: 800,
                  }}>
                    {s.name[0]}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: '#AAA', marginTop: 2 }}>시작: {formatTime(s.created_at)}</div>
                  </div>
                </div>
                <span style={{
                  padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: '#FEF2F2', color: '#EF4444', border: '1.5px solid #FECACA',
                }}>
                  🔴 라이브
                </span>
              </div>

              <button
                onClick={() => setMonitoringTarget(s)}
                style={{
                  width: '100%', padding: '10px',
                  background: 'linear-gradient(135deg, #FF6B2B, #FF8C55)',
                  color: '#fff', border: 'none', borderRadius: 10,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  boxShadow: '0 3px 12px rgba(255,107,43,0.3)',
                }}
              >
                📡 실시간 모니터링 보기
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
