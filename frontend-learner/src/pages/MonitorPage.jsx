import { useEffect, useRef, useState, useCallback } from 'react';
import { initDetector, detect, isDetectorReady } from '../utils/detector.js';
import { FocusScorer }  from '../utils/scorer.js';
import { ColabSender }  from '../utils/colabSender.js';

const WS_SERVER    = 'ws://35.193.134.51:8000';
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
  const latestRef   = useRef({});   // 최신 payload (WS 전송용)
  const procTimerRef = useRef(null);
  const wsTimerRef   = useRef(null);

  const [camReady,   setCamReady]   = useState(false);
  const [mpReady,    setMpReady]    = useState(false);
  const [wsStatus,   setWsStatus]   = useState('disconnected'); // connected | disconnected | error
  const [display,    setDisplay]    = useState({
    status: 'uncertain', focusScore: 0, fatigueScore: 0,
    avgEar: 0, emotion: null, phoneDetected: false,
  });

  // ── 1. 카메라 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then(stream => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play();
            setCamReady(true);
          };
        }
      })
      .catch(err => console.error('[Camera]', err));

    return () => {
      videoRef.current?.srcObject?.getTracks().forEach(t => t.stop());
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

    const { ear, gaze, head, emotion } = result;
    const scored = scorerRef.current.update(gaze, ear, head);

    // Colab 전송 (phone detection)
    if (colabRef.current) colabRef.current.push(video);
    const colabResult  = colabRef.current?.result ?? {};
    const phoneDetected = colabResult.phone_detected ?? false;
    const phoneConf     = colabResult.phone_confidence ?? 0;

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
          <button
            onClick={onLeave}
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
              <div style={{ fontSize: 36, marginBottom: 12 }}>📷</div>
              <div style={{ color: '#888', fontSize: 14 }}>카메라 연결 중...</div>
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

        {/* 지표 패널 */}
        <div style={{ width: 200, display: 'flex', flexDirection: 'column', gap: 10 }}>
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

          <div style={{
            background: '#1A1A1A', borderRadius: 12, padding: '14px',
            border: '1px solid #2A2A2A',
          }}>
            <div style={{ fontSize: 11, color: '#555', marginBottom: 6 }}>표정</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#CCC' }}>
              {display.emotion ? (EMOTION_KR[display.emotion] ?? display.emotion) : '-'}
            </div>
          </div>

          {/* 상태 배지 */}
          <div style={{
            background: cfg.bg + '22', borderRadius: 12, padding: '14px',
            border: `1.5px solid ${cfg.color}44`, textAlign: 'center',
          }}>
            <div style={{ fontSize: 11, color: '#555', marginBottom: 6 }}>현재 상태</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: cfg.color }}>{cfg.label}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
