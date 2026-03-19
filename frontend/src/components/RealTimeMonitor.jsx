import { useState, useEffect, useCallback, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { STUDENTS, STATUS_CONFIG, generateStudentState, generateTimeSeries } from '../utils/mockData';

const WS_SERVER = 'ws://localhost:8000';

// cam_id → STUDENTS의 id 매핑 (실제 데이터를 어떤 학생에 덮어씌울지)
const CAM_STUDENT_MAP = {
  cam1: 1,   // cam1 데이터 → 학생 id 1번 (강지윤)
  // cam2: 2,  // 카메라 추가 시 여기에 계속
};

// detection → server 데이터를 프론트 StudentState 형식으로 변환
function toStudentState(data) {
  const statusMap = { focused: 'focused', distracted: 'distracted', drowsy: 'drowsy', uncertain: 'distracted' };
  // 핸드폰 감지 시 status를 'phone'으로 오버라이드
  const baseStatus = statusMap[data.status] ?? 'distracted';
  const status = data.phone_detected ? 'phone' : baseStatus;
  return {
    status,
    focusScore:       Math.round((data.focus_score ?? 0) * 100),
    fatigueScore:     Math.round((data.fatigue_score ?? 0) * 100),
    eyeBlink:         Math.round((data.avg_ear ?? 0.25) * 100),
    expression:       data.emotion_kr ?? null,   // Colab 표정 (한국어), 없으면 null
    phoneDetected:    data.phone_detected ?? false,
    phoneConfidence:  data.phone_confidence ?? 0,
    lastUpdate:       new Date(data.timestamp ?? Date.now()),
    connected:        data.connected !== false,
  };
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.focused;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '3px 8px',
      borderRadius: 20,
      background: cfg.bg,
      color: cfg.color,
      fontSize: 11,
      fontWeight: 700,
    }}>
      <span style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: cfg.color,
        display: 'inline-block',
        animation: status !== 'focused' ? 'pulse 1.5s infinite' : 'none',
      }} />
      {cfg.label}
    </span>
  );
}

