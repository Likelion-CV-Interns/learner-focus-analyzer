import { useState, useEffect, useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
// BarChart/Bar/Cell은 집중 상태 분포에서 계속 사용

const API = 'https://likelionfocus.duckdns.org';

const EMOTION_KR = {
  engagement: '집중', boredom: '지루함', confusion: '혼란',
  amused: '웃음', surprise: '놀람',
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

/** records → 1분 버킷 시계열 [{time, 집중도, 피로도}] (KST 시간순 오름차순)
 *  서버가 +09:00 timestamp를 반환하므로 new Date()가 KST로 정확히 파싱됨 */
function processTimeSeries(records) {
  if (!records.length) return [];
  const buckets = {};
  for (const r of records) {
    // timestamp 문자열에서 직접 시:분 추출 (형식: "YYYY-MM-DDTHH:MM:SS+09:00")
    const timePart = r.timestamp?.slice(11, 16); // "HH:MM"
    if (!timePart) continue;
    if (!buckets[timePart]) buckets[timePart] = { focus: [], fatigue: [] };
    if (r.focus_score != null)   buckets[timePart].focus.push(r.focus_score * 100);
    if (r.fatigue_score != null) buckets[timePart].fatigue.push(r.fatigue_score * 100);
  }
  const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))  // "HH:MM" 오름차순 정렬
    .map(([time, v]) => ({
      time,
      집중도: avg(v.focus),
      피로도: avg(v.fatigue),
    }));
}

