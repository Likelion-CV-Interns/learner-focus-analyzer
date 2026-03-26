"""
FastAPI 중계 서버
-----------------
WebSocket 엔드포인트:
  /ws/client/{session_id}/{user_id}   ← detection 클라이언트(개별 PC)
  /ws/dashboard/{session_id}          ← 프론트엔드 관리자 대시보드

REST 엔드포인트:
  GET /api/sessions/{session_id}/records      DB 전체 기록 조회
  GET /api/sessions/{session_id}/snapshot     현재 연결 유저 스냅샷
  GET /api/sessions/{session_id}/summary      유저별 평균 집중도 요약

실행:
  uvicorn main:app --reload --port 8000
"""

import asyncio
import json
import logging
import os
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Optional, Set

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from database import Database

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Focus Analyzer Relay Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

db = Database()

# session_id → set[WebSocket]  (대시보드 연결)
dashboard_ws: Dict[str, Set[WebSocket]] = defaultdict(set)

# session_id → user_id → 최신 데이터 (스냅샷용)
latest: Dict[str, Dict[str, dict]] = defaultdict(dict)

# DB 저장 버퍼: session_id → list[dict]
db_buffer: Dict[str, list] = defaultdict(list)

DB_FLUSH_INTERVAL = 5  # 초

# user_id (UUID str) → {name, birth_date}  — WS 연결 시 빠른 이름 조회용 캐시
users_cache: Dict[str, dict] = {}


def _reload_users_cache():
    global users_cache
    rows = db.list_users()
    users_cache = {row["user_id"]: row for row in rows}


# ── Pydantic 모델 ──────────────────────────────────────────────────────────────

class SessionCreateBody(BaseModel):
    name: str

class UserRegisterBody(BaseModel):
    name: str
    birth_date: str  # "YYYY-MM-DD"

class QuizCreateBody(BaseModel):
    question: str
    options: List[str]       # 4개 선택지
    correct_answer: str      # 정답 (options 중 하나)
    order_num: int = 1

class QuizSubmitBody(BaseModel):
    user_id: str
    answer: str


# ─── 유틸 ─────────────────────────────────────────────────────────────────────

async def broadcast(session_id: str, message: dict):
    """해당 세션의 모든 대시보드 클라이언트에게 메시지 전송"""
    dead: Set[WebSocket] = set()
    payload = json.dumps(message, ensure_ascii=False)
    for ws in list(dashboard_ws[session_id]):
        try:
            await ws.send_text(payload)
        except Exception:
            dead.add(ws)
    dashboard_ws[session_id] -= dead


# ─── WebSocket: detection 클라이언트 ──────────────────────────────────────────

@app.websocket("/ws/client/{session_id}/{user_id}")
async def client_ws(websocket: WebSocket, session_id: str, user_id: str):
    # session_id (UUID) 유효성 확인
    if not db.get_session(session_id):
        await websocket.accept()
        await websocket.close(code=4404, reason="존재하지 않는 세션입니다. /api/sessions 로 먼저 생성하세요.")
        logger.warning(f"[CLIENT 거부] 미등록 session_id={session_id}")
        return

    # user_id (UUID) → 등록된 학습자 정보 조회
    user_info = users_cache.get(user_id)
    if not user_info:
        await websocket.accept()
        await websocket.close(code=4403, reason="미등록 사용자입니다. /api/users 로 먼저 등록하세요.")
        logger.warning(f"[CLIENT 거부] 미등록 user_id={user_id}")
        return

    user_name = user_info["name"]

    await websocket.accept()
    logger.info(f"[CLIENT 연결] session={session_id}  user={user_id}  name={user_name}")

    try:
        while True:
            raw = await websocket.receive_text()
            data: dict = json.loads(raw)

            # 서버 타임스탬프 & 메타 정보 주입
            data["user_id"]    = user_id    # 학습자 UUID (DB 저장용)
            data["name"]       = user_name  # 학습자 이름 (프론트 표시용)
            data["session_id"] = session_id
            data["timestamp"]  = datetime.now().isoformat()
            data["connected"]  = True

            # Colab 필드 기본값 (Colab 꺼져 있을 때도 DB INSERT 가능하도록)
            data.setdefault("head_pitch",       None)
            data.setdefault("head_yaw",         None)
            data.setdefault("emotion",          None)
            data.setdefault("phone_detected",   None)
            data.setdefault("phone_confidence", None)

            # 최신 상태 갱신
            latest[session_id][user_id] = data

            # DB 버퍼
            db_buffer[session_id].append(data)

            # 대시보드로 실시간 브로드캐스트
            await broadcast(session_id, {"type": "user_update", **data})

    except WebSocketDisconnect:
        logger.info(f"[CLIENT 해제] session={session_id}  user={user_id}")
        if user_id in latest[session_id]:
            latest[session_id][user_id]["connected"] = False
        await broadcast(session_id, {
            "type":       "user_disconnect",
            "session_id": session_id,
            "user_id":    user_id,
        })


# ─── WebSocket: 대시보드 ───────────────────────────────────────────────────────

