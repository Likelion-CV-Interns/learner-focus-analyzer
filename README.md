# 학습자 집중도 실시간 분석 시스템

> 웹캠 하나로 교실 전체의 집중 상태를 실시간으로 파악하고, 강의자가 적시에 개입할 수 있도록 돕는 AI 기반 학습 모니터링 플랫폼

<!-- 📸 이미지: 전체 시스템 구조도 (학습자 → 감지 → 서버 → 대시보드 흐름 다이어그램) -->

---

## 목차

- [프로젝트 개요](#프로젝트-개요)
- [주요 기능](#주요-기능)
- [시스템 아키텍처](#시스템-아키텍처)
- [기술 스택](#기술-스택)
- [디렉토리 구조](#디렉토리-구조)
- [측정 지표 설명](#측정-지표-설명)
- [알림 정책](#알림-정책)

---

## 프로젝트 개요

교육 현장에서 강의자는 다수의 학습자를 동시에 파악하기 어렵습니다.
이 시스템은 학습자의 웹캠 영상을 AI로 분석하여 **집중도, 피로도, 표정, 졸음, 핸드폰 사용** 여부를 실시간으로 감지하고, 강의자 대시보드에 즉각 전달합니다.

| 역할 | 설명 |
|------|------|
| **학습자** | 웹캠을 통해 집중도가 측정되며, 본인의 상태를 실시간으로 확인 |
| **강의자** | 전체 학습자의 집중 상태를 실시간 모니터링, 세션 종료 후 리포트 확인 |
| **매니저** | 여러 강의자의 세션을 동시에 관리 및 모니터링 |

---

## 주요 기능

### 학습자 화면

<!-- 📸 이미지: 학습자 MonitorPage 화면 캡처 -->

- 웹캠 기반 실시간 집중도 측정
- 집중도 점수, 피로도, 눈 깜빡임, 표정 이모지 실시간 표시
- 로컬 분석 + Colab GPU 서버 병렬 추론

### 강의자 대시보드 — 실시간 모니터링

<!-- 📸 이미지: RealTimeMonitor 화면 캡처 (학습자 카드 그리드 + 집중도 추이 그래프) -->

- 학습자별 상태 카드 (집중 / 딴짓 / 졸음 / 핸드폰 / 집중 시작)
- 전체 집중도 추이 시계열 그래프
- 졸음·핸드폰 감지 시 즉시 토스트 알림 (쿨다운 적용)
- 전체 집중도 저하·지루함·피로 비율 임계치 초과 시 클래스 알림

### 총 집중도 평가 리포트

<!-- 📸 이미지: TotalEvaluation 화면 캡처 (세션 비교 차트 + 표정 분포 + AI 피드백) -->

- 세션별 집중도·피로도 추이 비교
- 표정 분포 레이더 차트
- 학습자별 평균 집중도 순위
- AI 기반 강의 개선 코멘트

### 매니저 대시보드

<!-- 📸 이미지: ManagerDashboard 화면 캡처 (강의자 탭 + 라이브 세션 카드) -->

- 강의자별 탭으로 라이브 세션 현황 확인
- 진행 중인 세션 실시간 모니터링 진입

---

## 시스템 아키텍처

```
[학습자 PC]
  웹캠 → MediaPipe 로컬 분석
       → Colab GPU 서버 (표정 분류)
       → WebSocket 전송
              ↓
[중계 서버 - FastAPI + PostgreSQL]
  /ws/client/{session_id}/{user_id}   ← 학습자 감지 클라이언트
  /ws/dashboard/{session_id}          ← 강의자/매니저 대시보드
              ↓
[강의자 / 매니저 프론트엔드 - React]
  실시간 대시보드 | 총 집중도 리포트
```

<!-- 📸 이미지: 위 아키텍처를 시각화한 다이어그램 -->

---

## 기술 스택

### AI / 감지

| 항목 | 내용 |
|------|------|
| 얼굴 랜드마크 | MediaPipe FaceLandmarker (52 blendshape → 82 피처 엔지니어링) |
| 표정 분류 | RandomForest 5-class (`집중 / 지루함 / 혼란 / 웃음 / 놀람`) |
| 혼란 보정 | 2단계 Binary Classifier (`confusion_binary_clf`) |
| 졸음 감지 | EAR (Eye Aspect Ratio) 기반 눈 깜빡임 분석 |
| 핸드폰 감지 | YOLOv8 객체 탐지 |
| 시선 추정 | Iris 위치 기반 Gaze Yaw/Pitch |
| 머리 자세 | solvePnP Head Pose Estimation |
| GPU 추론 서버 | Google Colab + ngrok (공식 Python SDK) |

### 백엔드

| 항목 | 내용 |
|------|------|
| 서버 프레임워크 | FastAPI + uvicorn |
| 실시간 통신 | WebSocket (자동 재연결, Ping-Pong keepalive) |
| 데이터베이스 | PostgreSQL (psycopg2 ThreadedConnectionPool) |
| 타임존 | KST (UTC+9) 통일 |
| 배포 | VPS + DuckDNS 도메인 (HTTPS/WSS) |

### 프론트엔드

| 항목 | 내용 |
|------|------|
| 프레임워크 | React 19 + Vite |
| 차트 | Recharts (라인 차트, 레이더 차트, 바 차트) |
| 상태 관리 | React useState / useCallback / useRef |
| 스타일 | Inline CSS (컴포넌트 단위 디자인) |

---

## 디렉토리 구조

```
learner-focus-analyzer/
├── detection/                  # 학습자 PC 감지 클라이언트
│   ├── main.py                 # 메인 감지 루프 (webcam → WebSocket)
│   ├── gaze_estimator.py       # 시선/머리 자세 추정
│   ├── phone_detection.py      # YOLOv8 핸드폰 감지
│   ├── scorer.py               # 집중도 점수 계산
│   ├── colab_sender.py         # Colab GPU 서버 통신
│   ├── ws_sender.py            # WebSocket 전송
│   └── colab_server.ipynb      # Colab 표정 분류 서버 (Google Colab용)
│
├── server/                     # FastAPI 중계 서버
│   ├── main.py                 # WebSocket 중계 + REST API
│   └── database.py             # PostgreSQL 헬퍼
│
├── frontend/                   # 강의자/매니저 프론트엔드
│   └── src/
│       ├── components/
│       │   ├── RealTimeMonitor.jsx     # 실시간 모니터링 대시보드
│       │   ├── TotalEvaluation.jsx     # 총 집중도 평가 리포트
│       │   ├── ManagerDashboard.jsx    # 매니저 대시보드
│       │   ├── SessionStartPage.jsx    # 세션 시작
│       │   ├── Navbar.jsx
│       │   └── NotificationPanel.jsx  # 알림 패널 / 토스트
│       └── App.jsx
│
└── frontend-learner/           # 학습자 전용 프론트엔드
    └── src/
        └── pages/
            ├── MonitorPage.jsx         # 학습자 실시간 집중도 화면
            ├── SessionPage.jsx         # 세션 참여
            └── LoginPage.jsx
```


---

## 측정 지표 설명

| 지표 | 측정 방식 | 의미 |
|------|-----------|------|
| **집중도 점수** | 시선 이탈 + 머리 자세 + 눈 깜빡임 + 표정 종합 | 0~100%, 높을수록 집중 |
| **피로도** | EAR 패턴 + 눈 깜빡임 빈도 | 0~100%, 높을수록 피로 |
| **표정** | RandomForest 5-class 분류 | 집중😊 / 지루함😑 / 혼란😕 / 웃음😄 / 놀람😲 |
| **졸음** | EAR 임계치 연속 하강 감지 | 즉시 알림 발송 |
| **핸드폰** | YOLOv11s confidence 기반 탐지 | 감지 후 5초간 표시 유지 |

---

## 알림 정책

| 알림 유형 | 트리거 조건 | 쿨다운 |
|-----------|-------------|--------|
| 졸음 감지 | 개별 학습자 졸음 상태 전환 | 1분 |
| 핸드폰 감지 | 개별 학습자 핸드폰 사용 | 30초 |
| 전체 집중도 저하 | 평균 집중도 40% 미만 | 2분 |
| 지루함 확산 | 전체의 50% 이상 지루함 표정 | 2분 |
| 피로도 높음 | 전체의 50% 이상 피로도 60 초과 | 2분 |
