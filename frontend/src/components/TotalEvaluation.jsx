import { useState, useEffect, useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const EMOTION_COLORS = {
  engagement: '#FF6B2B', boredom: '#8B5CF6', confusion: '#F59E0B',
  amused:     '#22C55E', surprise: '#3B82F6', neutral:   '#94A3B8',
};
import {
  generateLectureFocusSeries,
  generateExpressionData,
  AI_FEEDBACK,
} from '../utils/mockData';

const API = 'http://34.10.223.135:8000';

const EMOTION_KR = {
  engagement: '집중', boredom: '지루함', confusion: '혼란',
  amused: '웃음', surprise: '놀람', neutral: '중립',
};

const STATUS_KR = {
  focused: '집중', focusing: '집중 시작', distracted: '딴짓',
  drowsy: '졸음', uncertain: '감지 중', phone: '핸드폰',
};

const STATUS_COLORS = {
  focused: '#22C55E', focusing: '#84CC16', distracted: '#F59E0B',
  drowsy: '#EF4444', uncertain: '#94A3B8', phone: '#8B5CF6',
};

// ── 데이터 가공 헬퍼 ────────────────────────────────────────────────────────────

/** records → 1분 버킷 시계열 [{time, 집중도, 피로도}] */
function processTimeSeries(records) {
  if (!records.length) return [];
  const buckets = {};
  for (const r of records) {
    const d = new Date(r.timestamp);
    const key = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (!buckets[key]) buckets[key] = { focus: [], fatigue: [] };
    if (r.focus_score != null)   buckets[key].focus.push(r.focus_score * 100);
    if (r.fatigue_score != null) buckets[key].fatigue.push(r.fatigue_score * 100);
  }
  const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
  return Object.entries(buckets).map(([time, v]) => ({
    time,
    집중도: avg(v.focus),
    피로도: avg(v.fatigue),
  }));
}

/** records → 표정 바 차트 [{subject, key, A}] (비율 %) */
function processEmotions(records) {
  const counts = {};
  for (const r of records) {
    if (r.emotion) counts[r.emotion] = (counts[r.emotion] ?? 0) + 1;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(EMOTION_KR)
    .map(([key, label]) => ({
      subject: label,
      key,
      A: Math.round(((counts[key] ?? 0) / total) * 100),
    }))
    .filter(d => d.A > 0)  // 0%인 감정은 제외해 차트를 간결하게
    .sort((a, b) => b.A - a.A);
}

/** records → 집중 상태 분포 [{name, 비율, color}] */
function processStatusDist(records) {
  const counts = {};
  for (const r of records) {
    if (r.status) counts[r.status] = (counts[r.status] ?? 0) + 1;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  return Object.keys(STATUS_KR)
    .filter(k => counts[k])
    .map(key => ({
      name:  STATUS_KR[key],
      비율:  Math.round(((counts[key] ?? 0) / total) * 100),
      color: STATUS_COLORS[key],
    }));
}

// ── 공통 UI ────────────────────────────────────────────────────────────────────

function SectionTitle({ title, sub }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1A1A1A' }}>{title}</h2>
      {sub && <p style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{sub}</p>}
    </div>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: '20px 24px',
      border: '1.5px solid #EEE', boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
      ...style,
    }}>
      {children}
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 0', color: '#AAA', fontSize: 14 }}>
      {message}
    </div>
  );
}

// ── 전체 리포트 (mock 유지) ─────────────────────────────────────────────────────