@app.websocket("/ws/dashboard/{session_id}")
async def dashboard_ws_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    logger.info(f"[DASHBOARD 연결] session={session_id}")
    dashboard_ws[session_id].add(websocket)

    # 연결 직후 현재 스냅샷 전송 (새로고침 시 즉시 복원)
    snapshot = {
        "type":       "snapshot",
        "session_id": session_id,
        "users":      latest.get(session_id, {}),
    }
    await websocket.send_text(json.dumps(snapshot, ensure_ascii=False))

    try:
        while True:
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        logger.info(f"[DASHBOARD 해제] session={session_id}")
        dashboard_ws[session_id].discard(websocket)


# ─── REST API ─────────────────────────────────────────────────────────────────

@app.get("/api/sessions/{session_id}/records")
async def get_records(session_id: str, limit: int = 1000):
    records = db.get_records(session_id, limit)
    return {"session_id": session_id, "count": len(records), "records": records}


@app.get("/api/sessions/{session_id}/snapshot")
async def get_snapshot(session_id: str):
    return {"session_id": session_id, "users": latest.get(session_id, {})}


@app.get("/api/sessions/{session_id}/summary")
async def get_summary(session_id: str):
    summary = db.get_user_summary(session_id)
    return {"session_id": session_id, "users": summary}


@app.get("/api/sessions/{session_id}/users/{user_id}/records")
async def get_user_records(session_id: str, user_id: str, limit: int = 500):
    records = db.get_user_records(session_id, user_id, limit)
    return {"session_id": session_id, "user_id": user_id, "count": len(records), "records": records}


# ─── REST API: 세션 관리 ──────────────────────────────────────────────────────

@app.post("/api/sessions", status_code=201)
async def create_session(body: SessionCreateBody):
    """강의 세션을 생성하고 session_id(UUID)를 반환합니다."""
    row = db.create_session(body.name)
    return row


@app.get("/api/sessions")
async def list_sessions():
    return {"sessions": db.list_sessions()}


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="존재하지 않는 세션입니다.")
    return session


# ─── REST API: 학습자 등록 ─────────────────────────────────────────────────────

@app.post("/api/users", status_code=201)
async def register_user(body: UserRegisterBody):
    """
    이름 + 생년월일로 학습자를 등록(또는 조회)합니다.
    같은 이름+생년월일이면 기존 user_id를 반환합니다.
    반환된 user_id를 WebSocket URL에 사용하세요:
      ws://.../ws/client/{session_id}/{user_id}
    """
    row = db.upsert_user(body.name, body.birth_date)
    _reload_users_cache()
    return row


@app.get("/api/users/{user_id}")
async def get_user(user_id: str):
    user = db.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="존재하지 않는 사용자입니다.")
    return user


@app.get("/api/users")
async def list_users():
    return {"users": db.list_users()}


# ─── REST API: 퀴즈 관리 ──────────────────────────────────────────────────────

@app.get("/api/sessions/{session_id}/quizzes")
async def get_quizzes(session_id: str):
    quizzes = db.get_quizzes(session_id)
    return {"session_id": session_id, "quizzes": quizzes}


@app.post("/api/sessions/{session_id}/quizzes", status_code=201)
async def create_quiz(session_id: str, body: QuizCreateBody):
    if not db.get_session(session_id):
        raise HTTPException(status_code=404, detail="존재하지 않는 세션입니다.")
    if body.correct_answer not in body.options:
        raise HTTPException(status_code=400, detail="정답이 선택지에 포함되어 있어야 합니다.")
    quiz = db.create_quiz(session_id, body.question, body.options, body.correct_answer, body.order_num)
    return quiz


@app.delete("/api/sessions/{session_id}/quizzes/{quiz_id}", status_code=204)
async def delete_quiz(session_id: str, quiz_id: str):
    db.delete_quiz(quiz_id)


@app.post("/api/sessions/{session_id}/quizzes/{quiz_id}/submit")
async def submit_quiz(session_id: str, quiz_id: str, body: QuizSubmitBody):
    quizzes = db.get_quizzes(session_id)
    quiz = next((q for q in quizzes if q["quiz_id"] == quiz_id), None)
    if not quiz:
        raise HTTPException(status_code=404, detail="퀴즈를 찾을 수 없습니다.")
    is_correct = body.answer.strip() == quiz["correct_answer"].strip()
    result = db.submit_quiz(session_id, body.user_id, quiz_id, body.answer, is_correct)
    return {"is_correct": result["is_correct"], "correct_answer": quiz["correct_answer"]}


@app.get("/api/sessions/{session_id}/quiz-completion")
async def get_quiz_completion(session_id: str):
    completion = db.get_quiz_completion(session_id)
    return {"session_id": session_id, "completion": completion}


