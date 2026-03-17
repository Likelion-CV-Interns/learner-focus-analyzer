import { useState } from 'react';

function generateMockSession(instructorId) {
  const sessionId = `sess_${Math.random().toString(36).slice(2, 10)}`;
  return {
    session_id: sessionId,
    stream_url: `rtmp://ec2-52-78-123-45.ap-northeast-2.compute.amazonaws.com:1935/live`,
    stream_key: `${instructorId}_${sessionId}`,
    live_page_url: `https://focus-analyzer.likelion.com/live/${sessionId}`,
    ws_url: `wss://focus-analyzer.likelion.com/ws/${sessionId}`,
    status: 'ready',
    created_at: new Date().toLocaleTimeString('ko-KR'),
  };
}

function CopyField({ label, value, mono = true }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: '#F8F8F8',
        border: '1.5px solid #E8E8E8',
        borderRadius: 10,
        padding: '10px 14px',
      }}>
        <span style={{
          flex: 1,
          fontSize: mono ? 12 : 13,
          fontFamily: mono ? 'monospace' : 'inherit',
          color: '#333',
          wordBreak: 'break-all',
        }}>
          {value}
        </span>
        <button
          onClick={handleCopy}
          style={{
            flexShrink: 0,
            padding: '5px 10px',
            borderRadius: 6,
            border: 'none',
            background: copied ? '#22C55E' : '#FF6B2B',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
        >
          {copied ? '✓ 복사됨' : '복사'}
        </button>
      </div>
    </div>
  );
}

function StepItem({ num, title, desc, children, highlight }) {
  return (
    <div style={{
      display: 'flex',
      gap: 14,
      padding: '16px 0',
      borderBottom: '1px solid #F5F5F5',
    }}>
      <div style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: highlight ? '#FF6B2B' : '#F0F0F0',
        color: highlight ? '#fff' : '#888',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        fontWeight: 800,
        flexShrink: 0,
        marginTop: 1,
      }}>{num}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A', marginBottom: 3 }}>{title}</div>
        {desc && <div style={{ fontSize: 12, color: '#777', lineHeight: 1.6 }}>{desc}</div>}
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    ready:     { label: '연결 대기중', color: '#F59E0B', bg: '#FFFBEB', dot: '#F59E0B' },
    streaming: { label: '스트리밍 중', color: '#22C55E', bg: '#F0FDF4', dot: '#22C55E' },
    ended:     { label: '세션 종료',   color: '#888',    bg: '#F5F5F5', dot: '#CCC'    },
  };
  const cfg = map[status] || map.ready;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 20,
      background: cfg.bg, color: cfg.color, fontSize: 12, fontWeight: 700,
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', background: cfg.dot,
        animation: status === 'streaming' ? 'pulse 1.5s infinite' : 'none',
      }} />
      {cfg.label}
    </span>
  );
}

