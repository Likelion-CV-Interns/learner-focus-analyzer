import { useEffect, useRef, useState, useCallback } from 'react';
import { initDetector, detect, isDetectorReady } from '../utils/detector.js';
import { FocusScorer }  from '../utils/scorer.js';
import { ColabSender }  from '../utils/colabSender.js';

const WS_SERVER    = 'wss://likelionfocus.duckdns.org';
const COLAB_URL    = 'https://waylon-unfancy-overidly.ngrok-free.dev';           // 비어있으면 Colab 비활성화
const WS_INTERVAL  = 100;         // ms (10fps)
const PROC_INTERVAL = 33;         // ms (~30fps)

const STATUS_CFG = {
  focused:    { label: '집중',      color: '#22C55E', bg: '#F0FDF4' },
  focusing:   { label: '집중 시작', color: '#84CC16', bg: '#F7FEE7' },
  distracted: { label: '딴짓',      color: '#F59E0B', bg: '#FFFBEB' },
  drowsy:     { label: '졸음',      color: '#EF4444', bg: '#FEF2F2' },
  uncertain:  { label: '감지 중',   color: '#94A3B8', bg: '#F8FAFC' },
};

const EMOTION_KR = {
  engagement: '집중', boredom: '지루함', confusion: '혼란',
  amused: '웃음', surprise: '놀람', neutral: '중립',
};

