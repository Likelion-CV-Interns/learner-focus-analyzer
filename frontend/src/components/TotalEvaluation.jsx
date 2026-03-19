import { useState, useMemo } from 'react';

// 매니저 화면에서 사용할 강의자 목록 (ManagerDashboard와 동일)
const INSTRUCTORS = [
  { id: 'teacher1', name: '김강사', course: 'Python 기초' },
  { id: 'teacher2', name: '이강사', course: '알고리즘' },
  { id: 'teacher3', name: '박강사', course: '머신러닝' },
];
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  STUDENTS, LECTURES,
  generateLectureFocusSeries,
  generateDayByDayData,
  generateExpressionData,
  AI_FEEDBACK,
} from '../utils/mockData';

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
      background: '#fff',
      borderRadius: 16,
      padding: '20px 24px',
      border: '1.5px solid #EEE',
      boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
      ...style,
    }}>
      {children}
    </div>
  );
}

function ClassReport({ lectureId }) {
  const focusSeries = useMemo(generateLectureFocusSeries, [lectureId]);
  const expressionData = useMemo(generateExpressionData, [lectureId]);

  const practiceData = STUDENTS.map(s => ({
    name: s.name,
    완료: Math.random() > 0.35 ? 100 : Math.round(30 + Math.random() * 60),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Time series focus */}
      <Card>
        <SectionTitle title="시계열 집중도 추이" sub="강의 시간 동안 전체 학습자의 집중도 및 피로도 변화" />
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={focusSeries} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <defs>
              <linearGradient id="gradFocus" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#FF6B2B" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#FF6B2B" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradFatigue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#AAA' }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#AAA' }} />
            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="전체 집중도" stroke="#FF6B2B" fill="url(#gradFocus)" strokeWidth={2.5} name="집중도 (%)" />
            <Area type="monotone" dataKey="피로도" stroke="#8B5CF6" fill="url(#gradFatigue)" strokeWidth={2} name="피로도 (%)" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Expression radar */}
        <Card>
          <SectionTitle title="표정 분석 결과" sub="강의 중 감지된 학습자 표정 분포" />
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={expressionData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
              <PolarGrid stroke="#F0F0F0" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: '#555' }} />
              <Radar name="표정" dataKey="A" stroke="#FF6B2B" fill="#FF6B2B" fillOpacity={0.3} strokeWidth={2} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            </RadarChart>
          </ResponsiveContainer>
        </Card>

        {/* Practice completion */}
        <Card>
          <SectionTitle title="실습 완료율" sub="학습자별 실습 과제 완료 현황" />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={practiceData} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: '#AAA' }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#555' }} width={40} />
              <Tooltip
                formatter={(v) => [`${v}%`, '완료율']}
                contentStyle={{ borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="완료" fill="#FF6B2B" radius={[0, 4, 4, 0]}
                label={{ position: 'right', fontSize: 10, fill: '#888' }} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Survey summary */}
      <Card>
        <SectionTitle title="학습자 설문 결과" sub="강의 종료 후 학습자가 제출한 설문 요약" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { label: '강의 만족도', value: '4.2 / 5.0', icon: '⭐', color: '#F59E0B' },
            { label: '난이도', value: '보통', icon: '📈', color: '#3B82F6' },
            { label: '집중 체감', value: '76%', icon: '🎯', color: '#22C55E' },
          ].map(item => (
            <div key={item.label} style={{
              padding: 16, background: '#FFF8F5', borderRadius: 12,
              border: '1px solid #FFE8D8', textAlign: 'center',
            }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{item.icon}</div>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: item.color }}>{item.value}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* AI Feedback */}
      <Card>
        <SectionTitle title="AI 강의 총평" sub="집중도 데이터를 기반으로 생성된 강의 피드백" />
        <div style={{
          background: 'linear-gradient(135deg, #FFF5F0, #FFF8F5)',
          borderRadius: 12,
          padding: 20,
          border: '1px solid #FFD5C0',
        }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 22 }}>🤖</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#FF6B2B' }}>AI 분석 리포트</span>
          </div>
          {AI_FEEDBACK.map((text, i) => (
            <div key={i} style={{
              fontSize: 13,
              color: '#444',
              lineHeight: 1.7,
              marginBottom: i < AI_FEEDBACK.length - 1 ? 12 : 0,
              paddingLeft: 12,
              borderLeft: '3px solid #FFD5C0',
            }}>
              {text}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function StudentReport({ student }) {
  const dayData = useMemo(generateDayByDayData, [student.id]);
  const timeData = useMemo(generateLectureFocusSeries, [student.id]);
  const practiceData = LECTURES.map((lec, i) => ({
    name: `${i + 1}주차`,
    완료율: Math.random() > 0.3 ? Math.round(75 + Math.random() * 25) : Math.round(20 + Math.random() * 55),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Student info card */}
      <div style={{
        background: 'linear-gradient(135deg, #FF6B2B, #FF9A5C)',
        borderRadius: 16,
        padding: '20px 24px',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'rgba(255,255,255,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: 800,
        }}>
          {student.name[0]}
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{student.name}</div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>좌석: {student.seat} · 수강생</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Day by day */}
        <Card>
          <SectionTitle title="주차별 집중도 비교" sub="지난 강의와 현재 강의의 집중도 추이" />
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={dayData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#AAA' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#AAA' }} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="집중도" stroke="#FF6B2B" strokeWidth={2.5} dot={{ r: 4 }} name="집중도 (%)" />
              <Line type="monotone" dataKey="피로도" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 2" name="피로도 (%)" />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Practice completion */}
        <Card>
          <SectionTitle title="주차별 실습 완료율" sub="강의별 실습 과제 완료 여부" />
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={practiceData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#AAA' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#AAA' }} />
              <Tooltip formatter={(v) => [`${v}%`, '완료율']} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="완료율" fill="#FF6B2B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Current lecture time series */}
      <Card>
        <SectionTitle title="현재 강의 시계열 집중도" sub="이번 강의 시간별 학습자 집중도 및 피로도" />
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={timeData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <defs>
              <linearGradient id="sGradFocus" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#FF6B2B" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#FF6B2B" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#AAA' }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#AAA' }} />
            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="전체 집중도" stroke="#FF6B2B" fill="url(#sGradFocus)" strokeWidth={2.5} name="집중도 (%)" />
            <Line type="monotone" dataKey="피로도" stroke="#8B5CF6" strokeWidth={2} dot={false} name="피로도 (%)" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

export default function TotalEvaluation({ user }) {
  const isManager = user?.role === 'manager';

  // 매니저: 강의자 선택 → 강의 선택 드릴다운
  const [selectedInstructor, setSelectedInstructor] = useState(null);
  const [selectedLecture, setSelectedLecture] = useState(LECTURES[LECTURES.length - 1].id);
  const [viewMode, setViewMode] = useState('class');
  const [selectedStudent, setSelectedStudent] = useState(STUDENTS[0]);

  // ── 매니저: 강의자 선택 화면 ──
  if (isManager && !selectedInstructor) {
    return (
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1A1A1A' }}>총 집중도 평가</h1>
          <p style={{ fontSize: 13, color: '#888', marginTop: 3 }}>강의자를 선택하면 강의별 리포트를 확인할 수 있습니다</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {INSTRUCTORS.map(inst => (
            <button
              key={inst.id}
              onClick={() => setSelectedInstructor(inst)}
              style={{
                background: '#fff', borderRadius: 16, padding: '24px',
                border: '1.5px solid #EEE', cursor: 'pointer', textAlign: 'left',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                transition: 'box-shadow 0.2s, border 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.border = '1.5px solid #FF6B2B'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(255,107,43,0.12)'; }}
              onMouseLeave={e => { e.currentTarget.style.border = '1.5px solid #EEE'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 14,
                  background: 'linear-gradient(135deg, #FF6B2B, #FF9A5C)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 20, fontWeight: 800,
                }}>
                  {inst.name[0]}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#1A1A1A' }}>{inst.name}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{inst.course}</div>
                </div>
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', background: '#FFF5F0', borderRadius: 10,
                border: '1px solid #FFE0D0',
              }}>
                <span style={{ fontSize: 12, color: '#888' }}>강의 {LECTURES.length}개 기록</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#FF6B2B' }}>리포트 보기 →</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── 공통: 리포트 화면 (강의자 선택 후 or 강의자 본인) ──
  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        {isManager && (
          <button
            onClick={() => setSelectedInstructor(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8,
              background: '#F5F5F5', border: '1.5px solid #E0E0E0',
              fontSize: 13, fontWeight: 600, color: '#555', cursor: 'pointer',
            }}
          >
            ← 강의자 목록
          </button>
        )}
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1A1A1A' }}>
            총 집중도 평가
            {isManager && selectedInstructor && (
              <span style={{ fontSize: 15, fontWeight: 600, color: '#FF6B2B', marginLeft: 10 }}>
                · {selectedInstructor.name}
              </span>
            )}
          </h1>
          <p style={{ fontSize: 13, color: '#888', marginTop: 3 }}>강의별 학습자 집중도 종합 리포트</p>
        </div>
      </div>

      {/* Controls */}
      <div style={{
        background: '#fff', borderRadius: 16, padding: '16px 20px',
        border: '1.5px solid #EEE', marginBottom: 20,
        display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap',
        boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>강의 선택</label>
          <select
            value={selectedLecture}
            onChange={e => setSelectedLecture(e.target.value)}
            style={{
              padding: '8px 12px', borderRadius: 8,
              border: '1.5px solid #E8E8E8', fontSize: 13,
              color: '#1A1A1A', background: '#FAFAFA', cursor: 'pointer',
            }}
          >
            {LECTURES.map(lec => (
              <option key={lec.id} value={lec.id}>{lec.name} ({lec.date})</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { key: 'class',      label: '🏫 전체 리포트' },
            { key: 'individual', label: '👤 개별 리포트' },
          ].map(v => (
            <button
              key={v.key}
              onClick={() => setViewMode(v.key)}
              style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 13,
                fontWeight: viewMode === v.key ? 700 : 500,
                background: viewMode === v.key ? '#FF6B2B' : '#F5F5F5',
                color: viewMode === v.key ? '#fff' : '#555',
                border: 'none',
              }}
            >
              {v.label}
            </button>
          ))}
        </div>

        {viewMode === 'individual' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>학습자 선택</label>
            <select
              value={selectedStudent.id}
              onChange={e => setSelectedStudent(STUDENTS.find(s => s.id === Number(e.target.value)))}
              style={{
                padding: '8px 12px', borderRadius: 8,
                border: '1.5px solid #E8E8E8', fontSize: 13,
                color: '#1A1A1A', background: '#FAFAFA', cursor: 'pointer',
              }}
            >
              {STUDENTS.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.seat})</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {viewMode === 'class'
        ? <ClassReport lectureId={selectedLecture} />
        : <StudentReport student={selectedStudent} />
      }
    </div>
  );
}