@app.get("/api/sessions/{session_id}/users/{user_id}/quiz-completion")
async def get_user_quiz_completion(session_id: str, user_id: str):
    quizzes   = db.get_quizzes(session_id)
    submitted = db.get_user_quiz_submissions(session_id, user_id)
    submitted_map = {s["quiz_id"]: s for s in submitted}
    total     = len(quizzes)
    correct   = sum(1 for s in submitted if s["is_correct"])
    return {
        "total": total,
        "submitted": len(submitted),
        "correct": correct,
        "completion_rate": round(correct / total * 100) if total else 0,
        "submissions": submitted_map,
    }


# ─── REST API: AI 총평 (Gemini) ────────────────────────────────────────────────

@app.post("/api/sessions/{session_id}/ai-feedback")
async def get_ai_feedback(session_id: str):
    import google.generativeai as genai

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY 환경변수가 설정되지 않았습니다.")

    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="존재하지 않는 세션입니다.")

    records    = db.get_records(session_id, limit=2000)
    summary    = db.get_user_summary(session_id)
    completion = db.get_quiz_completion(session_id)

    if not records:
        raise HTTPException(status_code=400, detail="분석할 데이터가 없습니다.")

    # 집중도/피로도 평균
    focus_scores   = [r["focus_score"]   for r in records if r.get("focus_score")   is not None]
    fatigue_scores = [r["fatigue_score"] for r in records if r.get("fatigue_score") is not None]
    avg_focus   = round(sum(focus_scores)   / len(focus_scores)   * 100) if focus_scores   else 0
    avg_fatigue = round(sum(fatigue_scores) / len(fatigue_scores) * 100) if fatigue_scores else 0

    # 상태 분포
    status_counts = {}
    for r in records:
        s = r.get("status")
        if s: status_counts[s] = status_counts.get(s, 0) + 1
    status_kr = {"focused":"집중","focusing":"집중시작","distracted":"딴짓","drowsy":"졸음","uncertain":"감지중","phone":"핸드폰"}
    status_str = ", ".join(f"{status_kr.get(k,k)} {round(v/len(records)*100)}%" for k,v in sorted(status_counts.items(), key=lambda x:-x[1]))

    # 표정 분포
    emotion_counts = {}
    for r in records:
        e = r.get("emotion")
        if e: emotion_counts[e] = emotion_counts.get(e, 0) + 1
    emotion_kr = {"engagement":"집중","boredom":"지루함","confusion":"혼란","amused":"웃음","surprise":"놀람","neutral":"중립"}
    emotion_total = sum(emotion_counts.values()) or 1
    emotion_str = ", ".join(f"{emotion_kr.get(k,k)} {round(v/emotion_total*100)}%" for k,v in sorted(emotion_counts.items(), key=lambda x:-x[1]))

    # 퀴즈 완료율
    quiz_total = db.get_quizzes(session_id)
    total_quiz_count = len(quiz_total)
    avg_completion = 0
    if completion and total_quiz_count:
        avg_completion = round(sum(c["correct_count"] / total_quiz_count * 100 for c in completion) / len(completion))

    # 수강생 수
    student_count = len(summary)

    prompt = f"""
당신은 교육 전문가 AI입니다. 다음 강의 집중도 데이터를 분석하고 한국어로 강의 총평을 작성해주세요.

[강의 정보]
- 강의명: {session["name"]}
- 참여 학습자 수: {student_count}명
- 분석 데이터 수: {len(records)}개 샘플

[집중도 분석]
- 평균 집중도: {avg_focus}%
- 평균 피로도: {avg_fatigue}%
- 집중 상태 분포: {status_str}

[표정 분석]
- 표정 분포: {emotion_str}

[실습 완료율]
- 평균 퀴즈 완료율: {avg_completion}%

다음 4가지 항목으로 나누어 각 2~3문장으로 작성해주세요:
1. 전반적인 강의 평가
2. 학습자 참여도 분석
3. 개선이 필요한 부분
4. 다음 강의를 위한 학습 전략 제안

각 항목은 "1.", "2.", "3.", "4." 로 시작해주세요. 전문적이지만 친근한 톤으로 작성해주세요.
"""

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.0-flash")
    response = model.generate_content(prompt)
    feedback_text = response.text

    # 항목별 파싱
    import re
    sections = re.split(r'\n(?=\d+\.)', feedback_text.strip())
    return {
        "session_id":      session_id,
        "session_name":    session["name"],
        "avg_focus":       avg_focus,
        "avg_fatigue":     avg_fatigue,
        "avg_completion":  avg_completion,
        "student_count":   student_count,
        "feedback":        sections,
        "raw":             feedback_text,
    }


# ─── 백그라운드: 주기적 DB 저장 ───────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    _reload_users_cache()
    asyncio.create_task(_db_flush_loop())
    logger.info("서버 시작 — users 캐시 로드 완료, DB flush 루프 시작")


async def _db_flush_loop():
    while True:
        await asyncio.sleep(DB_FLUSH_INTERVAL)
        for session_id, records in list(db_buffer.items()):
            if records:
                db.insert_records(records)
                db_buffer[session_id] = []
                logger.info(f"[DB] {session_id}: {len(records)}개 저장 완료")


# ─── 엔트리포인트 ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