/** records → 표정 레이더 차트 [{subject, key, A}] (비율 %) — 6각형 유지를 위해 전체 감정 포함 */
function processEmotions(records) {
  const counts = {};
  for (const r of records) {
    if (r.emotion) counts[r.emotion] = (counts[r.emotion] ?? 0) + 1;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(EMOTION_KR).map(([key, label]) => ({
    subject: label,
    key,
    A: Math.round(((counts[key] ?? 0) / total) * 100),
  }));
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

// ── 전체 리포트 (실제 DB 데이터) ──────────────────────────────────────────────

function ClassReport({ sessionId }) {
  const [records,    setRecords]    = useState([]);
  const [completion, setCompletion] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [aiFeedback, setAiFeedback] = useState(null);
  const [aiLoading,  setAiLoading]  = useState(false);
  const [aiError,    setAiError]    = useState('');

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    setAiFeedback(null);
    Promise.all([
      fetch(`${API}/api/sessions/${sessionId}/records?limit=2000`).then(r => r.json()),
      fetch(`${API}/api/sessions/${sessionId}/quiz-completion`).then(r => r.json()),
    ]).then(([recData, compData]) => {
      setRecords(recData.records ?? []);
      setCompletion(compData.completion ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [sessionId]);

  const timeSeries  = useMemo(() => processTimeSeries(records), [records]);
  const emotionData = useMemo(() => processEmotions(records),   [records]);

  // 실습 완료율 계산
  const quizStats = useMemo(() => {
    if (!completion.length) return null;
    const avgRate = Math.round(
      completion.reduce((sum, c) => sum + (c.total_quizzes > 0 ? (c.correct_count / c.total_quizzes) * 100 : 0), 0)
      / completion.length
    );
    return { avgRate, students: completion };
  }, [completion]);

  const handleAiFeedback = async () => {
    setAiLoading(true);
    setAiError('');
    try {
      const res = await fetch(`${API}/api/sessions/${sessionId}/ai-feedback`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail ?? 'AI 분석 실패');
      }
      setAiFeedback(await res.json());
    } catch (e) {
      setAiError(e.message);
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) return <Card><EmptyState message="데이터 불러오는 중..." /></Card>;
  if (records.length === 0) return <Card><EmptyState message="이 세션에 기록된 데이터가 없습니다." /></Card>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 시계열 집중도 */}
      <Card>
        <SectionTitle title="시계열 집중도 추이" sub="강의 시간 동안 전체 학습자의 집중도 및 피로도 변화" />
        {timeSeries.length < 2 ? (
          <EmptyState message="시계열 데이터가 부족합니다 (최소 2분 이상 필요)" />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={timeSeries} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
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
              <Area type="monotone" dataKey="집중도" stroke="#FF6B2B" fill="url(#gradFocus)"   strokeWidth={2.5} name="집중도 (%)" />
              <Area type="monotone" dataKey="피로도" stroke="#8B5CF6" fill="url(#gradFatigue)" strokeWidth={2}   name="피로도 (%)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* 표정 분석 */}
        <Card>
          <SectionTitle title="표정 분석 결과" sub="강의 중 전체 학습자의 표정 분포" />
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={emotionData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
              <PolarGrid stroke="#F0F0F0" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: '#555' }} />
              <Radar name="표정" dataKey="A" stroke="#FF6B2B" fill="#FF6B2B" fillOpacity={0.3} strokeWidth={2} />
              <Tooltip formatter={v => [`${v}%`, '비율']} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            </RadarChart>
          </ResponsiveContainer>
        </Card>

        {/* 실습 완료율 */}
        <Card>
          <SectionTitle title="실습 완료율" sub="학습자별 퀴즈 정답 완료율" />
          {!quizStats ? (
            <EmptyState message="퀴즈 데이터 없음" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {/* 전체 평균 */}
              <div style={{ textAlign: 'center', padding: '12px 0 16px' }}>
                <div style={{ fontSize: 36, fontWeight: 800, color: quizStats.avgRate >= 70 ? '#22C55E' : quizStats.avgRate >= 40 ? '#F59E0B' : '#EF4444' }}>
                  {quizStats.avgRate}%
                </div>
                <div style={{ fontSize: 12, color: '#AAA', marginTop: 2 }}>전체 평균 완료율</div>
              </div>
              {/* 학습자별 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 160, overflowY: 'auto' }}>
                {quizStats.students.map(s => {
                  const rate = s.total_quizzes > 0 ? Math.round((s.correct_count / s.total_quizzes) * 100) : 0;
                  return (
                    <div key={s.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ fontSize: 12, color: '#555', width: 70, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.name ?? s.user_id.slice(0, 6)}
                      </div>
                      <div style={{ flex: 1, height: 6, background: '#F0F0F0', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${rate}%`, background: rate >= 70 ? '#22C55E' : rate >= 40 ? '#F59E0B' : '#EF4444', borderRadius: 4 }} />
                      </div>
                      <div style={{ fontSize: 11, color: '#888', width: 32, textAlign: 'right', flexShrink: 0 }}>{rate}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* AI 총평 */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <SectionTitle title="AI 강의 총평" sub="실제 집중도 데이터를 기반으로 Gemini가 생성한 강의 피드백" />
          <button
            onClick={handleAiFeedback}
            disabled={aiLoading}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 12,
              background: aiLoading ? '#FFD0B8' : 'linear-gradient(135deg, #FF6B2B, #FF8C55)',
              color: '#fff', fontWeight: 700, cursor: aiLoading ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            {aiLoading ? '분석 중...' : aiFeedback ? '재분석' : '🤖 AI 분석 시작'}
          </button>
        </div>

        {aiError && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#DC2626', marginBottom: 12 }}>
            {aiError}
          </div>
        )}

        {!aiFeedback && !aiLoading && !aiError && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#CCC', fontSize: 13 }}>
            AI 분석 시작 버튼을 눌러 강의 총평을 받아보세요
          </div>
        )}

        {aiLoading && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#AAA', fontSize: 13 }}>
            Gemini가 데이터를 분석하고 있습니다...
          </div>
        )}

        {aiFeedback && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* 요약 수치 */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
              {[
                { label: '평균 집중도', value: `${aiFeedback.avg_focus}%`, color: '#FF6B2B' },
                { label: '평균 피로도', value: `${aiFeedback.avg_fatigue}%`, color: '#8B5CF6' },
                { label: '참여 학생', value: `${aiFeedback.student_count}명`, color: '#3B82F6' },
                { label: '퀴즈 완료율', value: `${aiFeedback.avg_completion}%`, color: '#22C55E' },
              ].map(item => (
                <div key={item.label} style={{ flex: 1, background: '#FAFAFA', borderRadius: 10, padding: '10px 12px', textAlign: 'center', border: '1px solid #EEE' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: item.color }}>{item.value}</div>
                  <div style={{ fontSize: 10, color: '#AAA', marginTop: 2 }}>{item.label}</div>
                </div>
              ))}
            </div>
            {/* 피드백 항목 */}
            <div style={{ background: 'linear-gradient(135deg, #FFF5F0, #FFF8F5)', borderRadius: 12, padding: 20, border: '1px solid #FFD5C0' }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 20 }}>🤖</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#FF6B2B' }}>Gemini AI 분석 리포트</span>
              </div>
              {aiFeedback.feedback.map((text, i) => (
                <div key={i} style={{ fontSize: 13, color: '#444', lineHeight: 1.75, marginBottom: i < aiFeedback.feedback.length - 1 ? 14 : 0, paddingLeft: 14, borderLeft: '3px solid #FFD5C0' }}>
                  {text}
                </div>
              ))}
            </div>
          </div>
        )}
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
            <SectionTitle title="시계열 집중도 추이" sub="현재 강의 시간별 집중도 및 피로도" />
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
              <SectionTitle title="표정 분석 결과" sub="강의 중 감지된 표정 분포" />
              {emotionData.every(d => d.A === 0) ? (
                <EmptyState message="표정 데이터 없음" />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <RadarChart data={emotionData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                    <PolarGrid stroke="#F0F0F0" />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: '#555' }} />
                    <Radar name="표정" dataKey="A" stroke="#FF6B2B" fill="#FF6B2B" fillOpacity={0.3} strokeWidth={2} />
                    <Tooltip formatter={v => [`${v}%`, '비율']} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  </RadarChart>
                </ResponsiveContainer>
              )}
            </Card>

            {/* 집중 상태 분포 */}
            <Card>
              <SectionTitle title="집중 상태 분포" sub="강의 중 감지된 집중 상태 비율" />
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

export default function TotalEvaluation({ isManager = false }) {
  const [instructors,          setInstructors]          = useState([]);
  const [selectedInstructorId, setSelectedInstructorId] = useState('');

  const [sessions,          setSessions]          = useState([]);
  const [sessionsLoading,   setSessionsLoading]   = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [viewMode,          setViewMode]          = useState('class');

  // 개별 리포트용: 세션 참여자 목록 (from summary)
  const [sessionUsers,    setSessionUsers]    = useState([]);  // [{user_id, name, avg_focus, avg_fatigue}]
  const [summaryLoading,  setSummaryLoading]  = useState(false);
  const [selectedUserId,  setSelectedUserId]  = useState('');

  // ── 매니저: 강의자 목록 fetch ──
  useEffect(() => {
    if (!isManager) return;
    fetch(`${API}/api/instructors`)
      .then(r => r.json())
      .then(d => {
        const list = d.instructors ?? [];
        setInstructors(list);
        if (list.length) setSelectedInstructorId(list[0].instructor_id);
      })
      .catch(() => {});
  }, [isManager]);

  // ── 세션 목록 fetch ──
  useEffect(() => {
    if (isManager && !selectedInstructorId) return;
    setSessionsLoading(true);
    const url = isManager
      ? `${API}/api/sessions?instructor_id=${selectedInstructorId}`
      : `${API}/api/sessions`;
    fetch(url)
      .then(r => r.json())
      .then(d => {
        const list = d.sessions ?? [];
        setSessions(list);
        setSelectedSessionId(list.length ? list[0].session_id : '');
        setSessionsLoading(false);
      })
      .catch(() => setSessionsLoading(false));
  }, [isManager, selectedInstructorId]);

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

      {/* 강의자 탭 (매니저 전용) */}
      {isManager && instructors.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {instructors.map(inst => {
            const isSelected = selectedInstructorId === inst.instructor_id;
            return (
              <button
                key={inst.instructor_id}
                onClick={() => setSelectedInstructorId(inst.instructor_id)}
                style={{
                  padding: '8px 18px', borderRadius: 20, cursor: 'pointer',
                  border: isSelected ? '2px solid #FF6B2B' : '1.5px solid #E0E0E0',
                  background: isSelected ? '#FFF5F0' : '#fff',
                  color: isSelected ? '#FF6B2B' : '#555',
                  fontWeight: isSelected ? 700 : 500,
                  fontSize: 13,
                  boxShadow: isSelected ? '0 2px 8px rgba(255,107,43,0.15)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {inst.name}
              </button>
            );
          })}
        </div>
      )}

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
        <ClassReport sessionId={selectedSessionId} />
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