export default function LiveSession({ user }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ending, setEnding] = useState(false);

  const createSession = () => {
    setLoading(true);
    // Mock API call delay
    setTimeout(() => {
      setSession(generateMockSession(user.id));
      setLoading(false);
    }, 1200);
  };

  const endSession = () => {
    setEnding(true);
    setTimeout(() => {
      setSession(prev => ({ ...prev, status: 'ended' }));
      setEnding(false);
    }, 800);
  };

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1A1A1A' }}>라이브 세션 관리</h1>
        <p style={{ fontSize: 13, color: '#888', marginTop: 3 }}>
          Zoom Live Streaming을 통해 강의 영상을 실시간으로 분석합니다
        </p>
      </div>

      {!session ? (
        /* ── 세션 시작 전 ── */
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
          {/* Start card */}
          <div style={{
            background: '#fff', borderRadius: 16, padding: '32px',
            border: '1.5px solid #EEE', boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🎥</div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1A1A1A', marginBottom: 8 }}>
              라이브 분석 세션 시작
            </h2>
            <p style={{ fontSize: 13, color: '#777', lineHeight: 1.7, marginBottom: 28 }}>
              세션을 시작하면 Zoom Live Streaming에 입력할<br />
              스트리밍 URL, 키, 페이지 URL이 생성됩니다.
            </p>
            <button
              onClick={createSession}
              disabled={loading}
              style={{
                padding: '14px 36px',
                background: loading ? '#CCC' : 'linear-gradient(135deg, #FF6B2B, #FF8C55)',
                color: '#fff',
                fontSize: 15,
                fontWeight: 700,
                borderRadius: 12,
                border: 'none',
                cursor: loading ? 'default' : 'pointer',
                boxShadow: loading ? 'none' : '0 4px 16px rgba(255,107,43,0.35)',
                width: '100%',
                transition: 'all 0.2s',
              }}
            >
              {loading ? '세션 생성 중...' : '🚀 라이브 세션 시작'}
            </button>
          </div>

          {/* Flow guide */}
          <div style={{
            background: '#fff', borderRadius: 16, padding: '24px',
            border: '1.5px solid #EEE', boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: '#1A1A1A', marginBottom: 4 }}>전체 연결 흐름</h3>
            <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>세션 시작 후 아래 순서로 진행하세요</p>
            {[
              { icon: '🚀', step: '세션 생성', desc: '라이브 세션 시작 버튼 클릭' },
              { icon: '📋', step: 'Zoom에 정보 입력', desc: 'Streaming URL / Key 복사 후 Zoom에 붙여넣기' },
              { icon: '📡', step: 'Zoom 방송 시작', desc: 'Live on Custom Live Streaming Service 선택' },
              { icon: '🤖', step: '자동 분석 시작', desc: 'AI 모델이 실시간 집중도 분석 시작' },
              { icon: '📊', step: '모니터링', desc: '실시간 모니터링 탭에서 결과 확인' },
            ].map((item, i) => (
              <div key={i} style={{
                display: 'flex', gap: 12, alignItems: 'flex-start',
                padding: '10px 0',
                borderBottom: i < 4 ? '1px dashed #F0F0F0' : 'none',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: '#FFF5F0', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0,
                }}>
                  {item.icon}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#333' }}>
                    <span style={{ color: '#FF6B2B', marginRight: 4 }}>{i + 1}.</span>{item.step}
                  </div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      ) : (
        /* ── 세션 생성 후 ── */
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
          {/* Stream info */}
          <div>
            {/* Session status */}
            <div style={{
              background: '#fff', borderRadius: 16, padding: '20px 24px',
              border: '1.5px solid #EEE', marginBottom: 16,
              boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 800, color: '#1A1A1A' }}>세션 정보</h3>
                  <div style={{ fontSize: 11, color: '#AAA', marginTop: 2 }}>
                    생성 시각: {session.created_at} &nbsp;·&nbsp; ID: <code style={{ fontSize: 11 }}>{session.session_id}</code>
                  </div>
                </div>
                <StatusBadge status={session.status} />
              </div>

              <CopyField label="Streaming URL (RTMP)" value={session.stream_url} />
              <CopyField label="Streaming Key" value={session.stream_key} />
              <CopyField label="Live Streaming Page URL" value={session.live_page_url} mono={false} />
              <CopyField label="WebSocket URL (내부용)" value={session.ws_url} />

              <div style={{
                marginTop: 8,
                padding: '10px 12px',
                background: '#F0FDF4',
                borderRadius: 8,
                border: '1px solid #BBF7D0',
                fontSize: 12,
                color: '#15803D',
                display: 'flex',
                gap: 6,
              }}>
                <span>💡</span>
                <span>Resolution은 <strong>720p</strong> 이상을 권장합니다. 분석 정확도에 영향을 줍니다.</span>
              </div>
            </div>

            {session.status !== 'ended' && (
              <button
                onClick={endSession}
                disabled={ending}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: ending ? '#F5F5F5' : '#FEF2F2',
                  color: ending ? '#AAA' : '#EF4444',
                  border: `1.5px solid ${ending ? '#EEE' : '#FECACA'}`,
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: ending ? 'default' : 'pointer',
                }}
              >
                {ending ? '세션 종료 중...' : '⏹ 세션 종료'}
              </button>
            )}

            {session.status === 'ended' && (
              <div style={{
                padding: '16px', background: '#F5F5F5', borderRadius: 10, textAlign: 'center',
                fontSize: 13, color: '#888', marginBottom: 12,
              }}>
                세션이 종료되었습니다. 총 집중도 평가 탭에서 결과를 확인하세요.
              </div>
            )}

            {session.status === 'ended' && (
              <button
                onClick={() => setSession(null)}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'linear-gradient(135deg, #FF6B2B, #FF8C55)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                🚀 새 세션 시작
              </button>
            )}
          </div>

          {/* Zoom Instructions */}
          <div style={{
            background: '#fff', borderRadius: 16, padding: '20px 24px',
            border: '1.5px solid #EEE', boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 22 }}>🎬</span>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: '#1A1A1A' }}>Zoom 연결 안내</h3>
            </div>
            <p style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>
              아래 순서대로 Zoom에서 라이브 스트리밍을 설정해 주세요.
            </p>

            <div style={{
              background: '#FFF8F5',
              border: '1px solid #FFD5C0',
              borderRadius: 10,
              padding: '10px 14px',
              fontSize: 12,
              color: '#CC4400',
              marginBottom: 16,
              display: 'flex',
              gap: 6,
            }}>
              ⚠️ Zoom 호스트 권한이 있어야 라이브 스트리밍을 설정할 수 있습니다.
            </div>

            <StepItem num={1} title="Zoom 미팅 시작" highlight
              desc="Zoom 미팅을 시작하고 호스트로 입장합니다."
            />
            <StepItem num={2} title="더보기(···) → Live on Custom Live Streaming Service" highlight
              desc='미팅 하단 툴바에서 "더보기" 버튼을 클릭한 뒤 "Live on Custom Live Streaming Service"를 선택합니다.'
            />
            <StepItem num={3} title="스트리밍 정보 입력" highlight>
              <div style={{ fontSize: 12, color: '#666', marginTop: 6, lineHeight: 1.8 }}>
                아래 항목을 왼쪽의 값을 복사해 붙여넣으세요:
                <div style={{ marginTop: 6 }}>
                  {[
                    ['Streaming URL', session.stream_url],
                    ['Streaming key', session.stream_key],
                    ['Live streaming page URL', session.live_page_url],
                    ['Resolution', '720p 이상 권장'],
                  ].map(([k, v]) => (
                    <div key={k} style={{
                      display: 'flex', gap: 6, alignItems: 'flex-start',
                      padding: '4px 0', borderBottom: '1px dashed #F0F0F0',
                    }}>
                      <span style={{ fontWeight: 700, color: '#333', minWidth: 140, flexShrink: 0 }}>· {k}</span>
                      <span style={{ color: '#777', fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </StepItem>
            <StepItem num={4} title='Go Live! 버튼 클릭' highlight
              desc='입력 후 "Go Live!" 버튼을 눌러 스트리밍을 시작합니다. 잠시 후 실시간 모니터링 탭에서 분석 결과가 나타납니다.'
            />
            <StepItem num={5} title="강의 종료 시" highlight={false}
              desc='Zoom에서 스트리밍을 중단하거나 미팅을 종료하면 자동으로 세션이 마감되고, 총 집중도 평가 탭에서 최종 리포트를 확인할 수 있습니다.'
            />
          </div>
        </div>
      )}
    </div>
  );
}
