import { useState, useEffect } from 'react';

const API = 'https://likelionfocus.duckdns.org';

function formatDate(str) {
  if (!str) return '';
  return str.replace('T', ' ').slice(0, 16);
}

export default function SessionPage({ user, onJoin, onLogout }) {
  // Step 1: instructor list
  const [instructors, setInstructors] = useState([]);
  const [instrLoading, setInstrLoading] = useState(true);
  const [instrError, setInstrError] = useState('');

  // Step 2: sessions for selected instructor
  const [selectedInstructor, setSelectedInstructor] = useState(null); // { instructor_id, name }
  const [sessions, setSessions] = useState([]);
  const [sessLoading, setSessLoading] = useState(false);
  const [sessError, setSessError] = useState('');

  // Load instructor list on mount
  useEffect(() => {
    fetch(`${API}/api/instructors`)
      .then(r => r.json())
      .then(d => { setInstructors(d.instructors || []); setInstrLoading(false); })
      .catch(() => { setInstrError('강의자 목록을 불러올 수 없습니다.'); setInstrLoading(false); });
  }, []);

  // Load sessions when instructor selected
  function selectInstructor(instr) {
    setSelectedInstructor(instr);
    setSessions([]);
    setSessLoading(true);
    setSessError('');
    fetch(`${API}/api/sessions?instructor_id=${instr.instructor_id}`)
      .then(r => r.json())
      .then(d => { setSessions(d.sessions || []); setSessLoading(false); })
      .catch(() => { setSessError('강의실 목록을 불러올 수 없습니다.'); setSessLoading(false); });
  }

  const cardStyle = {
    background: '#fff', borderRadius: 20, padding: '36px',
    width: '100%', maxWidth: 520,
    boxShadow: '0 8px 40px rgba(255,107,43,0.15)',
    border: '1.5px solid #FFD5B0',
  };

  const pageStyle = {
    minHeight: '100vh', background: 'linear-gradient(135deg, #FFF5F0, #FFE8D8)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: 24,
  };

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            {selectedInstructor ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => setSelectedInstructor(null)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#FF6B2B', fontSize: 18, padding: 0, lineHeight: 1,
                    }}
                  >
                    ←
                  </button>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#1A1A1A' }}>강의실 선택</div>
                </div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>
                  <span style={{ color: '#FF6B2B', fontWeight: 700 }}>{selectedInstructor.name}</span> 강의자의 강의실
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#1A1A1A' }}>강의자 선택</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>
                  안녕하세요, <strong>{user.name}</strong>님
                </div>
              </>
            )}
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

        {/* ── Step 1: 강의자 목록 ── */}
        {!selectedInstructor && (
          instrLoading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#AAA' }}>불러오는 중...</div>
          ) : instrError ? (
            <div style={{
              background: '#FEF2F2', borderRadius: 10, padding: '14px',
              color: '#DC2626', fontSize: 13, textAlign: 'center',
            }}>{instrError}</div>
          ) : instructors.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>👨‍🏫</div>
              <div style={{ fontSize: 14, color: '#888' }}>등록된 강의자가 없습니다.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {instructors.map(instr => (
                <button
                  key={instr.instructor_id}
                  onClick={() => selectInstructor(instr)}
                  style={{
                    border: '1.5px solid #FFD5B0', borderRadius: 14,
                    padding: '16px 20px', background: '#FFF8F5',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    cursor: 'pointer', textAlign: 'left', width: '100%',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#FFF0E8'}
                  onMouseLeave={e => e.currentTarget.style.background = '#FFF8F5'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%',
                      background: 'linear-gradient(135deg, #FF6B2B, #FF9A5C)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 16, fontWeight: 700, flexShrink: 0,
                    }}>
                      {instr.name[0]}
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>{instr.name}</div>
                      <div style={{ fontSize: 11, color: '#AAA', marginTop: 1 }}>{instr.username}</div>
                    </div>
                  </div>
                  <span style={{ color: '#FF6B2B', fontSize: 18 }}>›</span>
                </button>
              ))}
            </div>
          )
        )}

        {/* ── Step 2: 강의실 목록 ── */}
        {selectedInstructor && (
          sessLoading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#AAA' }}>불러오는 중...</div>
          ) : sessError ? (
            <div style={{
              background: '#FEF2F2', borderRadius: 10, padding: '14px',
              color: '#DC2626', fontSize: 13, textAlign: 'center',
            }}>{sessError}</div>
          ) : sessions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
              <div style={{ fontSize: 14, color: '#888' }}>현재 진행 중인 강의실이 없습니다.</div>
              <div style={{ fontSize: 12, color: '#AAA', marginTop: 6 }}>강의자가 세션을 생성하면 여기에 표시됩니다.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sessions.map(s => {
                const isEnded = !!s.ended_at;
                return (
                  <div
                    key={s.session_id}
                    style={{
                      border: `1.5px solid ${isEnded ? '#E0E0E0' : '#FFD5B0'}`,
                      borderRadius: 14,
                      padding: '16px 18px',
                      background: isEnded ? '#F5F5F5' : '#FFF8F5',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      opacity: isEnded ? 0.8 : 1,
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: isEnded ? '#999' : '#1A1A1A' }}>{s.name}</div>
                        {isEnded && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                            background: '#E8E8E8', color: '#888', border: '1px solid #DDD',
                          }}>방송 종료</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: '#AAA', marginTop: 3 }}>{formatDate(s.created_at)}</div>
                    </div>
                    {isEnded ? (
                      <span style={{
                        padding: '9px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                        color: '#AAA', background: '#EBEBEB', whiteSpace: 'nowrap',
                      }}>
                        종료됨
                      </span>
                    ) : (
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
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}

        <button
          onClick={() => {
            if (selectedInstructor) {
              selectInstructor(selectedInstructor); // 세션 목록 새로고침
            } else {
              window.location.reload();
            }
          }}
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
