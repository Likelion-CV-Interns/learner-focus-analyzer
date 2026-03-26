import { useState, useEffect } from 'react';

const API = 'https://likelionfocus.duckdns.org';

function formatDate(str) {
  if (!str) return '';
  return str.replace('T', ' ').slice(0, 16);
}

// ── 퀴즈 관리 패널 ─────────────────────────────────────────────────────────────
function QuizManager({ sessionId }) {
  const [quizzes,  setQuizzes]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    question: '', options: ['', '', '', ''], correct_answer: '', order_num: 1,
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const fetchQuizzes = () => {
    setLoading(true);
    fetch(`${API}/api/sessions/${sessionId}/quizzes`)
      .then(r => r.json())
      .then(d => { setQuizzes(d.quizzes ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchQuizzes(); }, [sessionId]);

  const handleOptionChange = (i, val) => {
    const opts = [...form.options];
    opts[i] = val;
    setForm(f => ({ ...f, options: opts }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const filledOptions = form.options.filter(o => o.trim());
    if (filledOptions.length < 2) { setError('선택지를 최소 2개 입력해주세요.'); return; }
    if (!form.correct_answer) { setError('정답을 선택해주세요.'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch(`${API}/api/sessions/${sessionId}/quizzes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question:       form.question.trim(),
          options:        filledOptions,
          correct_answer: form.correct_answer,
          order_num:      quizzes.length + 1,
        }),
      });
      if (!res.ok) throw new Error('퀴즈 생성 실패');
      setForm({ question: '', options: ['', '', '', ''], correct_answer: '', order_num: 1 });
      setShowForm(false);
      fetchQuizzes();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (quizId) => {
    await fetch(`${API}/api/sessions/${sessionId}/quizzes/${quizId}`, { method: 'DELETE' });
    fetchQuizzes();
  };

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>퀴즈 관리</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
            {quizzes.length}/5개 등록됨 · 학습자가 세션 중 풀 수 있는 퀴즈입니다
          </div>
        </div>
        {quizzes.length < 5 && (
          <button
            onClick={() => setShowForm(v => !v)}
            style={{
              padding: '7px 14px', borderRadius: 8, border: 'none', fontSize: 12,
              background: showForm ? '#F5F5F5' : 'linear-gradient(135deg, #FF6B2B, #FF8C55)',
              color: showForm ? '#555' : '#fff', fontWeight: 700, cursor: 'pointer',
            }}
          >
            {showForm ? '취소' : '+ 퀴즈 추가'}
          </button>
        )}
      </div>

      {/* 퀴즈 추가 폼 */}
      {showForm && (
        <div style={{
          background: '#FAFAFA', borderRadius: 12, padding: 16,
          border: '1.5px solid #FFD5B0', marginBottom: 14,
        }}>
          {error && (
            <div style={{ color: '#DC2626', fontSize: 12, marginBottom: 10,
              background: '#FEF2F2', borderRadius: 6, padding: '6px 10px' }}>
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>문제</label>
              <textarea
                value={form.question}
                onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
                required
                placeholder="퀴즈 문제를 입력하세요"
                rows={2}
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 13,
                  border: '1.5px solid #E0E0E0', borderRadius: 8,
                  resize: 'vertical', boxSizing: 'border-box', outline: 'none',
                }}
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>선택지 (최소 2개)</label>
              {form.options.map((opt, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <input
                    type="radio"
                    name="correct"
                    disabled={!opt.trim()}
                    checked={form.correct_answer === opt && opt.trim() !== ''}
                    onChange={() => opt.trim() && setForm(f => ({ ...f, correct_answer: opt }))}
                    title="정답으로 설정"
                  />
                  <input
                    value={opt}
                    onChange={e => handleOptionChange(i, e.target.value)}
                    placeholder={`선택지 ${i + 1}${i < 2 ? ' (필수)' : ' (선택)'}`}
                    style={{
                      flex: 1, padding: '6px 10px', fontSize: 12,
                      border: '1.5px solid #E0E0E0', borderRadius: 6, outline: 'none',
                    }}
                  />
                </div>
              ))}
              <div style={{ fontSize: 11, color: '#AAA', marginTop: 2 }}>라디오 버튼을 클릭해 정답을 선택하세요</div>
            </div>
            <button
              type="submit"
              disabled={saving || !form.question.trim() || !form.correct_answer}
              style={{
                width: '100%', padding: '9px', borderRadius: 8, border: 'none',
                background: saving || !form.question.trim() || !form.correct_answer
                  ? '#FFD0B8' : 'linear-gradient(135deg, #FF6B2B, #FF8C55)',
                color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? '저장 중...' : '퀴즈 저장'}
            </button>
          </form>
        </div>
      )}

      {/* 등록된 퀴즈 목록 */}
      {loading ? (
        <div style={{ fontSize: 12, color: '#AAA', textAlign: 'center', padding: '12px 0' }}>불러오는 중...</div>
      ) : quizzes.length === 0 ? (
        <div style={{
          fontSize: 12, color: '#CCC', textAlign: 'center',
          padding: '16px 0', border: '1.5px dashed #EEE', borderRadius: 10,
        }}>
          등록된 퀴즈가 없습니다
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {quizzes.map((q, i) => (
            <div key={q.quiz_id} style={{
              background: '#fff', borderRadius: 10, padding: '12px 14px',
              border: '1px solid #EEE', display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                background: '#FF6B2B', color: '#fff',
                fontSize: 11, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, marginTop: 1,
              }}>
                {i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A', marginBottom: 4 }}>{q.question}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {(q.options ?? []).map((opt, j) => (
                    <span key={j} style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 20,
                      background: opt === q.correct_answer ? '#FFF0EB' : '#F5F5F5',
                      color: opt === q.correct_answer ? '#FF6B2B' : '#888',
                      border: opt === q.correct_answer ? '1px solid #FFD5B0' : '1px solid #EEE',
                      fontWeight: opt === q.correct_answer ? 700 : 400,
                    }}>
                      {opt === q.correct_answer ? '✓ ' : ''}{opt}
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => handleDelete(q.quiz_id)}
                style={{
                  background: 'none', border: 'none', color: '#CCC',
                  fontSize: 16, cursor: 'pointer', padding: '0 4px', flexShrink: 0,
                }}
              >×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────
export default function SessionStartPage({ user, onSessionStart }) {
  const [title,    setTitle]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [sessions, setSessions] = useState([]);
  const [error,    setError]    = useState('');
  const [quizSessionId, setQuizSessionId] = useState(null);

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
      setSessions(prev => [data, ...prev]);
      setTitle('');
      setQuizSessionId(data.session_id);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: '40px auto', padding: '0 24px' }}>
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

        {/* 생성 직후 퀴즈 관리 */}
        {quizSessionId && (
          <div style={{ borderTop: '1px solid #F0F0F0', marginTop: 24, paddingTop: 8 }}>
            <QuizManager sessionId={quizSessionId} />
            <button
              onClick={() => {
                const s = sessions.find(x => x.session_id === quizSessionId);
                if (s) onSessionStart({ session_id: s.session_id, name: s.name });
              }}
              style={{
                width: '100%', marginTop: 20, padding: '13px', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, #22C55E, #16A34A)',
                color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(34,197,94,0.3)',
              }}
            >
              🟢 모니터링 시작하기
            </button>
          </div>
        )}
      </div>

      {/* 이전 세션 목록 */}
      {sessions.filter(s => s.session_id !== quizSessionId).length > 0 && (
        <div style={{
          background: '#fff', borderRadius: 20, padding: '24px 32px',
          border: '1.5px solid #EEE',
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A', marginBottom: 16 }}>
            이전 세션 이어하기
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sessions.filter(s => s.session_id !== quizSessionId).slice(0, 5).map(s => (
              <div key={s.session_id}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 16px', borderRadius: 12,
                  background: '#FAFAFA', border: '1px solid #EEE',
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A1A' }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: '#AAA', marginTop: 2 }}>{formatDate(s.created_at)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setQuizSessionId(quizSessionId === s.session_id ? null : s.session_id)}
                      style={{
                        padding: '7px 12px', borderRadius: 8,
                        border: '1.5px solid #E0E0E0', background: '#F5F5F5',
                        color: '#555', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      퀴즈 관리
                    </button>
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
                </div>
                {quizSessionId === s.session_id && (
                  <div style={{
                    background: '#FAFAFA', borderRadius: '0 0 12px 12px',
                    padding: '16px 16px 20px', border: '1px solid #EEE', borderTop: 'none',
                  }}>
                    <QuizManager sessionId={s.session_id} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
