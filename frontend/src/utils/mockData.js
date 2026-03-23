export const STUDENTS = [
  { id: 1, name: "강지윤", seat: "A-1" },
  { id: 2, name: "이서연", seat: "A-2" },
  { id: 3, name: "박지호", seat: "A-3" },
  { id: 4, name: "최유나", seat: "B-1" },
  { id: 5, name: "정우진", seat: "B-2" },
  { id: 6, name: "한소희", seat: "B-3" },
  { id: 7, name: "윤도현", seat: "C-1" },
  { id: 8, name: "장미래", seat: "C-2" },
  { id: 9, name: "임준서", seat: "C-3" },
  { id: 10, name: "신채원", seat: "D-1" },
  { id: 11, name: "오세훈", seat: "D-2" },
  { id: 12, name: "배수지", seat: "D-3" },
];

export const STATUS_CONFIG = {
  focused:    { label: "집중",      color: "#22C55E", bg: "#F0FDF4" },
  focusing:   { label: "집중 시작", color: "#84CC16", bg: "#F7FEE7" },
  distracted: { label: "딴짓",      color: "#F59E0B", bg: "#FFFBEB" },
  drowsy:     { label: "졸음",      color: "#EF4444", bg: "#FEF2F2" },
  phone:      { label: "핸드폰",    color: "#8B5CF6", bg: "#F5F3FF" },
};

export function generateStudentState(id) {
  const rand = Math.random();
  let status;
  if (rand < 0.55) status = "focused";
  else if (rand < 0.75) status = "distracted";
  else if (rand < 0.90) status = "drowsy";
  else status = "phone";

  const focusBase = status === "focused" ? 70 + Math.random() * 28 :
                    status === "distracted" ? 35 + Math.random() * 30 :
                    status === "drowsy" ? 10 + Math.random() * 25 :
                    20 + Math.random() * 20;

  return {
    id,
    status,
    focusScore: Math.round(focusBase),
    fatigueScore: Math.round(Math.random() * 80),
    eyeBlink: Math.round(10 + Math.random() * 30),
    expression: randomExpression(),
    lastUpdate: new Date(),
  };
}

function randomExpression() {
  const options = ["중립", "지루함", "웃음", "혼란", "집중"];
  return options[Math.floor(Math.random() * options.length)];
}

// Time-series data for real-time (last 20 data points, 30s intervals)
export function generateTimeSeries(points = 20) {
  const now = Date.now();
  return Array.from({ length: points }, (_, i) => {
    const t = new Date(now - (points - 1 - i) * 30000);
    return {
      time: `${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')}:${t.getSeconds().toString().padStart(2,'0')}`,
      focus: Math.round(45 + Math.sin(i * 0.4) * 18 + Math.random() * 10),
      fatigue: Math.round(30 + i * 1.2 + Math.random() * 8),
    };
  });
}

// Historical lecture data (for total evaluation)
export const LECTURES = [
  { id: "L001", name: "1주차 - Python 기초", date: "2025-03-03", duration: "3시간" },
  { id: "L002", name: "2주차 - 자료구조", date: "2025-03-10", duration: "3시간" },
  { id: "L003", name: "3주차 - 알고리즘", date: "2025-03-17", duration: "3시간" },
  { id: "L004", name: "4주차 - 머신러닝 입문", date: "2025-03-24", duration: "3시간" },
];

export function generateLectureFocusSeries() {
  return Array.from({ length: 18 }, (_, i) => ({
    time: `${9 + Math.floor(i * 10 / 60)}:${((i * 10) % 60).toString().padStart(2,'0')}`,
    "전체 집중도": Math.round(60 + Math.sin(i * 0.5) * 20 + Math.random() * 8 - i * 0.8),
    "피로도": Math.round(20 + i * 2.5 + Math.random() * 5),
  }));
}

export function generateDayByDayData() {
  return LECTURES.map((lec, i) => ({
    name: `${i + 1}주차`,
    집중도: Math.round(55 + Math.random() * 30),
    피로도: Math.round(25 + i * 5 + Math.random() * 10),
  }));
}

export function generateExpressionData() {
  return [
    { subject: "집중", A: Math.round(50 + Math.random() * 40), fullMark: 100 },
    { subject: "지루함", A: Math.round(10 + Math.random() * 30), fullMark: 100 },
    { subject: "혼란", A: Math.round(5 + Math.random() * 25), fullMark: 100 },
    { subject: "졸음", A: Math.round(5 + Math.random() * 20), fullMark: 100 },
    { subject: "즐거움", A: Math.round(20 + Math.random() * 35), fullMark: 100 },
    { subject: "중립", A: Math.round(15 + Math.random() * 35), fullMark: 100 },
  ];
}

export const AI_FEEDBACK = [
  "이번 강의에서 학습자들의 평균 집중도는 전반적으로 양호한 수준을 유지했습니다. 특히 강의 초반 30분 동안 집중도가 높게 나타났으나, 90분 이후부터 피로도가 상승하며 집중도가 점진적으로 하락하는 패턴이 관찰되었습니다.",
  "전체 학습자 중 약 3명의 학습자가 반복적으로 집중도 저하 상태를 보였습니다. 개별 면담 또는 추가 학습 자료 제공을 권장합니다.",
  "다음 강의 시 90분 경과 시점에 5~10분의 휴식 시간 또는 퀴즈 활동을 삽입하는 것을 추천합니다. 이는 학습자들의 피로도 관리에 효과적일 것으로 예측됩니다.",
];