function FocusBar({ value }) {
  const color = value >= 60 ? '#22C55E' : value >= 35 ? '#F59E0B' : '#EF4444';
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: '#888' }}>집중도</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{value}%</span>
      </div>
      <div style={{ height: 6, background: '#F0F0F0', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${value}%`,
          background: color,
          borderRadius: 3,
          transition: 'width 0.5s ease',
        }} />
      </div>
    </div>
  );
}

function StudentCard({ student, state, onClick, selected }) {
  return (
    <div
      onClick={() => onClick(student.id)}
      style={{
        background: '#fff',
        borderRadius: 14,
        padding: 16,
        border: selected ? '2px solid #FF6B2B' : '1.5px solid #EEE',
        cursor: 'pointer',
        transition: 'box-shadow 0.2s, border 0.2s',
        boxShadow: selected ? '0 4px 20px rgba(255,107,43,0.15)' : '0 2px 8px rgba(0,0,0,0.04)',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A1A' }}>{student.name}</div>
          <div style={{ fontSize: 11, color: '#AAA', marginTop: 1 }}>좌석 {student.seat}</div>
        </div>
        <StatusBadge status={state.status} />
      </div>
      <FocusBar value={state.focusScore} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid #F5F5F5' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#AAA' }}>피로도</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#444', marginTop: 2 }}>{state.fatigueScore}%</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#AAA' }}>눈깜빡임</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#444', marginTop: 2 }}>{state.eyeBlink}/min</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#AAA' }}>표정</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: state.phoneDetected ? '#8B5CF6' : '#444', marginTop: 2 }}>
            {state.phoneDetected ? '📱' : (state.expression ?? '-')}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 14,
      padding: '20px 24px',
      border: '1.5px solid #EEE',
      flex: 1,
      minWidth: 120,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: '#888' }}>{label}</span>
        <span style={{ fontSize: 20 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: color || '#1A1A1A' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#AAA', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function RealTimeMonitor({ onNewNotification, monitoringTarget }) {
  const [states, setStates] = useState(() =>
    Object.fromEntries(STUDENTS.map(s => [s.id, generateStudentState(s.id)]))
  );
  const [timeSeries, setTimeSeries] = useState(generateTimeSeries);
  const [selectedId, setSelectedId] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [isLive, setIsLive] = useState(true);

  // ── 실시간 WebSocket 상태 ──
  const [wsStudents, setWsStudents] = useState({});   // user_id → state
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);

  const sessionId = monitoringTarget?.sessionId;

  useEffect(() => {
    if (!sessionId) return;

    let ws;
    let pingTimer;

    function connect() {
      ws = new WebSocket(`${WS_SERVER}/ws/dashboard/${sessionId}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('ping');
        }, 20000);
      };

      ws.onmessage = (e) => {
        if (e.data === 'pong') return;
        const msg = JSON.parse(e.data);
        if (msg.type === 'snapshot') {
          // 초기 스냅샷: 연결된 모든 유저 상태 한 번에 수신
          const next = {};
          Object.entries(msg.users || {}).forEach(([uid, data]) => {
            next[uid] = toStudentState(data);
          });
          setWsStudents(next);
        } else if (msg.type === 'user_update') {
          setWsStudents(prev => ({ ...prev, [msg.user_id]: toStudentState(msg) }));
          // 집중도 추이 차트에도 포인트 추가
          setTimeSeries(prev => {
            const now = new Date();
            const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
            const allStates = Object.values({ ...wsStudents, [msg.user_id]: toStudentState(msg) });
            const avgFocus  = allStates.length ? Math.round(allStates.reduce((s, v) => s + v.focusScore, 0) / allStates.length) : 0;
            const avgFatigue = allStates.length ? Math.round(allStates.reduce((s, v) => s + v.fatigueScore, 0) / allStates.length) : 0;
            return [...prev.slice(-19), { time: timeStr, focus: avgFocus, fatigue: avgFatigue }];
          });
        } else if (msg.type === 'user_disconnect') {
          setWsStudents(prev => {
            const next = { ...prev };
            if (next[msg.user_id]) next[msg.user_id] = { ...next[msg.user_id], connected: false };
            return next;
          });
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        clearInterval(pingTimer);
        // 3초 후 재연결
        setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      clearInterval(pingTimer);
      ws?.close();
    };
  }, [sessionId]);

  // 항상 STUDENTS 전체 표시. WS 데이터가 있는 학생만 실제 데이터로 덮어씌움
  const mergedStates = Object.fromEntries(
    STUDENTS.map(s => {
      const camId = Object.entries(CAM_STUDENT_MAP).find(([, sid]) => sid === s.id)?.[0];
      const wsState = camId ? wsStudents[camId] : undefined;
      return [s.id, wsState ?? states[s.id]];
    })
  );

  const displayStudents = STUDENTS;
  const displayStates   = mergedStates;

  const allStateValues = Object.values(displayStates);
  const totalCount   = displayStudents.length || 1;
  const avgFocus     = allStateValues.length
    ? Math.round(allStateValues.reduce((sum, s) => sum + s.focusScore, 0) / allStateValues.length)
    : 0;
  const focusedCount = allStateValues.filter(s => s.status === 'focused').length;
  const drowsyCount  = allStateValues.filter(s => s.status === 'drowsy').length;
  const phoneCount   = allStateValues.filter(s => s.status === 'phone').length;
  const focusRatio   = Math.round((focusedCount / totalCount) * 100);

  const updateStates = useCallback(() => {
    setStates(prev => {
      const next = { ...prev };
      const alerts = [];

      STUDENTS.forEach(student => {
        const newState = generateStudentState(student.id);
        const old = prev[student.id];

        if (old.status === 'focused' && (newState.status === 'drowsy' || newState.status === 'phone')) {
          alerts.push({
            type: 'individual',
            title: `${student.name} 학습자 주의`,
            message: newState.status === 'drowsy'
              ? `${student.name}(${student.seat}) 학습자가 졸음 상태로 전환되었습니다.`
              : `${student.name}(${student.seat}) 학습자가 핸드폰을 사용 중입니다.`,
          });
        }
        next[student.id] = newState;
      });

      // Class-level threshold check
      const newFocused = Object.values(next).filter(s => s.status === 'focused').length;
      const ratio = (newFocused / STUDENTS.length) * 100;
      if (ratio < 40) {
        alerts.push({
          type: 'class',
          title: '전체 집중도 저하',
          message: `학습자 집중도 비율이 ${Math.round(ratio)}%로 40% 미만입니다. 쉬는 시간이 필요합니다.`,
        });
      }

      // Boredom check
      const boredCount = Object.values(next).filter(s => s.expression === 'bored').length;
      if (boredCount > STUDENTS.length / 2) {
        alerts.push({
          type: 'boredom',
          title: '지루함 감지',
          message: `과반수 이상의 학습자가 지루함 표정을 보입니다. 퀴즈나 휴식을 권장합니다.`,
        });
      }

      alerts.forEach(a => onNewNotification(a));
      return next;
    });

    setTimeSeries(prev => {
      const now = new Date();
      const newPoint = {
        time: `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`,
        focus: Math.round(40 + Math.random() * 45),
        fatigue: Math.round(20 + Math.random() * 40),
      };
      return [...prev.slice(-19), newPoint];
    });
  }, [onNewNotification]);

  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(updateStates, 4000);
    return () => clearInterval(interval);
  }, [isLive, updateStates]);

  const filtered = displayStudents.filter(s =>
    filterStatus === 'all' || displayStates[s.id]?.status === filterStatus
  );

  const selectedStudent = selectedId ? displayStudents.find(s => s.id === selectedId) : null;
  const selectedState = selectedId ? displayStates[selectedId] : null;

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1A1A1A' }}>실시간 집중도 모니터링</h1>
          <p style={{ fontSize: 13, color: '#888', marginTop: 3 }}>
            {monitoringTarget
              ? `📡 ${monitoringTarget.name} 강의자 · ${monitoringTarget.course} 세션 모니터링 중`
              : '학습자들의 현재 집중 상태를 실시간으로 확인합니다'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* 웹캠 WS 연결 상태 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 20,
            background: wsConnected ? '#EFF6FF' : '#F5F5F5',
            border: `1.5px solid ${wsConnected ? '#BFDBFE' : '#DDD'}`,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: wsConnected ? '#3B82F6' : '#CCC',
              animation: wsConnected ? 'pulse 1.5s infinite' : 'none',
            }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: wsConnected ? '#1D4ED8' : '#888' }}>
              {wsConnected ? '📡 실시간 연결' : '서버 대기 중'}
            </span>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 20,
            background: isLive ? '#F0FDF4' : '#F5F5F5',
            border: `1.5px solid ${isLive ? '#86EFAC' : '#DDD'}`,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: isLive ? '#22C55E' : '#CCC',
              animation: isLive ? 'pulse 1.5s infinite' : 'none',
            }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: isLive ? '#15803D' : '#888' }}>
              {isLive ? 'LIVE' : 'PAUSED'}
            </span>
          </div>
          <button
            onClick={() => setIsLive(v => !v)}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              background: isLive ? '#FFF5F0' : '#FF6B2B',
              color: isLive ? '#FF6B2B' : '#fff',
              border: `1.5px solid ${isLive ? '#FF6B2B' : 'transparent'}`,
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {isLive ? '⏸ 일시정지' : '▶ 재개'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard label="평균 집중도" value={`${avgFocus}%`}
          color={avgFocus >= 60 ? '#22C55E' : avgFocus >= 40 ? '#F59E0B' : '#EF4444'}
          icon="🎯" sub="전체 학습자 기준" />
        <StatCard label="집중 중" value={`${focusedCount}명`}
          color="#22C55E" icon="✅" sub={`전체 ${totalCount}명 중`} />
        <StatCard label="졸음 감지" value={`${drowsyCount}명`}
          color="#EF4444" icon="😴" sub="즉시 확인 필요" />
        <StatCard label="핸드폰 사용" value={`${phoneCount}명`}
          color="#8B5CF6" icon="📱" sub="주의 필요" />
        <StatCard label="전체 집중률" value={`${focusRatio}%`}
          color="#FF6B2B" icon="📊" sub="집중 학습자 비율" />
      </div>

      {/* Time Series Chart */}
      <div style={{
        background: '#fff', borderRadius: 16, padding: '20px 24px',
        border: '1.5px solid #EEE', marginBottom: 20,
        boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>전체 집중도 추이</h2>
          <span style={{ fontSize: 12, color: '#AAA' }}>최근 {timeSeries.length}개 데이터 포인트</span>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={timeSeries} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#AAA' }} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#AAA' }} />
            <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #EEE', fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="focus" stroke="#FF6B2B" strokeWidth={2.5}
              dot={false} name="집중도 (%)" activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="fatigue" stroke="#8B5CF6" strokeWidth={2}
              dot={false} name="피로도 (%)" strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        {/* Student Grid */}
        <div style={{ flex: 1 }}>
          {/* Filter */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {[
              { key: 'all', label: '전체' },
              { key: 'focused', label: '집중' },
              { key: 'distracted', label: '딴짓' },
              { key: 'drowsy', label: '졸음' },
              { key: 'phone', label: '핸드폰' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilterStatus(f.key)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: filterStatus === f.key ? 700 : 500,
                  background: filterStatus === f.key ? '#FF6B2B' : '#fff',
                  color: filterStatus === f.key ? '#fff' : '#555',
                  border: `1.5px solid ${filterStatus === f.key ? '#FF6B2B' : '#DDD'}`,
                }}
              >
                {f.label}
                {f.key !== 'all' && (
                  <span style={{ marginLeft: 4, opacity: 0.8 }}>
                    ({Object.values(states).filter(s => s.status === f.key).length})
                  </span>
                )}
              </button>
            ))}
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 12,
          }}>
            {filtered.map(student => (
              <StudentCard
                key={student.id}
                student={student}
                state={displayStates[student.id]}
                onClick={setSelectedId}
                selected={selectedId === student.id}
              />
            ))}
          </div>
        </div>

        {/* Detail Panel */}
        {selectedStudent && selectedState && (
          <div style={{
            width: 280,
            flexShrink: 0,
            background: '#fff',
            borderRadius: 16,
            padding: 20,
            border: '1.5px solid #EEE',
            height: 'fit-content',
            position: 'sticky',
            top: 84,
            boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700 }}>학습자 상세</h3>
              <button
                onClick={() => setSelectedId(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#AAA', fontSize: 18 }}
              >×</button>
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px', background: '#FFF5F0', borderRadius: 12, marginBottom: 16,
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: 'linear-gradient(135deg, #FF6B2B, #FF9A5C)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 18, fontWeight: 700,
              }}>
                {selectedStudent.name[0]}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{selectedStudent.name}</div>
                <div style={{ fontSize: 12, color: '#888' }}>좌석 {selectedStudent.seat}</div>
                <div style={{ marginTop: 4 }}><StatusBadge status={selectedState.status} /></div>
              </div>
            </div>

            {[
              { label: '집중도', value: `${selectedState.focusScore}%`, color: selectedState.focusScore >= 60 ? '#22C55E' : selectedState.focusScore >= 35 ? '#F59E0B' : '#EF4444' },
              { label: '피로도', value: `${selectedState.fatigueScore}%`, color: selectedState.fatigueScore > 60 ? '#EF4444' : '#3B82F6' },
              { label: '눈깜빡임', value: `${selectedState.eyeBlink}/min`, color: '#444' },
            ].map(item => (
              <div key={item.label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', borderBottom: '1px solid #F5F5F5',
              }}>
                <span style={{ fontSize: 13, color: '#666' }}>{item.label}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: item.color }}>{item.value}</span>
              </div>
            ))}

            <div style={{
              marginTop: 14,
              padding: '12px',
              background: '#F8F8F8',
              borderRadius: 10,
              fontSize: 12,
              color: '#555',
              lineHeight: 1.6,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4, color: '#333' }}>AI 추천 조치</div>
              {selectedState.status === 'drowsy' && '😴 졸음 상태입니다. 직접 질문하거나 가벼운 활동을 유도해 주세요.'}
              {selectedState.status === 'phone' && '📱 핸드폰 사용이 감지되었습니다. 주의를 환기시켜 주세요.'}
              {selectedState.status === 'distracted' && '🤔 집중도가 낮습니다. 흥미를 유발하는 질문을 해보세요.'}
              {selectedState.status === 'focused' && '✅ 현재 잘 집중하고 있습니다. 계속 유지될 수 있도록 격려해주세요.'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