function ClassReport() {
  const focusSeries   = useMemo(generateLectureFocusSeries, []);
  const expressionData = useMemo(generateExpressionData, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card>
        <SectionTitle title="시계열 집중도 추이" sub="강의 시간 동안 전체 학습자의 집중도 및 피로도 변화 (데모)" />
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={focusSeries} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <defs>
              <linearGradient id="gradFocus" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#FF6B2B" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#FF6B2B" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradFatigue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#8B5CF6" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#AAA' }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#AAA' }} />
            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="전체 집중도" stroke="#FF6B2B" fill="url(#gradFocus)" strokeWidth={2.5} name="집중도 (%)" />
            <Area type="monotone" dataKey="피로도"     stroke="#8B5CF6" fill="url(#gradFatigue)" strokeWidth={2} name="피로도 (%)" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card>
          <SectionTitle title="표정 분석 결과" sub="강의 중 감지된 학습자 표정 분포 (데모)" />
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={expressionData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
              <PolarGrid stroke="#F0F0F0" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: '#555' }} />
              <Radar name="표정" dataKey="A" stroke="#FF6B2B" fill="#FF6B2B" fillOpacity={0.3} strokeWidth={2} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            </RadarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <SectionTitle title="실습 완료율" sub="학습자별 실습 과제 완료 현황 (데모)" />
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: 180, color: '#CCC', fontSize: 13, flexDirection: 'column', gap: 8,
          }}>
            <span style={{ fontSize: 32 }}>🚧</span>
            <span>실습 완료율 연동 준비 중</span>
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle title="AI 강의 총평" sub="집중도 데이터를 기반으로 생성된 강의 피드백 (데모)" />
        <div style={{
          background: 'linear-gradient(135deg, #FFF5F0, #FFF8F5)',
          borderRadius: 12, padding: 20, border: '1px solid #FFD5C0',
        }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 22 }}>🤖</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#FF6B2B' }}>AI 분석 리포트</span>
          </div>
          {AI_FEEDBACK.map((text, i) => (
            <div key={i} style={{
              fontSize: 13, color: '#444', lineHeight: 1.7,
              marginBottom: i < AI_FEEDBACK.length - 1 ? 12 : 0,
              paddingLeft: 12, borderLeft: '3px solid #FFD5C0',
            }}>
              {text}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── 개별 리포트 (실제 DB 데이터) ──────────────────────────────────────────────

function StudentReport({ sessionId, userId, userName, avgFocus, avgFatigue }) {
  const [records, setRecords]   = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!sessionId || !userId) return;
    setLoading(true);
    fetch(`${API}/api/sessions/${sessionId}/users/${userId}/records?limit=500`)
      .then(r => r.json())
      .then(d => { setRecords(d.records ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [sessionId, userId]);

  const timeSeries  = useMemo(() => processTimeSeries(records), [records]);
  const emotionData = useMemo(() => processEmotions(records),   [records]);
  const statusData  = useMemo(() => processStatusDist(records), [records]);

  const focusPct   = avgFocus   != null ? Math.round(avgFocus   * 100) : null;
  const fatiguePct = avgFatigue != null ? Math.round(avgFatigue * 100) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 학습자 정보 헤더 */}
      <div style={{
        background: 'linear-gradient(135deg, #FF6B2B, #FF9A5C)',
        borderRadius: 16, padding: '20px 24px', color: '#fff',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'rgba(255,255,255,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: 800,
        }}>
          {(userName ?? '?')[0]}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{userName ?? '알 수 없음'}</div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>학습자 · {records.length}개 기록</div>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          {[
            { label: '평균 집중도', value: focusPct != null ? `${focusPct}%` : '-', color: '#fff' },
            { label: '평균 피로도', value: fatiguePct != null ? `${fatiguePct}%` : '-', color: '#FFE0D0' },
          ].map(item => (
            <div key={item.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: item.color }}>{item.value}</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <Card><EmptyState message="데이터 불러오는 중..." /></Card>
      ) : records.length === 0 ? (
        <Card><EmptyState message="이 세션에서 해당 학습자의 기록이 없습니다." /></Card>
      ) : (
        <>
          {/* 시계열 집중도 */}
          <Card>
            <SectionTitle title="시계열 집중도 추이" sub="현재 강의 시간별 집중도 및 피로도 (실제 데이터)" />
            {timeSeries.length < 2 ? (
              <EmptyState message="시계열 데이터가 부족합니다 (최소 2분 이상 필요)" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={timeSeries} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <defs>
                    <linearGradient id="sGradF" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#FF6B2B" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#FF6B2B" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="sGradFt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#8B5CF6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#AAA' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#AAA' }} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="집중도" stroke="#FF6B2B" fill="url(#sGradF)"  strokeWidth={2.5} name="집중도 (%)" />
                  <Area type="monotone" dataKey="피로도" stroke="#8B5CF6" fill="url(#sGradFt)" strokeWidth={2}   name="피로도 (%)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* 표정 분석 */}
            <Card>
              <SectionTitle title="표정 분석 결과" sub="강의 중 감지된 표정 분포 (실제 데이터)" />
              {emotionData.length === 0 ? (
                <EmptyState message="표정 데이터 없음" />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={emotionData}
                    layout="vertical"
                    margin={{ top: 5, right: 50, bottom: 5, left: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: '#AAA' }}
                           tickFormatter={v => `${v}%`} />
                    <YAxis dataKey="subject" type="category" tick={{ fontSize: 11, fill: '#555' }} width={40} />
                    <Tooltip
                      formatter={(v) => [`${v}%`, '비율']}
                      contentStyle={{ borderRadius: 8, fontSize: 12 }}
                    />
                    <Bar dataKey="A" radius={[0, 4, 4, 0]}
                         label={{ position: 'right', fontSize: 11, fill: '#888', formatter: v => `${v}%` }}>
                      {emotionData.map((entry, i) => (
                        <Cell key={i} fill={EMOTION_COLORS[entry.key] ?? '#CCC'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            {/* 집중 상태 분포 */}
            <Card>
              <SectionTitle title="집중 상태 분포" sub="강의 중 감지된 집중 상태 비율 (실제 데이터)" />
              {statusData.length === 0 ? (
                <EmptyState message="상태 데이터 없음" />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={statusData} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 50 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: '#AAA' }}
                           tickFormatter={v => `${v}%`} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#555' }} width={50} />
                    <Tooltip
                      formatter={(v) => [`${v}%`, '비율']}
                      contentStyle={{ borderRadius: 8, fontSize: 12 }}
                    />
                    <Bar dataKey="비율" radius={[0, 4, 4, 0]}
                         label={{ position: 'right', fontSize: 10, fill: '#888', formatter: v => `${v}%` }}>
                      {statusData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────

export default function TotalEvaluation() {
  const [sessions,          setSessions]          = useState([]);
  const [sessionsLoading,   setSessionsLoading]   = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [viewMode,          setViewMode]          = useState('class');

  // 개별 리포트용: 세션 참여자 목록 (from summary)
  const [sessionUsers,    setSessionUsers]    = useState([]);  // [{user_id, name, avg_focus, avg_fatigue}]
  const [summaryLoading,  setSummaryLoading]  = useState(false);
  const [selectedUserId,  setSelectedUserId]  = useState('');

  // ── 세션 목록 fetch ──
  useEffect(() => {
    fetch(`${API}/api/sessions`)
      .then(r => r.json())
      .then(d => {
        const list = d.sessions ?? [];
        setSessions(list);
        if (list.length) setSelectedSessionId(list[0].session_id);
        setSessionsLoading(false);
      })
      .catch(() => setSessionsLoading(false));
  }, []);

  // ── 세션 변경 시 참여자 요약 fetch ──
  useEffect(() => {
    if (!selectedSessionId) return;
    setSummaryLoading(true);
    setSessionUsers([]);
    setSelectedUserId('');
    fetch(`${API}/api/sessions/${selectedSessionId}/summary`)
      .then(r => r.json())
      .then(d => {
        const users = d.users ?? [];
        setSessionUsers(users);
        if (users.length) setSelectedUserId(users[0].user_id);
        setSummaryLoading(false);
      })
      .catch(() => setSummaryLoading(false));
  }, [selectedSessionId]);

  const selectedUser = sessionUsers.find(u => u.user_id === selectedUserId) ?? null;

  const sessionName = sessions.find(s => s.session_id === selectedSessionId)?.name ?? '';

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1A1A1A' }}>총 집중도 평가</h1>
        <p style={{ fontSize: 13, color: '#888', marginTop: 3 }}>강의별 학습자 집중도 종합 리포트</p>
      </div>

      {/* Controls */}
      <div style={{
        background: '#fff', borderRadius: 16, padding: '16px 20px',
        border: '1.5px solid #EEE', marginBottom: 20,
        display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap',
        boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
      }}>
        {/* 강의 선택 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#555', whiteSpace: 'nowrap' }}>강의 선택</label>
          {sessionsLoading ? (
            <span style={{ fontSize: 13, color: '#AAA' }}>불러오는 중...</span>
          ) : sessions.length === 0 ? (
            <span style={{ fontSize: 13, color: '#AAA' }}>세션 없음</span>
          ) : (
            <select
              value={selectedSessionId}
              onChange={e => setSelectedSessionId(e.target.value)}
              style={{
                padding: '8px 12px', borderRadius: 8,
                border: '1.5px solid #E8E8E8', fontSize: 13,
                color: '#1A1A1A', background: '#FAFAFA', cursor: 'pointer',
              }}
            >
              {sessions.map(s => (
                <option key={s.session_id} value={s.session_id}>
                  {s.name} ({s.created_at?.replace('T', ' ').slice(5, 16) ?? ''})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* 뷰 모드 */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { key: 'class',      label: '🏫 전체 리포트' },
            { key: 'individual', label: '👤 개별 리포트' },
          ].map(v => (
            <button
              key={v.key}
              onClick={() => setViewMode(v.key)}
              style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 13, border: 'none',
                fontWeight: viewMode === v.key ? 700 : 500,
                background: viewMode === v.key ? '#FF6B2B' : '#F5F5F5',
                color: viewMode === v.key ? '#fff' : '#555',
                cursor: 'pointer',
              }}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* 개별 리포트: 학습자 선택 */}
        {viewMode === 'individual' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#555', whiteSpace: 'nowrap' }}>학습자 선택</label>
            {summaryLoading ? (
              <span style={{ fontSize: 13, color: '#AAA' }}>불러오는 중...</span>
            ) : sessionUsers.length === 0 ? (
              <span style={{ fontSize: 13, color: '#AAA' }}>이 세션에 참여자 없음</span>
            ) : (
              <select
                value={selectedUserId}
                onChange={e => setSelectedUserId(e.target.value)}
                style={{
                  padding: '8px 12px', borderRadius: 8,
                  border: '1.5px solid #E8E8E8', fontSize: 13,
                  color: '#1A1A1A', background: '#FAFAFA', cursor: 'pointer',
                }}
              >
                {sessionUsers.map(u => (
                  <option key={u.user_id} value={u.user_id}>
                    {u.name ?? u.user_id.slice(0, 8)} (집중도 {u.avg_focus != null ? `${Math.round(u.avg_focus * 100)}%` : '-'})
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {/* 강의명 표시 */}
      {sessionName && (
        <div style={{
          fontSize: 13, color: '#FF6B2B', fontWeight: 600,
          marginBottom: 16, paddingLeft: 4,
        }}>
          📚 {sessionName}
        </div>
      )}

      {/* 리포트 본문 */}
      {viewMode === 'class' ? (
        <ClassReport />
      ) : (
        selectedUserId && selectedUser ? (
          <StudentReport
            sessionId={selectedSessionId}
            userId={selectedUserId}
            userName={selectedUser.name}
            avgFocus={selectedUser.avg_focus}
            avgFatigue={selectedUser.avg_fatigue}
          />
        ) : (
          <Card>
            <EmptyState message={summaryLoading ? '데이터 불러오는 중...' : '이 세션에 참여자 기록이 없습니다.'} />
          </Card>
        )
      )}
    </div>
  );
}
