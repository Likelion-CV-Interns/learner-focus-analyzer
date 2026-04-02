/**
 * RealTimeMonitorMock.jsx
 * 목업 캡처 전용 — WebSocket 없이 정적 mock 데이터로 동작
 * 실제 서비스 코드(RealTimeMonitor.jsx)는 건드리지 않음
 */
import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { STATUS_CONFIG } from '../utils/mockData';

const EMOTION_KR = {
  engagement: '집중', boredom: '지루함', confusion: '혼란',
  amused: '웃음', surprise: '놀람',
};
const EMOTION_EMOJI = {
  engagement: '😊', boredom: '😑', confusion: '😕',
  amused: '😄', surprise: '😲',
};

// ── 고정 목업 학습자 데이터 ────────────────────────────────────────────────
const MOCK_STUDENTS = [
  { id: 'u1',  name: '강지윤', seat: 'A-1', status: 'focused',    focusScore: 88, fatigueScore: 22, eyeBlink: 18, expression: 'engagement' },
  { id: 'u2',  name: '이서연', seat: 'A-2', status: 'focused',    focusScore: 82, fatigueScore: 30, eyeBlink: 22, expression: 'engagement' },
  { id: 'u3',  name: '박지호', seat: 'A-3', status: 'distracted', focusScore: 47, fatigueScore: 51, eyeBlink: 14, expression: 'boredom' },
  { id: 'u4',  name: '최유나', seat: 'B-1', status: 'focused',    focusScore: 91, fatigueScore: 18, eyeBlink: 20, expression: 'engagement' },
  { id: 'u5',  name: '정우진', seat: 'B-2', status: 'drowsy',     focusScore: 21, fatigueScore: 78, eyeBlink: 8,  expression: 'boredom' },
  { id: 'u6',  name: '한소희', seat: 'B-3', status: 'focused',    focusScore: 76, fatigueScore: 35, eyeBlink: 24, expression: 'engagement' },
  { id: 'u7',  name: '윤도현', seat: 'C-1', status: 'distracted', focusScore: 39, fatigueScore: 55, eyeBlink: 12, expression: 'confusion' },
  { id: 'u8',  name: '장미래', seat: 'C-2', status: 'phone',      focusScore: 18, fatigueScore: 40, eyeBlink: 16, expression: 'amused' },
  { id: 'u9',  name: '임준서', seat: 'C-3', status: 'focused',    focusScore: 84, fatigueScore: 27, eyeBlink: 21, expression: 'engagement' },
  { id: 'u10', name: '신채원', seat: 'D-1', status: 'focusing',   focusScore: 62, fatigueScore: 44, eyeBlink: 19, expression: 'engagement' },
  { id: 'u11', name: '오세훈', seat: 'D-2', status: 'distracted', focusScore: 43, fatigueScore: 60, eyeBlink: 11, expression: 'boredom' },
  { id: 'u12', name: '배수지', seat: 'D-3', status: 'focused',    focusScore: 79, fatigueScore: 32, eyeBlink: 23, expression: 'surprise' },
];

// ── 고정 시계열 데이터 ────────────────────────────────────────────────────
function buildTimeSeries() {
  const focus   = [72,75,73,78,76,80,77,74,71,68,65,63,67,70,69,72,71,68,65,62,60,58,63,67,65,68,71,70,68,65];
  const fatigue = [18,19,21,22,24,25,27,29,31,33,35,37,38,40,41,43,44,46,47,49,51,53,54,55,57,58,60,61,62,63];
  const now = Date.now();
  return focus.map((f, i) => {
    const t = new Date(now - (focus.length - 1 - i) * 30000);
    return {
      time: `${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')}:${t.getSeconds().toString().padStart(2,'0')}`,
      focus: f,
      fatigue: fatigue[i],
    };
  });
}

// ── 서브 컴포넌트 ─────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.focused;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 20,
      background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 700,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, display: 'inline-block' }} />
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
        <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: 3 }} />
      </div>
    </div>
  );
}

