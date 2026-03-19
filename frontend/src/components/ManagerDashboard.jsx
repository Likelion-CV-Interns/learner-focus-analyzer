import { useState, useEffect } from 'react';
import RealTimeMonitor from './RealTimeMonitor';

const INSTRUCTORS = [
  {
    id: 'teacher1',
    name: '김강사',
    course: 'Python 기초 · 3주차',
    students: 12,
    sessionId: 'sess_abc123',
    status: 'streaming',
    avgFocus: 72,
    alertCount: 2,
    startedAt: '09:05',
  },
  {
    id: 'teacher2',
    name: '이강사',
    course: '알고리즘 · 5주차',
    students: 10,
    sessionId: 'sess_def456',
    status: 'streaming',
    avgFocus: 48,
    alertCount: 5,
    startedAt: '09:10',
  },
  {
    id: 'teacher3',
    name: '박강사',
    course: '머신러닝 · 2주차',
    students: 8,
    sessionId: null,
    status: 'idle',
    avgFocus: null,
    alertCount: 0,
    startedAt: null,
  },
];

function FocusGauge({ value }) {
  const color = value >= 60 ? '#22C55E' : value >= 40 ? '#F59E0B' : '#EF4444';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: '#AAA' }}>평균 집중도</span>
        <span style={{ fontSize: 13, fontWeight: 800, color }}>{value}%</span>
      </div>
      <div style={{ height: 6, background: '#F0F0F0', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${value}%`, background: color,
          borderRadius: 3, transition: 'width 0.6s ease',
        }} />
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    streaming: { label: '🔴 라이브 중', color: '#EF4444', bg: '#FEF2F2', border: '#FECACA' },
    idle:      { label: '⚪ 대기 중',   color: '#888',    bg: '#F5F5F5', border: '#E0E0E0' },
  };
  const c = map[status];
  return (
    <span style={{
      padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: c.bg, color: c.color, border: `1.5px solid ${c.border}`,
    }}>
      {c.label}
    </span>
  );
}

export default function ManagerDashboard({ onNewNotification }) {
  const [instructors, setInstructors] = useState(INSTRUCTORS);
  const [monitoringTarget, setMonitoringTarget] = useState(null); // 선택된 강의자

  useEffect(() => {
    const t = setInterval(() => {
      setInstructors(prev => prev.map(inst =>
        inst.status === 'streaming'
          ? { ...inst, avgFocus: Math.min(100, Math.max(20, inst.avgFocus + Math.round((Math.random() - 0.5) * 6))) }
          : inst
      ));
    }, 3000);
    return () => clearInterval(t);
  }, []);

  const liveCount    = instructors.filter(i => i.status === 'streaming').length;
  const totalStudents = instructors.filter(i => i.status === 'streaming').reduce((s, i) => s + i.students, 0);
  const totalAlerts  = instructors.reduce((s, i) => s + i.alertCount, 0);

  // ── 모니터링 뷰 ──
  if (monitoringTarget) {
    return (
      <div>
        {/* 뒤로가기 헤더 */}
        <div style={{
          background: '#fff',
          borderBottom: '1px solid #EEE',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          position: 'sticky',
          top: 60,
          zIndex: 90,
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
            ← 강의자 현황으로
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
            <div>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#1A1A1A' }}>
                {monitoringTarget.name}
              </span>
              <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>
                {monitoringTarget.course}
              </span>
            </div>
            <StatusPill status={monitoringTarget.status} />
          </div>
        </div>

        <RealTimeMonitor
          onNewNotification={onNewNotification}
          monitoringTarget={monitoringTarget}
        />
      </div>
    );
  }

  // ── 강의자 현황 목록 ──
  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1A1A1A' }}>강의자 현황</h1>
        <p style={{ fontSize: 13, color: '#888', marginTop: 3 }}>
          현재 진행 중인 강의 세션을 모니터링합니다
        </p>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: '라이브 강의',  value: `${liveCount}개`,       icon: '🔴', color: '#EF4444', sub: '현재 진행 중' },
          { label: '총 수강 인원', value: `${totalStudents}명`,   icon: '👥', color: '#FF6B2B', sub: '라이브 세션 기준' },
          { label: '미해결 알림',  value: `${totalAlerts}건`,     icon: '🔔', color: totalAlerts > 0 ? '#F59E0B' : '#22C55E', sub: '즉시 확인 필요' },
          { label: '전체 강의자',  value: `${instructors.length}명`, icon: '👨‍🏫', color: '#3B82F6', sub: '등록된 강의자' },
        ].map(item => (
          <div key={item.label} style={{
            background: '#fff', borderRadius: 14, padding: '18px 22px',
            border: '1.5px solid #EEE', flex: 1, minWidth: 140,
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: '#888' }}>{item.label}</span>
              <span style={{ fontSize: 20 }}>{item.icon}</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: item.color }}>{item.value}</div>
            <div style={{ fontSize: 11, color: '#AAA', marginTop: 3 }}>{item.sub}</div>
          </div>
        ))}
      </div>

      {/* Instructor cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
        {instructors.map(inst => (
          <div key={inst.id} style={{
            background: '#fff', borderRadius: 16, padding: '20px 22px',
            border: inst.status === 'streaming' ? '2px solid #FFD5C0' : '1.5px solid #EEE',
            boxShadow: inst.status === 'streaming' ? '0 4px 20px rgba(255,107,43,0.1)' : '0 2px 8px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: inst.status === 'streaming'
                    ? 'linear-gradient(135deg, #FF6B2B, #FF9A5C)' : '#F0F0F0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: inst.status === 'streaming' ? '#fff' : '#AAA',
                  fontSize: 18, fontWeight: 800,
                }}>
                  {inst.name[0]}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>{inst.name}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 1 }}>{inst.course}</div>
                </div>
              </div>
              <StatusPill status={inst.status} />
            </div>

            {inst.status === 'streaming' ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                  {[
                    { label: '수강 인원', value: `${inst.students}명` },
                    { label: '시작 시각', value: inst.startedAt },
                    { label: '알림',     value: `${inst.alertCount}건`, alert: inst.alertCount > 3 },
                  ].map(item => (
                    <div key={item.label} style={{
                      padding: '8px 10px', background: '#FFF8F5',
                      borderRadius: 8, border: '1px solid #FFE8D8', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 10, color: '#AAA', marginBottom: 3 }}>{item.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: item.alert ? '#EF4444' : '#FF6B2B' }}>
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom: 16 }}>
                  <FocusGauge value={inst.avgFocus} />
                </div>

                {inst.avgFocus < 40 && (
                  <div style={{
                    padding: '8px 12px', background: '#FEF2F2', borderRadius: 8,
                    border: '1px solid #FECACA', fontSize: 12, color: '#DC2626',
                    marginBottom: 12, display: 'flex', gap: 6,
                  }}>
                    ⚠️ 집중도가 40% 미만입니다. 강의 점검이 필요합니다.
                  </div>
                )}

                <button
                  onClick={() => setMonitoringTarget(inst)}
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
              </>
            ) : (
              <div style={{ padding: '20px', textAlign: 'center', color: '#AAA', fontSize: 13 }}>
                현재 진행 중인 세션이 없습니다
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