export default function MonitorPage({ user, session, onLeave }) {
  const videoRef    = useRef(null);
  const wsRef       = useRef(null);
  const scorerRef   = useRef(new FocusScorer());
  const colabRef    = useRef(null);
  const latestRef   = useRef({});
  const procTimerRef = useRef(null);
  const wsTimerRef   = useRef(null);
  const streamRef   = useRef(null);

  const [camReady,   setCamReady]   = useState(false);
  const [camOn,      setCamOn]      = useState(true);
  const [mpReady,    setMpReady]    = useState(false);
  const [wsStatus,   setWsStatus]   = useState('disconnected');
  const [display,    setDisplay]    = useState({
    status: 'uncertain', focusScore: 0, fatigueScore: 0,
    avgEar: 0, emotion: null, phoneDetected: false,
  });

  // ── 퀴즈 상태 ──────────────────────────────────────────────────────────────
  const [quizzes,     setQuizzes]     = useState([]);
  const [submissions, setSubmissions] = useState({});   // quiz_id → {is_correct, submitted_answer}
  const [activeQuiz,  setActiveQuiz]  = useState(null); // 현재 펼쳐진 quiz_id
  const [quizAnswer,  setQuizAnswer]  = useState('');
  const [quizResult,  setQuizResult]  = useState(null); // {is_correct, correct_answer}
  const [submitting,  setSubmitting]  = useState(false);

  useEffect(() => {
    if (!session?.session_id) return;
    fetch(`${WS_SERVER.replace('wss', 'https').replace('ws', 'https')}/api/sessions/${session.session_id}/quizzes`)
      .then(r => r.json())
      .then(d => setQuizzes(d.quizzes ?? []))
      .catch(() => {});
    fetch(`${WS_SERVER.replace('wss', 'https').replace('ws', 'https')}/api/sessions/${session.session_id}/users/${user.user_id}/quiz-completion`)
      .then(r => r.json())
      .then(d => setSubmissions(d.submissions ?? {}))
      .catch(() => {});
  }, [session?.session_id, user?.user_id]);

  const handleOpenQuiz = (quizId) => {
    if (activeQuiz === quizId) { setActiveQuiz(null); setQuizResult(null); setQuizAnswer(''); return; }
    setActiveQuiz(quizId);
    setQuizAnswer('');
    setQuizResult(null);
  };

  const handleSubmitQuiz = async (quiz) => {
    if (!quizAnswer || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `${WS_SERVER.replace('wss', 'https').replace('ws', 'https')}/api/sessions/${session.session_id}/quizzes/${quiz.quiz_id}/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.user_id, answer: quizAnswer }),
        }
      );
      const data = await res.json();
      setQuizResult(data);
      setSubmissions(prev => ({ ...prev, [quiz.quiz_id]: { is_correct: data.is_correct, submitted_answer: quizAnswer } }));
    } catch {} finally {
      setSubmitting(false);
    }
  };

  const correctCount = Object.values(submissions).filter(s => s.is_correct).length;
  const completionRate = quizzes.length ? Math.round(correctCount / quizzes.length * 100) : 0;

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamReady(false);
    setCamOn(false);
  }, []);

  const startCamera = useCallback(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play();
            setCamReady(true);
            setCamOn(true);
          };
        }
      })
      .catch(err => console.error('[Camera]', err));
  }, []);

  // ── 1. 카메라 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ── 2. MediaPipe 초기화 ────────────────────────────────────────────────────
  useEffect(() => {
    initDetector().then(() => setMpReady(true)).catch(console.error);
  }, []);

  // ── 3. Colab sender ────────────────────────────────────────────────────────
  useEffect(() => {
    if (COLAB_URL) {
      colabRef.current = new ColabSender(COLAB_URL, 1.0);
    }
  }, []);

  // ── 4. WebSocket 연결 ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!camReady) return;

    function connect() {
      const url = `${WS_SERVER}/ws/client/${session.session_id}/${user.user_id}`;
      const ws  = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen    = () => setWsStatus('connected');
      ws.onclose   = (e) => {
        setWsStatus(e.code === 4403 || e.code === 4404 ? 'error' : 'disconnected');
        if (e.code !== 4403 && e.code !== 4404) setTimeout(connect, 3000);
      };
      ws.onerror   = () => ws.close();
    }

    connect();
    return () => wsRef.current?.close();
  }, [camReady, session.session_id, user.user_id]);

  // ── 5. 감지 루프 ──────────────────────────────────────────────────────────
  const runDetection = useCallback(() => {
    const video = videoRef.current;
    if (!video || !mpReady || !isDetectorReady()) return;

    const result = detect(video, performance.now());
    if (!result) return;

    const { ear, gaze, head, emotion: localEmotion } = result;
    const scored = scorerRef.current.update(gaze, ear, head);

    // Colab 전송 (phone detection + 표정 분석)
    if (colabRef.current) colabRef.current.push(video);
    const colabResult   = colabRef.current?.result ?? {};
    const phoneDetected = colabResult.phone_detected ?? false;
    const phoneConf     = colabResult.phone_confidence ?? 0;
    // Colab RF 모델 표정 우선, 연결 전이면 로컬 MediaPipe fallback
    const emotion = colabResult.emotion ?? localEmotion;

    const payload = {
      ...scored,
      emotion,
      phone_detected:   phoneDetected,
      phone_confidence: phoneConf,
    };

    latestRef.current = payload;

    setDisplay({
      status:        payload.status,
      focusScore:    Math.round(payload.focus_score   * 100),
      fatigueScore:  Math.round(payload.fatigue_score * 100),
      avgEar:        Math.round((payload.avg_ear ?? 0) * 100),
      emotion,
      phoneDetected,
    });
  }, [mpReady]);

  // ── 6. WS 전송 루프 ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!camReady || !mpReady) return;

    procTimerRef.current = setInterval(runDetection, PROC_INTERVAL);
    wsTimerRef.current   = setInterval(() => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN && Object.keys(latestRef.current).length) {
        ws.send(JSON.stringify(latestRef.current));
      }
    }, WS_INTERVAL);

    return () => {
      clearInterval(procTimerRef.current);
      clearInterval(wsTimerRef.current);
    };
  }, [camReady, mpReady, runDetection]);

  // ── UI ────────────────────────────────────────────────────────────────────
  const cfg = STATUS_CFG[display.status] ?? STATUS_CFG.uncertain;

  return (
    <div style={{ minHeight: '100vh', background: '#0F0F0F', display: 'flex', flexDirection: 'column' }}>
      {/* Topbar */}
      <div style={{
        background: '#1A1A1A', borderBottom: '1px solid #333',
        padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <span style={{ color: '#FF6B2B', fontWeight: 800, fontSize: 15 }}>🎓 {user.name}</span>
          <span style={{ color: '#555', fontSize: 12, marginLeft: 10 }}>{session.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* WS 상태 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 20,
            background: wsStatus === 'connected' ? '#0D2918' : wsStatus === 'error' ? '#2D1010' : '#1A1A1A',
            border: `1px solid ${wsStatus === 'connected' ? '#22C55E' : wsStatus === 'error' ? '#EF4444' : '#444'}`,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: wsStatus === 'connected' ? '#22C55E' : wsStatus === 'error' ? '#EF4444' : '#555',
            }} />
            <span style={{ fontSize: 11, color: wsStatus === 'connected' ? '#22C55E' : wsStatus === 'error' ? '#EF4444' : '#888' }}>
              {wsStatus === 'connected' ? '전송 중' : wsStatus === 'error' ? '오류' : '연결 중...'}
            </span>
          </div>
          {/* MP 상태 */}
          <div style={{
            padding: '4px 10px', borderRadius: 20, fontSize: 11,
            background: mpReady ? '#0D2918' : '#1A1A1A',
            color: mpReady ? '#22C55E' : '#888',
            border: `1px solid ${mpReady ? '#22C55E' : '#444'}`,
          }}>
            {mpReady ? 'AI 감지 중' : 'AI 로딩...'}
          </div>
          {/* 카메라 토글 */}
          <button
            onClick={() => camOn ? stopCamera() : startCamera()}
            style={{
              padding: '5px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
              border: `1px solid ${camOn ? '#22C55E' : '#EF4444'}`,
              background: camOn ? '#0D2918' : '#2D1010',
              color: camOn ? '#22C55E' : '#EF4444',
              fontWeight: 700,
            }}
          >
            {camOn ? '📷 카메라 끄기' : '📷 카메라 켜기'}
          </button>
          <button
            onClick={() => { stopCamera(); onLeave(); }}
            style={{
              padding: '5px 12px', borderRadius: 8,
              border: '1px solid #444', background: '#2A2A2A',
              color: '#888', fontSize: 12, cursor: 'pointer',
            }}
          >
            나가기
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', gap: 16, padding: 16, alignItems: 'flex-start' }}>
        {/* 웹캠 */}
        <div style={{
          flex: 1, borderRadius: 16, overflow: 'hidden',
          border: '2px solid #2A2A2A', background: '#000',
          aspectRatio: '4/3', position: 'relative',
        }}>
          <video
            ref={videoRef}
            muted
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
          />
          {!camReady && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', background: '#111',
            }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>{camOn ? '📷' : '🚫'}</div>
              <div style={{ color: '#888', fontSize: 14 }}>
                {camOn ? '카메라 연결 중...' : '카메라가 꺼져 있습니다'}
              </div>
            </div>
          )}
          {/* Status overlay */}
          {camReady && (
            <div style={{
              position: 'absolute', top: 12, left: 12,
              background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
              borderRadius: 10, padding: '6px 12px',
              border: `1.5px solid ${cfg.color}`,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
            </div>
          )}
          {display.phoneDetected && (
            <div style={{
              position: 'absolute', bottom: 12, left: 12, right: 12,
              background: 'rgba(139,92,246,0.9)', borderRadius: 10,
              padding: '8px 14px', textAlign: 'center',
              fontSize: 13, fontWeight: 700, color: '#fff',
            }}>
              📱 핸드폰 사용이 감지되었습니다
            </div>
          )}
        </div>

        {/* 오른쪽 패널: 지표 + 퀴즈 */}
        <div style={{ width: 240, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', maxHeight: 'calc(100vh - 80px)' }}>
          {/* 지표 */}
          {[
            { label: '집중도',  value: `${display.focusScore}%`,   color: display.focusScore >= 60 ? '#22C55E' : display.focusScore >= 35 ? '#F59E0B' : '#EF4444' },
            { label: '피로도',  value: `${display.fatigueScore}%`, color: display.fatigueScore > 60 ? '#EF4444' : '#3B82F6' },
            { label: '눈깜빡임', value: `${display.avgEar}/100`,   color: '#888' },
          ].map(item => (
            <div key={item.label} style={{
              background: '#1A1A1A', borderRadius: 12, padding: '14px',
              border: '1px solid #2A2A2A',
            }}>
              <div style={{ fontSize: 11, color: '#555', marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: item.color }}>{item.value}</div>
            </div>
          ))}

          <div style={{ background: '#1A1A1A', borderRadius: 12, padding: '14px', border: '1px solid #2A2A2A' }}>
            <div style={{ fontSize: 11, color: '#555', marginBottom: 6 }}>표정</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#CCC' }}>
              {display.emotion ? (EMOTION_KR[display.emotion] ?? display.emotion) : '-'}
            </div>
          </div>

          <div style={{
            background: cfg.bg + '22', borderRadius: 12, padding: '14px',
            border: `1.5px solid ${cfg.color}44`, textAlign: 'center',
          }}>
            <div style={{ fontSize: 11, color: '#555', marginBottom: 6 }}>현재 상태</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: cfg.color }}>{cfg.label}</div>
          </div>

          {/* 퀴즈 패널 */}
          {quizzes.length > 0 && (
            <div style={{ background: '#1A1A1A', borderRadius: 12, border: '1px solid #2A2A2A', overflow: 'hidden' }}>
              {/* 헤더 */}
              <div style={{ padding: '12px 14px', borderBottom: '1px solid #2A2A2A' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#CCC', marginBottom: 4 }}>실습 퀴즈</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, height: 4, background: '#2A2A2A', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${completionRate}%`, background: '#22C55E', borderRadius: 4, transition: 'width 0.4s' }} />
                  </div>
                  <span style={{ fontSize: 11, color: '#22C55E', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {correctCount}/{quizzes.length}
                  </span>
                </div>
              </div>

              {/* 퀴즈 목록 */}
              <div style={{ padding: '8px' }}>
                {quizzes.map((quiz, i) => {
                  const sub = submissions[quiz.quiz_id];
                  const isOpen = activeQuiz === quiz.quiz_id;
                  const isDone = sub != null;
                  return (
                    <div key={quiz.quiz_id} style={{ marginBottom: 4 }}>
                      {/* 퀴즈 항목 버튼 */}
                      <button
                        onClick={() => handleOpenQuiz(quiz.quiz_id)}
                        style={{
                          width: '100%', textAlign: 'left', padding: '8px 10px',
                          background: isOpen ? '#252525' : 'transparent',
                          border: 'none', borderRadius: 8, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 8,
                        }}
                      >
                        <span style={{
                          width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                          background: isDone ? (sub.is_correct ? '#22C55E' : '#EF4444') : '#2A2A2A',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 800, color: isDone ? '#fff' : '#555',
                        }}>
                          {isDone ? (sub.is_correct ? '✓' : '✗') : i + 1}
                        </span>
                        <span style={{
                          fontSize: 11, color: isDone ? (sub.is_correct ? '#22C55E' : '#EF4444') : '#AAA',
                          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          Q{i + 1}. {quiz.question}
                        </span>
                      </button>

                      {/* 펼쳐진 퀴즈 */}
                      {isOpen && (
                        <div style={{ padding: '8px 10px 10px', background: '#1E1E1E', borderRadius: 8, marginTop: 2 }}>
                          <div style={{ fontSize: 12, color: '#DDD', marginBottom: 10, lineHeight: 1.5 }}>
                            {quiz.question}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
                            {(quiz.options ?? []).map((opt, j) => (
                              <button
                                key={j}
                                onClick={() => !isDone && setQuizAnswer(opt)}
                                disabled={isDone}
                                style={{
                                  padding: '7px 10px', borderRadius: 6, textAlign: 'left',
                                  fontSize: 11, cursor: isDone ? 'default' : 'pointer',
                                  border: `1.5px solid ${
                                    isDone && opt === sub.submitted_answer
                                      ? (sub.is_correct ? '#22C55E' : '#EF4444')
                                      : quizAnswer === opt ? '#FF6B2B' : '#2A2A2A'
                                  }`,
                                  background: isDone && opt === sub.submitted_answer
                                    ? (sub.is_correct ? '#0D2918' : '#2D1010')
                                    : quizAnswer === opt ? '#2A1500' : 'transparent',
                                  color: isDone && opt === sub.submitted_answer
                                    ? (sub.is_correct ? '#22C55E' : '#EF4444')
                                    : quizAnswer === opt ? '#FF6B2B' : '#888',
                                }}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                          {!isDone ? (
                            <button
                              onClick={() => handleSubmitQuiz(quiz)}
                              disabled={!quizAnswer || submitting}
                              style={{
                                width: '100%', padding: '7px', borderRadius: 6, border: 'none',
                                background: !quizAnswer || submitting ? '#2A2A2A' : '#FF6B2B',
                                color: !quizAnswer || submitting ? '#555' : '#fff',
                                fontSize: 11, fontWeight: 700, cursor: !quizAnswer || submitting ? 'not-allowed' : 'pointer',
                              }}
                            >
                              {submitting ? '제출 중...' : '제출하기'}
                            </button>
                          ) : (
                            <div style={{
                              padding: '6px 10px', borderRadius: 6, textAlign: 'center',
                              background: sub.is_correct ? '#0D2918' : '#2D1010',
                              fontSize: 11, fontWeight: 700,
                              color: sub.is_correct ? '#22C55E' : '#EF4444',
                            }}>
                              {sub.is_correct ? '✓ 정답입니다!' : '✗ 오답입니다'}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