function StudentCard({ student, onClick, selected }) {
  return (
    <div
      onClick={() => onClick(student.id)}
      style={{
        background: '#fff', borderRadius: 14, padding: 16,
        border: selected ? '2px solid #FF6B2B' : '1.5px solid #EEE',
        cursor: 'pointer',
        boxShadow: selected ? '0 4px 20px rgba(255,107,43,0.15)' : '0 2px 8px rgba(0,0,0,0.04)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A1A' }}>{student.name}</div>
          <div style={{ fontSize: 11, color: '#AAA', marginTop: 1 }}>좌석 {student.seat}</div>
        </div>
        <StatusBadge status={student.status} />
      </div>
      <FocusBar value={student.focusScore} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid #F5F5F5' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#AAA' }}>피로도</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#444', marginTop: 2 }}>{student.fatigueScore}%</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#AAA' }}>눈깜빡임</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#444', marginTop: 2 }}>{student.eyeBlink}/min</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#AAA' }}>표정</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#444', marginTop: 2 }}>
            {student.expression
              ? `${EMOTION_EMOJI[student.expression] ?? ''} ${EMOTION_KR[student.expression] ?? student.expression}`
              : '-'}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 14, padding: '20px 24px',
      border: '1.5px solid #EEE', flex: 1, minWidth: 120,
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

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────
export default function RealTimeMonitorMock() {
  const [timeSeries]    = useState(buildTimeSeries);
  const [selectedId,    setSelectedId]    = useState(null);
  const [filterStatus,  setFilterStatus]  = useState('all');

  const totalCount   = MOCK_STUDENTS.length;
  const avgFocus     = Math.round(MOCK_STUDENTS.reduce((s, v) => s + v.focusScore, 0) / totalCount);
  const focusedCount = MOCK_STUDENTS.filter(s => s.status === 'focused').length;
  const drowsyCount  = MOCK_STUDENTS.filter(s => s.status === 'drowsy').length;
  const phoneCount   = MOCK_STUDENTS.filter(s => s.status === 'phone').length;
  const focusRatio   = Math.round((focusedCount / totalCount) * 100);

  const filtered = MOCK_STUDENTS.filter(s =>
    filterStatus === 'all' || s.status === filterStatus
  );

  const selected = selectedId ? MOCK_STUDENTS.find(s => s.id === selectedId) : null;

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1A1A1A' }}>실시간 집중도 모니터링</h1>
          <p style={{ fontSize: 13, color: '#888', marginTop: 3 }}>
            📡 김라이언 강의자 · React 심화 과정 세션 모니터링 중
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 20,
            background: '#EFF6FF', border: '1.5px solid #BFDBFE',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3B82F6' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8' }}>📡 실시간 연결</span>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 20,
            background: '#F0FDF4', border: '1.5px solid #86EFAC',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#15803D' }}>LIVE</span>
          </div>
          <button style={{
            padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13,
            background: '#FEF2F2', color: '#EF4444',
            border: '1.5px solid #FECACA', cursor: 'pointer',
          }}>
            ⏹ 방송 종료
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

      {/* Chart */}
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
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {[
              { key: 'all',       label: '전체' },
              { key: 'focused',   label: '집중' },
              { key: 'distracted',label: '딴짓' },
              { key: 'drowsy',    label: '졸음' },
              { key: 'phone',     label: '핸드폰' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilterStatus(f.key)}
                style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                  fontWeight: filterStatus === f.key ? 700 : 500,
                  background: filterStatus === f.key ? '#FF6B2B' : '#fff',
                  color: filterStatus === f.key ? '#fff' : '#555',
                  border: `1.5px solid ${filterStatus === f.key ? '#FF6B2B' : '#DDD'}`,
                }}
              >
                {f.label}
                {f.key !== 'all' && (
                  <span style={{ marginLeft: 4, opacity: 0.8 }}>
                    ({MOCK_STUDENTS.filter(s => s.status === f.key).length})
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
                onClick={setSelectedId}
                selected={selectedId === student.id}
              />
            ))}
          </div>
        </div>

        {/* Detail Panel */}
        {selected && (
          <div style={{
            width: 280, flexShrink: 0,
            background: '#fff', borderRadius: 16, padding: 20,
            border: '1.5px solid #EEE', height: 'fit-content',
            position: 'sticky', top: 84,
            boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700 }}>학습자 상세</h3>
              <button onClick={() => setSelectedId(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#AAA', fontSize: 18 }}>×</button>
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
                {selected.name[0]}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{selected.name}</div>
                <div style={{ fontSize: 12, color: '#888' }}>좌석 {selected.seat}</div>
                <div style={{ marginTop: 4 }}><StatusBadge status={selected.status} /></div>
              </div>
            </div>

            {[
              { label: '집중도',   value: `${selected.focusScore}%`,   color: selected.focusScore >= 60 ? '#22C55E' : selected.focusScore >= 35 ? '#F59E0B' : '#EF4444' },
              { label: '피로도',   value: `${selected.fatigueScore}%`, color: selected.fatigueScore > 60 ? '#EF4444' : '#3B82F6' },
              { label: '눈깜빡임', value: `${selected.eyeBlink}/min`,  color: '#444' },
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
              marginTop: 14, padding: '12px',
              background: '#F8F8F8', borderRadius: 10,
              fontSize: 12, color: '#555', lineHeight: 1.6,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4, color: '#333' }}>AI 추천 조치</div>
              {selected.status === 'drowsy'     && '😴 졸음 상태입니다. 직접 질문하거나 가벼운 활동을 유도해 주세요.'}
              {selected.status === 'phone'      && '📱 핸드폰 사용이 감지되었습니다. 주의를 환기시켜 주세요.'}
              {selected.status === 'distracted' && '🤔 집중도가 낮습니다. 흥미를 유발하는 질문을 해보세요.'}
              {(selected.status === 'focused' || selected.status === 'focusing') && '✅ 현재 잘 집중하고 있습니다. 계속 유지될 수 있도록 격려해주세요.'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
